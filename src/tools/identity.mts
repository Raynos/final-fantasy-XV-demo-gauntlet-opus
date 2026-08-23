#!/usr/bin/env node
/**
 * Who this repository is, where its daemon lives, and which build a request is
 * about. Decision 3 of `docs/plans/2026-08-21-opus-harness-daemon.md`.
 *
 *   node src/tools/identity.mts        # print everything, for a handoff or a bug report
 *
 * WHY A REPO KEY AND NOT A CHECKOUT PATH. The old daemon was scoped to a
 * checkout: `ensureDaemon()` refused a daemon serving a different root, and
 * `CLAUDE.md` told every worktree to pick its own `PORT`. That is one daemon,
 * one vite and one browser pool *per checkout*, so a perfect per-daemon cap of
 * four still put twelve chromiums on one GPU when three agents were live. **A
 * browser budget is a property of the machine, so the process that owns it must
 * be too** — and a per-checkout daemon can never see the whole machine.
 *
 * Keying off the remote rather than the path is what makes that possible: every
 * checkout of this game — the trunk, a worktree, a clone somewhere else —
 * resolves to the same key and therefore the same daemon, and a *different*
 * repository resolves to a different one. The old different-root refusal
 * (`daemon.mts`, "silently reusing it captures the other repo's build, which
 * has already produced at least one false result") is not weakened by this; it
 * is moved to where it belongs. Cross-repo contamination is caught by the key,
 * and cross-*build* contamination — the thing that actually produced the false
 * result — is caught by making the build part of page identity.
 *
 * NOBODY PICKS A PORT. The daemon port is derived from the key, so the trap
 * `CLAUDE.md` and RESCUE both warn about — aiming a tool at the daemon's port
 * and hanging for the full 300 s — stops being something a human can get wrong.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function git(args: string[], cwd = ROOT): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}

/**
 * `git@github.com:Raynos/foo.git` and `https://github.com/Raynos/foo` are the
 * same repository, so they must produce the same key. Scheme, credentials, port
 * and the `.git` suffix all vary between how two people cloned it and none of
 * them say anything about identity.
 */
export function normaliseRemote(url: string): string {
  let s = url.trim();
  s = s.replace(/^[a-z+]+:\/\//i, '');           // https:// , ssh:// , git+ssh://
  s = s.replace(/^[^@/]+@/, '');                  // git@ , user:pass@
  s = s.replace(/:(?=\D)/, '/');                  // scp form host:path -> host/path
  s = s.replace(/:\d+\//, '/');                   // ssh://host:22/path
  s = s.replace(/\.git$/i, '').replace(/\/+$/, '');
  return s.toLowerCase();
}

/**
 * The identity every harness process agrees on.
 *
 * Falls back to the common git dir for a clone with no remote — realpath'd, so
 * a symlinked checkout does not look like a second repository. A remoteless
 * clone is then correctly scoped to itself, which is the conservative answer.
 */
export function repoKey(): string {
  const remote = git(['config', '--get', 'remote.origin.url']);
  if (remote) return normaliseRemote(remote);
  const common = git(['rev-parse', '--git-common-dir']);
  const abs = common ? path.resolve(ROOT, common) : ROOT;
  try { return realpathSync(abs); } catch { return abs; }
}

export function keyHash(key = repoKey()): string {
  return createHash('sha1').update(key).digest('hex').slice(0, 12);
}

/**
 * A stable port per repository, in the ephemeral range and away from vite's.
 *
 * A collision between two *different* repositories is possible and harmless:
 * the client compares the key it finds against its own and probes the next port
 * on a mismatch, so the worst case is a second daemon one port over.
 */
export function derivedPort(key = repoKey()): number {
  const n = parseInt(createHash('sha1').update(key).digest('hex').slice(0, 8), 16);
  return 20000 + (n % 20000);
}

// ------------------------------------------------------------- the cache root

export const cacheRoot = (): string => process.env.HARNESS_CACHE_DIR
  || path.join(homedir(), '.cache', 'ffxv-harness');

/** Everything this repo's daemon owns on disk: the registry, trees, frames. */
export const repoCacheDir = (key = repoKey()): string => path.join(cacheRoot(), keyHash(key));

export const registryPath = (key = repoKey()): string => path.join(cacheRoot(), `${keyHash(key)}.json`);

/** What a running daemon advertises about itself. */
export interface Registry {
  port: number;
  pid: number;
  key: string;
  protocol: number;
  started: string;
  /** The checkout that happened to start it. Informational only — it does not own it. */
  startedFrom: string;
}

export function readRegistry(key = repoKey()): Registry | null {
  const f = registryPath(key);
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, 'utf8')) as Registry; } catch { return null; }
}

export function writeRegistry(r: Registry): void {
  mkdirSync(cacheRoot(), { recursive: true });
  writeFileSync(registryPath(r.key), `${JSON.stringify(r, null, 2)}\n`);
}

export function clearRegistry(key = repoKey()): void {
  try { rmSync(registryPath(key)); } catch { /* already gone */ }
}

// ------------------------------------------------------------ build identity

/**
 * Which build a request is about.
 *
 * `sha:<tree-sha>` is content-addressed, immutable, and shared by everyone —
 * five agents reviewing `HEAD` render each shot once between them, and an
 * uncommitted edit by any of them disturbs none of the others.
 *
 * `dirty:<abs root>` is the live working tree: exclusive, never cached, and
 * every response derived from it is flagged. On a shared trunk a dirty frame
 * contains *every* agent's in-flight edits, not just yours, which is exactly
 * why it is never the thing you quote as evidence.
 */
export type BuildId = string;

export const DIRTY_PREFIX = 'dirty:';
export const SHA_PREFIX = 'sha:';

export const isDirty = (b: BuildId): boolean => b.startsWith(DIRTY_PREFIX);
export const shaOf = (b: BuildId): string | null => (b.startsWith(SHA_PREFIX) ? b.slice(SHA_PREFIX.length) : null);

/** A short, quotable form for logs and handoffs. */
export const shortBuild = (b: BuildId): string =>
  (isDirty(b) ? `dirty:${path.basename(b.slice(DIRTY_PREFIX.length))}` : `sha:${(shaOf(b) ?? '').slice(0, 12)}`);

/**
 * Turn what a human typed into a build identity.
 *
 * `--dirty`, or a ref. A ref resolves to its **tree** sha rather than its commit
 * sha on purpose: two commits with identical trees — a reworded message, a
 * rebase that changed nothing, a merge that took one side whole — are the same
 * build and should share one materialised tree and one set of cached frames.
 */
export function resolveBuild(ref: string | undefined, root = ROOT): BuildId {
  if (!ref || ref === 'dirty') return DIRTY_PREFIX + root;
  if (ref.startsWith(DIRTY_PREFIX) || ref.startsWith(SHA_PREFIX)) return ref;
  const tree = git(['rev-parse', `${ref}^{tree}`], root);
  if (!tree) throw new Error(`cannot resolve build ref ${JSON.stringify(ref)} to a tree sha`);
  return SHA_PREFIX + tree;
}

/**
 * True when the working tree differs from the ref it was resolved against.
 *
 * Used to warn rather than to refuse: capturing `HEAD` while you have
 * uncommitted work is a completely normal thing to do — it is how you compare
 * against what you started from — but silently doing it when you *meant* to see
 * your edit is the failure this catches.
 */
export function workingTreeDirty(root = ROOT): boolean {
  return git(['status', '--porcelain', '--untracked-files=no'], root).length > 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const key = repoKey();
  console.log(JSON.stringify({
    root: ROOT,
    repoKey: key,
    keyHash: keyHash(key),
    daemonPort: derivedPort(key),
    registry: registryPath(key),
    cacheDir: repoCacheDir(key),
    running: readRegistry(key),
    head: resolveBuild('HEAD'),
    dirty: workingTreeDirty(),
  }, null, 2));
}
