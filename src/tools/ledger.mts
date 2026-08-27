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
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, createReadStream } from 'node:fs';
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
  verdict: 'ok' | 'error' | 'deadline';
  /** Who held the exclusive lease when this was enqueued, if anyone. */
  holder?: string | null;
  /** Jobs queued or running ahead of this one at enqueue. */
  ahead?: number;
  /** Pool boots/reuses at completion — cumulative, so a delta is a rate. */
  boots?: number;
  reuses?: number;
  /** Resident set of the browser this job ran on, MB. See `/health`. */
  rssMb?: number;
  /** Anything the route wants attributed: shot count, gate verdict, error head. */
  note?: string;
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
