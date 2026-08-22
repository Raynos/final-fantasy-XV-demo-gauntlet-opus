#!/usr/bin/env node
/**
 * Kill orphaned dev servers and headless browsers left behind by this project.
 *
 *   node src/tools/cleanup.mts          # list what it would kill
 *   node src/tools/cleanup.mts --kill   # actually kill it
 *
 * The capture tools spawn a vite server and kill it on exit, so a healthy run
 * leaves nothing. Two things do leak:
 *   - a server started from a detached subshell — `(npx vite &)` reparents to
 *     PID 1 and then outlives the session,
 *   - a playwright browser whose driving node process died mid-run.
 *
 * Anything whose parent is still alive is left alone: a long-lived vite on an
 * agent's port is almost certainly that agent still working.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const KILL = process.argv.includes('--kill');
const ps = execSync('ps -Ao pid,ppid,etime,rss,args', { encoding: 'utf8' }).split('\n').slice(1);

const rows = ps.map((l) => {
  const m = l.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/);
  return m ? { pid: +m[1], ppid: +m[2], etime: m[3], rss: +m[4], args: m[5] } : null;
}).filter(Boolean);

const alive = new Set(rows.map((r) => r!.pid));
const isOurs = (r: any) => /final-fantasy-XV-demo-gauntlet/.test(r.args) || /vite --port 52\d\d/.test(r.args);

/**
 * A vite server reparented to PID 1 is not automatically dead weight: agents
 * start theirs detached too, and one still serving a working agent must not be
 * killed. So a server is only an orphan if nothing else alive belongs to the
 * same worktree — no `node src/tools/…` run, no child vite process of its own.
 */
const worktreeOf = (args: any) => (args.match(/worktrees\/(agent-[a-z0-9]+)/) || [])[1] || 'main';
const liveWorktrees = new Set(
  rows.filter((r) => /node .*tools\/(shoot|perf|gameplay|attrib|sheet)\.mts/.test(r!.args))
    .map((r) => worktreeOf(r!.args))
);
// a server whose own child node process is alive is mid-serve, not abandoned

/** Worktree directory gone from disk => the agent that owned it is finished. */
const worktreeGone = (tag: any) => tag !== 'main'
  && !existsSync(path.join(ROOT, '.claude', 'worktrees', tag));

const candidates = rows.filter((r) => r!.ppid === 1 && isOurs(r) && /npm exec vite/.test(r!.args));
const orphanServers: any[] = [];
for (const r of candidates) {
  // inherit the worktree tag from the child, which carries the resolved path
  const child = rows.find((c) => c!.ppid === r!.pid);
  const tag = worktreeOf(child ? child.args : r!.args);
  const busy = liveWorktrees.has(tag);
  // "certain" only if nothing in that worktree is running and either the
  // worktree is gone or it has sat idle for hours. Killing a live agent's
  // server would break its next capture, so anything else is reported only.
  const hours = /(\d+):(\d\d):(\d\d)/.test(r!.etime) ? Number(r!.etime.split(':')[0]) : 0;
  if (busy) continue;
  (r as any).certain = worktreeGone(tag) || hours >= 3;
  (r as any).tag = tag;
  orphanServers.push(r);
}
const orphanBrowsers = rows.filter((r) =>
  /chrome-headless-shell|chromium/i.test(r!.args) && !alive.has(r!.ppid) && r!.ppid !== 1);

const targets = [...orphanServers, ...orphanBrowsers];

if (!targets.length) {
  console.log('clean — no orphaned servers or browsers');
  process.exit(0);
}

let mb = 0;
for (const t of targets) {
  mb += t!.rss / 1024;
  const kind = /vite/.test(t!.args) ? 'vite  ' : 'browser';
  const conf = t!.certain === false ? 'IDLE?  ' : 'ORPHAN ';
  console.log(`${conf}${kind} pid ${String(t!.pid).padStart(6)}  up ${t!.etime.padStart(11)}  ${String(Math.round(t!.rss / 1024)).padStart(5)} MB  ${(t!.tag || '').padEnd(24)}`);
}
console.log(`\n${targets.length} orphan(s), ${Math.round(mb)} MB`);

const sure = targets.filter((t) => t!.certain !== false);
const maybe = targets.filter((t) => t!.certain === false);
if (maybe.length) {
  console.log(`\n${maybe.length} marked IDLE? — a live agent may still own them; `
    + 'pass --force to include them.');
}
if (!KILL) { console.log('\nre-run with --kill to terminate the ORPHAN entries'); process.exit(0); }

const doomed = process.argv.includes('--force') ? targets : sure;
for (const t of doomed) {
  try { execSync(`pkill -TERM -P ${t!.pid}`, { stdio: 'ignore' }); } catch { /* no children */ }
  try { process.kill(t!.pid, 'SIGTERM'); } catch { /* already gone */ }
}
console.log(`terminated ${doomed.length} process(es)`);
