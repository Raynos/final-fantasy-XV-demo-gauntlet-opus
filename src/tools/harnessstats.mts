#!/usr/bin/env node
/**
 * Where the harness's wall-clock actually went — from the daemon's own ledger.
 *
 *   node src/tools/harnessstats.mts                # the last 24 h, by tool
 *   node src/tools/harnessstats.mts --since 7d     # a week
 *   node src/tools/harnessstats.mts --by agent     # whose wait was it
 *   node src/tools/harnessstats.mts --by day
 *   node src/tools/harnessstats.mts --slow 30      # the calls over 30 s, named
 *   node src/tools/harnessstats.mts --json
 *
 * **The weekly audit used to be two hours of transcript archaeology.**
 * `project/audits/2026-08-27-wallclock-7day.md` had to pair 22 808 tool_use /
 * tool_result messages across 203 jsonl files and 2.1 GB to answer one
 * question: how much of the week was queue wait, and whose? The daemon knew the
 * answer all along and wrote it nowhere — `stdio: 'ignore'` on autostart, no
 * ledger, and a silent HTTP block whenever a request queued.
 *
 * It now writes one line per job (`ledger.mts`), and this reads them. The
 * transcript-side scripts in `project/audits/` stay as the cross-check: they see
 * what the *model* spent, this sees what the *machine* spent, and the two
 * disagreeing is itself a finding.
 *
 * WAIT AND RUN ARE DIFFERENT PROBLEMS AND THE TABLE KEEPS THEM APART. A tool
 * that is slow because four browsers are busy needs scheduling; one that is
 * slow because it renders 142 shots needs a faster renderer. Reporting a single
 * "duration" column is what let `check` grow 9 -> 13 minutes with everybody
 * watching gates pass.
 */
import { readJobs, ledgerPath } from './ledger.mts';
import type { JobRecord } from './ledger.mts';

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const val = (f: string, d: string) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};

/** `90m`, `24h`, `7d` — the same vocabulary `agentstats.mts` takes. */
function parseSince(s: string): number {
  const m = /^(\d+(?:\.\d+)?)([mhd])$/.exec(s.trim());
  if (!m) throw new Error(`--since wants 90m / 24h / 7d, got ${JSON.stringify(s)}`);
  const mult = { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 'm' | 'h' | 'd'];
  return Date.now() - Number(m[1]) * mult;
}

const since = parseSince(val('--since', '24h'));
const by = val('--by', 'kind') as 'kind' | 'agent' | 'day' | 'lane';
const slowSec = Number(val('--slow', '0'));

const jobs = await readJobs(since);
if (!jobs.length) {
  console.log(`no jobs in the ledger since ${val('--since', '24h')} ago (${ledgerPath()})`);
  console.log('the daemon writes one line per job; if this is empty, nothing has run.');
  process.exit(0);
}

const keyOf = (j: JobRecord): string => {
  if (by === 'agent') return j.agent || 'anon';
  if (by === 'lane') return j.lane || '?';
  if (by === 'day') return j.t.slice(0, 10);
  return j.kind || '?';
};

interface Row {
  key: string; n: number; queuedMs: number; ranMs: number;
  /** The harness broke. Counted apart from `fails`, which is the suite working. */
  errors: number;
  /** A gate ran correctly and said no. Not a fault, and it must not read as one. */
  fails: number;
  deadlines: number; worstQueue: number; queues: number[];
}
const rows = new Map<string, Row>();
for (const j of jobs) {
  const k = keyOf(j);
  const r = rows.get(k) ?? { key: k, n: 0, queuedMs: 0, ranMs: 0, errors: 0, fails: 0, deadlines: 0, worstQueue: 0, queues: [] };
  r.n++;
  r.queuedMs += j.queuedMs;
  r.ranMs += j.ranMs;
  r.queues.push(j.queuedMs);
  if (j.queuedMs > r.worstQueue) r.worstQueue = j.queuedMs;
  if (j.verdict === 'error') r.errors++;
  if (j.verdict === 'fail' || j.verdict === 'void' || j.verdict === 'busy') r.fails++;
  if (j.verdict === 'deadline') r.deadlines++;
  rows.set(k, r);
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

const totalQueued = jobs.reduce((a, j) => a + j.queuedMs, 0);
const totalRan = jobs.reduce((a, j) => a + j.ranMs, 0);

if (has('--json')) {
  console.log(JSON.stringify({
    since: new Date(since).toISOString(),
    jobs: jobs.length,
    queuedSec: Math.round(totalQueued / 1000),
    ranSec: Math.round(totalRan / 1000),
    rows: [...rows.values()].map((r) => ({
      key: r.key, n: r.n,
      queuedSec: Math.round(r.queuedMs / 1000), ranSec: Math.round(r.ranMs / 1000),
      p50QueueMs: pct(r.queues, 50), p90QueueMs: pct(r.queues, 90), worstQueueMs: r.worstQueue,
      errors: r.errors, fails: r.fails, deadlines: r.deadlines,
    })),
  }, null, 2));
  process.exit(0);
}

const mins = (ms: number) => (ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`);

const totalErrors = [...rows.values()].reduce((a, r) => a + r.errors, 0);
const totalFails = [...rows.values()].reduce((a, r) => a + r.fails, 0);

console.log(`\n${jobs.length} jobs since ${new Date(since).toISOString().replace('T', ' ').slice(0, 16)}`
  + `  ·  waited ${mins(totalQueued)}  ·  ran ${mins(totalRan)}`
  + `  ·  ${totalQueued + totalRan ? Math.round((100 * totalQueued) / (totalQueued + totalRan)) : 0}% of it was queue`);
/**
 * The fault rate, stated once and plainly, because it is the number that says
 * whether the harness itself is healthy -- and it is separate from `red`, which
 * says whether the TREE is healthy. Folding the two together read as "4.5% of
 * jobs errored" on an evening whose real fault rate was 0.7%.
 */
console.log(`  ${totalErrors} harness fault(s) (${jobs.length ? ((100 * totalErrors) / jobs.length).toFixed(2) : '0.00'}%)`
  + `  ·  ${totalFails} red verdict(s), which are the suite working\n`);

console.log(`  ${by.padEnd(16)}${'n'.padStart(6)}${'wait'.padStart(9)}${'run'.padStart(9)}`
  + `${'p50q'.padStart(8)}${'p90q'.padStart(8)}${'worstq'.padStart(9)}   notes`);
for (const r of [...rows.values()].sort((a, b) => (b.queuedMs + b.ranMs) - (a.queuedMs + a.ranMs)).slice(0, 24)) {
  const notes = [r.errors ? `${r.errors} err` : '', r.fails ? `${r.fails} red` : '',
    r.deadlines ? `${r.deadlines} 429` : ''].filter(Boolean).join(', ');
  console.log(`  ${r.key.slice(0, 15).padEnd(16)}${String(r.n).padStart(6)}`
    + `${mins(r.queuedMs).padStart(9)}${mins(r.ranMs).padStart(9)}`
    + `${mins(pct(r.queues, 50)).padStart(8)}${mins(pct(r.queues, 90)).padStart(8)}`
    + `${mins(r.worstQueue).padStart(9)}   ${notes}`);
}

/**
 * The calls a reader would otherwise have to grep the transcripts for.
 *
 * A tool over the threshold is exactly the row where "was it queued or was it
 * expensive?" changes what you do next, so it is printed with both halves.
 */
if (slowSec > 0) {
  const slow = jobs.filter((j) => j.queuedMs + j.ranMs >= slowSec * 1000)
    .sort((a, b) => (b.queuedMs + b.ranMs) - (a.queuedMs + a.ranMs)).slice(0, 20);
  console.log(`\n  ${slow.length} call(s) over ${slowSec} s:`);
  for (const j of slow) {
    console.log(`  ${j.t.slice(11, 19)}  ${j.kind.padEnd(10)}${j.agent.slice(0, 14).padEnd(15)}`
      + `wait ${mins(j.queuedMs).padStart(7)}  run ${mins(j.ranMs).padStart(7)}`
      + `${j.holder ? `  behind ${j.holder}` : j.ahead ? `  ${j.ahead} ahead` : ''}`);
  }
}

const rss = jobs.map((j) => j.rssMb).filter((n): n is number => typeof n === 'number' && n > 0);
if (rss.length) {
  console.log(`\n  chromium RSS across the window: p50 ${pct(rss, 50)} MB · p90 ${pct(rss, 90)} MB `
    + `· peak ${Math.max(...rss)} MB (whole pool, all slots)`);
}
console.log(`\n  ledger: ${ledgerPath()}\n`);
