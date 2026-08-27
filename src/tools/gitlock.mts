#!/usr/bin/env node
/**
 * git, but the index lock has a queue.
 *
 *   node src/tools/gitlock.mts commit -m "..." -- src/a.ts src/b.ts
 *   node src/tools/gitlock.mts add src/new.ts
 *   node src/tools/gitlock.mts --wait            # just block until it is free
 *
 * **Why this exists.** `project/audits/2026-08-27-wallclock-7day.md` names git
 * as the second half's single biggest tool sink: **264 minutes over 262 calls,
 * ~60 s average, against a 1.4 s pre-commit gate.** That gap is not the gate.
 * It is agents on one shared trunk colliding on `.git/index.lock`, which is a
 * queue with no queue — git does not wait, it fails with
 *
 *     fatal: Unable to create '.../.git/index.lock': File exists.
 *
 * and does not say who has it. So every lane invented its own spin loop
 * (`for i in $(seq 1 60); do [ -f .git/index.lock ] || break; sleep 10; done`),
 * and one 94-minute `git reset --hard` sat inside one of them.
 *
 * The daemon fixed exactly this class of problem for browsers by making the
 * contention visible and queueable. This is the same move for the index: **wait
 * with capped backoff, name the pid holding it, and then run the command.**
 *
 * ## It does not weaken the pathspec rule
 *
 * `CLAUDE.md`: commit with an explicit pathspec, `git add` only NEW files, and
 * a hook blocks `git add -A` / `git commit -am` / a bare `git commit`. This
 * wrapper `execFileSync`s straight through to git with the arguments you gave
 * it, so those hooks still see the command they are guarding. It buys you the
 * lock, nothing else.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './identity.mts';

/** `.git` is a *file* in a worktree, pointing at the real gitdir. */
function gitDir(): string {
  try {
    const d = execFileSync('git', ['rev-parse', '--git-dir'], { cwd: ROOT, encoding: 'utf8' }).trim();
    return path.resolve(ROOT, d);
  } catch { return path.join(ROOT, '.git'); }
}

const lockPath = (): string => path.join(gitDir(), 'index.lock');

/**
 * Who is holding the lock, as specifically as the OS will say.
 *
 * `lsof` names the process that has the file open, which is the honest answer.
 * When nothing has it open the lock is **stale** — a crashed or killed git left
 * it behind — and that is worth saying differently, because waiting for a stale
 * lock is waiting forever.
 */
function holder(): { pid: number, cmd: string, ageSec: number } | null {
  const f = lockPath();
  if (!existsSync(f)) return null;
  const ageSec = Math.round((Date.now() - statSync(f).mtimeMs) / 1000);
  const r = spawnSync('lsof', ['-t', f], { encoding: 'utf8' });
  const pid = Number((r.stdout || '').split('\n')[0]);
  if (!pid) return { pid: 0, cmd: '', ageSec };
  const ps = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
  return { pid, cmd: (ps.stdout || '').trim().slice(0, 90), ageSec };
}

const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

/**
 * Block until the index lock is free, with capped exponential backoff.
 *
 * Backoff rather than a flat interval because the distribution is bimodal:
 * most collisions are another lane's 1.4 s pre-commit and clear on the first
 * retry, and the rest are somebody's multi-minute gate. A flat 10 s interval —
 * which is what the hand-written loops used — pays ten seconds for the common
 * case and still polls forty times for the rare one.
 *
 * @returns true if the lock is free
 */
export async function waitForIndex(maxMs = 180_000): Promise<boolean> {
  const started = Date.now();
  let delay = 60;
  let announced = false;
  for (;;) {
    const h = holder();
    if (!h) {
      if (announced) console.log(`[gitlock] index free after ${((Date.now() - started) / 1000).toFixed(1)} s`);
      return true;
    }
    if (!announced) {
      announced = true;
      const who = h.pid
        ? `pid ${h.pid}${h.cmd ? ` (${h.cmd})` : ''}`
        : `NOBODY — the lock is ${h.ageSec} s old and no process has it open, so it is stale`;
      console.log(`[gitlock] .git/index.lock held by ${who}; waiting up to ${Math.round(maxMs / 1000)} s`);
      if (!h.pid) {
        console.log('[gitlock] a stale lock never clears on its own. If you are certain no git is');
        console.log(`[gitlock] running, remove it: rm ${lockPath()}`);
      }
    }
    if (Date.now() - started > maxMs) {
      const who = h.pid ? `pid ${h.pid}` : 'nothing (stale)';
      console.error(`[gitlock] gave up after ${Math.round(maxMs / 1000)} s; still held by ${who}`);
      return false;
    }
    await sleep(delay);
    delay = Math.min(delay * 2, 2_000);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === '--help') {
    console.log('usage: node src/tools/gitlock.mts <git args...>   |   --wait');
    process.exit(argv.length ? 0 : 1);
  }
  const ok = await waitForIndex();
  if (!ok) process.exit(1);
  if (argv[0] === '--wait') process.exit(0);
  /**
   * Straight through to git, stdio inherited.
   *
   * Inherited rather than captured so the pre-commit hook's output, the
   * doc-budget warnings and git's own errors reach the caller exactly as they
   * would without this wrapper. A wrapper that swallows the gate it is running
   * through is worse than no wrapper.
   */
  const r = spawnSync('git', argv, { cwd: ROOT, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
