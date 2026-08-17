#!/usr/bin/env node
/**
 * Kill orphaned dev servers and headless browsers left behind by this project.
 *
 *   node tools/cleanup.mjs          # list what it would kill
 *   node tools/cleanup.mjs --kill   # actually kill it
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

const KILL = process.argv.includes('--kill');
const ps = execSync('ps -Ao pid,ppid,etime,rss,args', { encoding: 'utf8' }).split('\n').slice(1);

const rows = ps.map((l) => {
  const m = l.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/);
  return m ? { pid: +m[1], ppid: +m[2], etime: m[3], rss: +m[4], args: m[5] } : null;
}).filter(Boolean);

const alive = new Set(rows.map((r) => r.pid));
const isOurs = (r) => /final-fantasy-XV-demo-gauntlet/.test(r.args) || /vite --port 52\d\d/.test(r.args);

const orphanServers = rows.filter((r) => r.ppid === 1 && isOurs(r) && /vite/.test(r.args));
const orphanBrowsers = rows.filter((r) =>
  /chrome-headless-shell|chromium/i.test(r.args) && !alive.has(r.ppid) && r.ppid !== 1);

const targets = [...orphanServers, ...orphanBrowsers];

if (!targets.length) {
  console.log('clean — no orphaned servers or browsers');
  process.exit(0);
}

let mb = 0;
for (const t of targets) {
  mb += t.rss / 1024;
  const kind = /vite/.test(t.args) ? 'vite  ' : 'browser';
  console.log(`${kind} pid ${String(t.pid).padStart(6)}  up ${t.etime.padStart(11)}  ${String(Math.round(t.rss / 1024)).padStart(5)} MB  ${t.args.slice(0, 70)}`);
}
console.log(`\n${targets.length} orphan(s), ${Math.round(mb)} MB`);

if (!KILL) { console.log('\nre-run with --kill to terminate'); process.exit(0); }

for (const t of targets) {
  try { execSync(`pkill -TERM -P ${t.pid}`, { stdio: 'ignore' }); } catch { /* no children */ }
  try { process.kill(t.pid, 'SIGTERM'); } catch { /* already gone */ }
}
console.log(`terminated ${targets.length} orphan(s)`);
