#!/usr/bin/env node
/**
 * Who owns the server on a port — because reusing someone else's is silent.
 *
 * Every capture tool here starts with the same shape:
 *
 *     if (await portOpen(PORT)) return null;   // something is up, reuse it
 *
 * which is right in a single checkout and dangerous the moment agents run in
 * parallel worktrees. If a co-agent's vite is already listening on your `PORT`,
 * you attach to it, and every frame you capture is a photograph of **their**
 * source tree. Nothing errors. The images look fine. They are simply not of
 * your code.
 *
 * That is not hypothetical: a modeling agent lost an hour to it tonight, its
 * first three captures coming back byte-identical after real geometry changes,
 * because the port it had been assigned was still held by an earlier agent's
 * worktree. Byte-identical output after a real change is the *only* symptom, and
 * it reads as "my change did nothing" rather than "I am looking at the wrong
 * tree" — so it sends you to debug code that was never running.
 *
 * `ownerOf` answers it in one call: the working directory of whatever process
 * is listening. `assertOwnPort` turns a mismatch into a loud failure, which is
 * the only safe behaviour — a wrong-tree capture that proceeds quietly is worse
 * than no capture at all.
 *
 * macOS/BSD `lsof`. On a platform without it, both functions degrade to "cannot
 * tell" and callers carry on as before, because a check that cannot run must not
 * become a check that always fails.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** Where the process listening on `port` is running, or null if unknowable. */
export function ownerOf(port: number): string | null {
  try {
    const pid = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0];
    if (!pid) return null;
    // `-Fn` prints one field per line, each tagged; the cwd line starts with 'n'.
    const out = execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const line = out.split('\n').find((l) => l.startsWith('n'));
    return line ? line.slice(1) : null;
  } catch {
    return null;                       // no lsof, no permission, nothing listening
  }
}

/**
 * Refuse to reuse a server that belongs to a different checkout.
 *
 * @param port the port about to be reused
 * @param root this tool's own repository root
 * @throws if the listener is demonstrably somewhere else
 */
export function assertOwnPort(port: number, root: string): void {
  const owner = ownerOf(port);
  if (!owner) return;                  // unknowable, or nothing there: proceed
  const a = path.resolve(owner), b = path.resolve(root);
  if (a === b) return;
  throw new Error(
    `port ${port} is already served from a different tree.\n`
    + `  listening from : ${a}\n`
    + `  you are in     : ${b}\n`
    + 'Reusing it would capture that tree\'s code, not yours, and the frames would\n'
    + 'look completely normal. Pick another PORT (each worktree owns one, and the\n'
    + 'capture daemon takes PORT+1), or stop the other server.'
  );
}

/**
 * A port this tool may use: the preferred one if it is free or already ours,
 * otherwise the next such port upward.
 *
 * An explicit `PORT` in the environment always wins — that is a human or a
 * harness making a deliberate choice, and `assertOwnPort` will still refuse it
 * if it belongs to somebody else. This only decides the *default*.
 *
 * It exists because the defaults were hand-picked per tool (5173, 5178, 5199,
 * 5299, 5321) at a time when one checkout ran one tool. With agents in parallel
 * worktrees those are just five more numbers that can collide, and one did:
 * `combatloop`'s 5199 was held by a co-agent, so the gate refused to reuse a
 * foreign tree — correctly — and `npm run check` reported a combat regression
 * that did not exist. The refusal was right; the fixed number was the bug.
 *
 * Synchronous on purpose: every caller uses it in a module-level `const`.
 *
 * @param preferred the tool's historical default
 * @param root this tool's repository root
 */
export function resolvePort(preferred: number, root: string): number {
  const env = Number(process.env.PORT);
  if (env) return env;
  for (let p = preferred; p < preferred + 200; p += 1) {
    const owner = ownerOf(p);
    // free, unknowable (no lsof), or already this checkout's — all usable.
    if (!owner || path.resolve(owner) === path.resolve(root)) return p;
  }
  return preferred;                    // nothing free: let the caller fail loudly
}
