#!/usr/bin/env node
/**
 * One line per harness job, appended by the daemon, read by `harnessstats.mts`.
 *
 * **Why this exists.** `project/audits/2026-08-27-wallclock-7day.md` needed two
 * hours of transcript archaeology to answer "how much of last week was queue
 * wait, and whose?" — because the daemon wrote *nothing* down. Its autostart
 * used `stdio: 'ignore'`, so every queue and lease decision it logged went to a
 * closed pipe, and a slow tool call could not say why it was slow. Agents then
 * polled `/health` (280 calls, 104 min in a week) to guess at the state the
 * daemon already knew.
 *
 * So the daemon is the chokepoint everything already goes through: make it the
 * single source of timing truth. Every job records what it waited for and what
 * it cost, in a file that is free to delete and costs a few hundred bytes a
 * call.
 *
 * ROTATION IS ONE GENERATION, NOT MANY. `jobs.jsonl` -> `jobs.1.jsonl` at 10 MB
 * (~50 k jobs, several weeks) and the old generation is overwritten. A ledger
 * that grows without bound is a ledger somebody eventually deletes wholesale,
 * which loses the recent history along with the ancient.
 *
 * NOTHING HERE MAY THROW. It runs inside the daemon's hot path; a full disk or
 * a cache directory somebody deleted mid-run must cost a lost line, never a
 * failed capture.
 */
import { appendFileSync, closeSync, createReadStream, existsSync, mkdirSync, openSync, readSync, renameSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { repoCacheDir } from './identity.mts';

/** Rotate at 10 MB — roughly 50 000 jobs, or several weeks of this machine. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * A finished job, as one line of JSONL.
 *
 * Keys are short because the file is written on every capture and read whole;
 * the reader is the only consumer and it is in this repo.
 */
export interface JobRecord {
  /** ISO time the job finished — the only human-readable field, for `grep`. */
  t: string;
  /** Route or activity: `shots`, `eval`, `lease`, `exclusive`, `prewarm`, `gate:<name>`. */
  kind: string;
  agent: string;
  lane: string;
  /** Short build identity (`sha:abc123…` / `dirty:root`). */
  build: string;
  /** Milliseconds between enqueue and the worker picking it up. */
  queuedMs: number;
  /** Milliseconds the job actually ran. */
  ranMs: number;
  /**
   * What happened to the JOB, which is not the same question as what the gate
   * decided.
   *
   * `fail` was originally folded into `error`, and it made the ledger's error
   * rate unreadable: of 80 `error` rows in the first evening of ledger, **23
   * were a gate returning FAIL and 5 returning VOID** -- runs that worked
   * perfectly and reported bad news -- against about a dozen genuine harness
   * faults. "4.5% of jobs errored" was really "0.7% errored and the rest were
   * the suite doing its job on a tree that was mid-repair".
   *
   * - `ok`       the job ran and the thing it checked was fine.
   * - `fail`     the job ran correctly and returned a red verdict. NOT an error.
   * - `void`     the job could not measure (its oracle was unreadable).
   * - `busy`     the machine was somebody else's; nothing was measured.
   * - `error`    the job itself broke: a closed page, a protocol fault, a crash.
   * - `deadline` the queue gave up on it.
   */
  verdict: 'ok' | 'fail' | 'void' | 'busy' | 'error' | 'deadline';
  /** Who held the exclusive lease when this was enqueued, if anyone. */
  holder?: string | null;
  /** Jobs queued or running ahead of this one at enqueue. */
  ahead?: number;
  /** Pool boots/reuses at completion — cumulative, so a delta is a rate. */
  boots?: number;
  reuses?: number;
  /** Resident set of the browser this job ran on, MB. See `/health`. */
  rssMb?: number;
  /**
   * How many items the job covered — shots posed, for `/shots`.
   *
   * A duration means nothing without the count of work it covers, and this
   * ledger has one `kind: 'shots'` for both a single `shoot` and a 16-shot
   * `drawcheck` chunk. Reporting the median over that mixed population is how
   * "median shoot" came out at 22.6 s against a target of 8 when a real `shoot`
   * was 8.0 s and a warm one is 1 s.
   */
  units?: number;
  /** Anything the route wants attributed: gate verdict, error head. */
  note?: string;
  /**
   * The machine's power state when this was recorded: `ac`, `battery`, `low`.
   *
   * A laptop changes speed underneath a measurement, and nothing here knew.
   * An evening of A/B runs produced a parallelism sweep of 263/226/239 s and a
   * conclusion; the machine was on battery for part of it and a 16% spread is
   * inside what unplugging accounts for. See `power.mts`.
   */
  power?: string;
}

export const ledgerPath = (): string => path.join(repoCacheDir(), 'jobs.jsonl');

/**
 * Where an autostarted daemon's stdout goes.
 *
 * Beside the ledger, not in `tmp/`: `CLAUDE.md`'s rule is that deleting `tmp/`
 * whole must cost nothing, and a *detached* daemon holding an open fd into a
 * directory an agent may delete is exactly the shape that breaks that promise.
 */
export const daemonLogPath = (): string => path.join(repoCacheDir(), 'daemon.log');

let writes = 0;

/**
 * Append one job. Never throws, never blocks on anything but the write.
 *
 * Sync rather than a stream on purpose: the records are ~200 bytes, they arrive
 * at most a few per second, and a stream would need lifecycle management inside
 * a process whose whole job is to outlive its clients.
 */
export function appendJob(rec: JobRecord): void {
  try {
    const file = ledgerPath();
    if ((writes++ & 31) === 0) rotate(file);
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(rec)}\n`);
  } catch { /* a ledger line is never worth failing a capture for */ }
}

function rotate(file: string): void {
  try {
    if (!existsSync(file) || statSync(file).size < MAX_BYTES) return;
    renameSync(file, `${file.replace(/\.jsonl$/, '')}.1.jsonl`);
  } catch { /* ignore */ }
}

/**
 * The tail of the ledger, synchronously, for a hint that must not cost anything.
 *
 * `announceBuild()` wants "how long does this tool usually take" *before* the
 * tool does anything, which rules out both the async reader and reading 10 MB.
 * So: open, seek to the last chunk, drop the partial first line, parse. A
 * bounded read of the end of an append-only file is the cheapest correct thing
 * available, and a hint that is occasionally computed from 200 records instead
 * of 2 000 is still a hint.
 */
export function tailJobsSync(bytes = 256 * 1024): JobRecord[] {
  const out: JobRecord[] = [];
  let fd: number | null = null;
  try {
    const file = ledgerPath();
    if (!existsSync(file)) return out;
    const size = statSync(file).size;
    const from = Math.max(0, size - bytes);
    const buf = Buffer.alloc(Math.min(size, bytes));
    fd = openSync(file, 'r');
    readSync(fd, buf, 0, buf.length, from);
    const lines = buf.toString('utf8').split('\n');
    // The first line is a fragment unless the read started at byte zero.
    if (from > 0) lines.shift();
    for (const line of lines) {
      if (!line) continue;
      try { out.push(JSON.parse(line) as JobRecord); } catch { /* torn line */ }
    }
  } catch { /* ignore */ } finally { if (fd !== null) try { closeSync(fd); } catch { /* ignore */ } }
  return out;
}

/** How long past runs of `tool` took, milliseconds, newest last. */
export function recentToolRuns(tool: string, limit = 25): number[] {
  return tailJobsSync()
    .filter((j) => j.kind === `tool:${tool}` && j.ranMs > 0)
    .slice(-limit)
    .map((j) => j.ranMs);
}

/**
 * Read the ledger back, newest generation last, streaming.
 *
 * Streams rather than `readFileSync` because the file is 10 MB by design and
 * the reader is a tool an agent runs in its own context — the whole point of
 * `harnessstats` is that it answers in one bounded table instead of 2 h of
 * archaeology, and it must not pay 10 MB to do it.
 */
export async function readJobs(sinceMs = 0): Promise<JobRecord[]> {
  const out: JobRecord[] = [];
  const base = ledgerPath();
  for (const f of [`${base.replace(/\.jsonl$/, '')}.1.jsonl`, base]) {
    if (!existsSync(f)) continue;
    const rl = createInterface({ input: createReadStream(f, 'utf8'), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line) continue;
      let rec: JobRecord;
      try { rec = JSON.parse(line) as JobRecord; } catch { continue; }
      if (sinceMs && Date.parse(rec.t) < sinceMs) continue;
      out.push(rec);
    }
  }
  return out;
}
