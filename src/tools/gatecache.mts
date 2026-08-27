#!/usr/bin/env node
/**
 * A gate's verdict, keyed on the tree it was taken against.
 *
 * **Why this exists.** `check.mts` ran eighteen gates strictly serially with no
 * memory at all, so `pnpm run check` cost ~13 minutes *every* time — including
 * the second run on a tree nothing had changed, which is the common case: a
 * pre-push after a pre-push, a fresh agent re-verifying the handoff's claim, a
 * coordinator confirming a lane's green before merging. Thirteen minutes to
 * re-derive a fact that was already known.
 *
 * ## The key is the tree sha, and only the tree sha
 *
 * Decided by the human, and it is the right call: a gate is a pure function of
 * the tree it reads, so invalidation is free by construction — any commit
 * changes the sha and every entry for the old one becomes unreachable. No
 * file-list heuristics, no "which gate depends on which directory" table to
 * drift out of date, and no way to get a stale pass by editing a file the
 * heuristic did not know about.
 *
 * The cost of that purity is that a **dirty tree is never cached**, in either
 * direction. `HEAD`'s tree sha does not describe a working tree with edits in
 * it, and half this suite reads the working tree directly (the bare-Node gates
 * import `src/` in process) while the other half captures `--build HEAD`. One
 * key cannot honestly cover both unless they agree, which is exactly what a
 * clean tree means.
 *
 * ## Only a PASS is stored
 *
 * A FAIL is the one verdict you want re-derived: it is the flaky end of the
 * distribution (`project/LANDMINES.md` has a whole section on gates that
 * disagree between invocation paths), and replaying it would turn one bad run
 * into a permanently red tree that `--no-cache` is the only escape from. VOID —
 * "the ruler refused to certify" — is not a verdict about the tree at all.
 *
 * A PASS taken on a **contended** machine also never replays for a gate that
 * demands a quiet one. `perf` and `gameplay` are measurements, not assertions,
 * and a measurement's provenance is part of it.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoCacheDir, ROOT } from './identity.mts';

export interface GateVerdict {
  gate: string;
  /** Content hash of this gate's inputs — see `inputsKey`. */
  sha: string;
  /** Process exit code: 0 pass, 3 VOID, anything else FAIL. */
  code: number;
  ms: number;
  tail: string;
  at: string;
  /** Was the machine quiet when this was taken? Provenance, not decoration. */
  quiet: boolean;
  loadavg: number;
}

/**
 * THE KEY IS WHAT THE GATE READS, NOT WHAT THE COMMIT TOUCHED.
 *
 * This cache used to key on the full tree sha, which is pure -- any commit
 * changes the sha, so invalidation is free by construction -- and which threw
 * away almost all of the cache's value, because the sha changes for reasons no
 * gate can see. **Of the last 120 commits on this trunk, 84 (70%) touch no game
 * code at all**: 52 are docs or config, 32 are the harness itself. Every one of
 * them re-derived all eighteen gates from scratch, ~309 s of rendering to
 * re-confirm a verdict about source that had not moved.
 *
 * Worse, a tree sha cannot describe a working tree with edits in it, so the old
 * key refused to cache a dirty tree in either direction -- and a dirty tree is
 * where an agent actually lives. The cache was off for the entire edit-check
 * loop it existed to shorten.
 *
 * So the key is a content hash of the files whose bytes the verdict is a
 * function of. That is *stricter* than the tree sha where it matters (an
 * unrelated commit no longer silently reuses nothing) and far looser where it
 * does not, and it works identically on a dirty tree, because file contents are
 * file contents whether or not git has been told about them.
 *
 * ## What is in the key
 *
 * - **The game.** Everything under `src/` except `src/tools/` (the harness,
 *   which no game assertion reads) and `src/public/` (generated bake output).
 * - **The gate's own tool**, so editing `hydrocheck.mts` re-runs `hydrocheck`
 *   and nothing else.
 * - **`harness.mts` and `daemon.mts` for browser gates only.** They decide how
 *   a page is posed and driven, so they can change a browser verdict; they
 *   cannot change a bare-Node one. This is why `kind` is load-bearing here and
 *   not just a scheduling hint.
 * - **Every `project/*-baseline.json`**, because a ratchet grades against them.
 * - **Root config** -- `package.json`, `vite.config.js`, `tsconfig*.json` --
 *   which change what the build produces and therefore what runs.
 * - **The argv**, so `--par 2` and `--par 4` are different verdicts.
 *
 * ## What is deliberately NOT in it
 *
 * `docs/`, `project/` except baselines, `*.md`, `tmp/`, `dist/`, the frame
 * cache. If a change to any of those can alter a gate's verdict, that gate is
 * reading something it should not be, and the bug is there rather than here.
 *
 * The risk this trades is real and worth stating: **a dependency that is not in
 * the list is a stale PASS**, where the tree sha could only ever be
 * conservative. That is why the list errs wide (all of `src/`, not a per-gate
 * import graph) and why `--no-cache` exists. `HARNESS_GATECACHE=off` disables
 * it entirely for a run you want to trust absolutely.
 */
const SKIP_DIRS = new Set(['tools', 'public', 'node_modules']);

/** Hash every file under `src/` that is not the harness or generated. Memoised. */
let gameHashMemo: string | null = null;
export function gameHash(): string {
  if (gameHashMemo) return gameHashMemo;
  const h = createHash('sha1');
  const walk = (rel: string): void => {
    let entries: string[];
    try { entries = readdirSync(path.join(ROOT, rel)).sort(); } catch { return; }
    for (const name of entries) {
      const r = path.join(rel, name);
      let st;
      try { st = statSync(path.join(ROOT, r)); } catch { continue; }
      if (st.isDirectory()) {
        if (rel === 'src' && SKIP_DIRS.has(name)) continue;
        walk(r);
      } else {
        h.update(r);
        h.update(readFileSync(path.join(ROOT, r)));
      }
    }
  };
  walk('src');
  for (const f of ['package.json', 'vite.config.js', 'tsconfig.json', 'tsconfig.tools.json']) {
    try { h.update(f); h.update(readFileSync(path.join(ROOT, f))); } catch { /* absent is a state too */ }
  }
  try {
    for (const b of readdirSync(path.join(ROOT, 'project')).sort()) {
      if (!b.endsWith('-baseline.json')) continue;
      h.update(b);
      h.update(readFileSync(path.join(ROOT, 'project', b)));
    }
  } catch { /* no baselines yet */ }
  gameHashMemo = h.digest('hex').slice(0, 16);
  return gameHashMemo;
}

/** The cache key for one gate: the game, its own tool, and its argv. */
export function inputsKey(gate: { name: string, kind?: string, script?: string, args?: string[] }): string | null {
  if (process.env.HARNESS_GATECACHE === 'off') return null;
  try {
    const h = createHash('sha1');
    h.update(gameHash());
    h.update(gate.name);
    h.update(JSON.stringify(gate.args ?? []));
    const tools = [gate.script ?? `${gate.name}.mts`];
    // A browser gate's verdict depends on how the daemon poses and drives the
    // page; a bare-Node gate's cannot.
    if (gate.kind === 'browser') tools.push('harness.mts', 'daemon.mts');
    for (const t of tools.sort()) {
      try { h.update(t); h.update(readFileSync(path.join(ROOT, 'src', 'tools', t))); } catch { /* not a script gate */ }
    }
    return h.digest('hex').slice(0, 16);
  } catch { return null; }
}

const dir = (): string => path.join(repoCacheDir(), 'gatecache');
const file = (gate: string, sha: string): string => path.join(dir(), `${sha}-${gate}.json`);

/** A stored PASS for this gate at this tree, or null. Never throws. */
export function lookup(gate: string, sha: string | null): GateVerdict | null {
  if (!sha) return null;
  try {
    const f = file(gate, sha);
    if (!existsSync(f)) return null;
    const v = JSON.parse(readFileSync(f, 'utf8')) as GateVerdict;
    return v.code === 0 ? v : null;
  } catch { return null; }
}

/** Store a PASS. Anything else is deliberately forgotten — see the header. */
export function store(v: GateVerdict): void {
  if (v.code !== 0 || !v.sha) return;
  try {
    mkdirSync(dir(), { recursive: true });
    writeFileSync(file(v.gate, v.sha), `${JSON.stringify(v)}\n`);
  } catch { /* a cache write is never worth failing a gate for */ }
}

/**
 * Keep the newest N trees' worth of verdicts.
 *
 * ~18 files per tree at a few hundred bytes each, so this is about tidiness
 * rather than disk. Pruning by tree rather than by file keeps a tree's verdicts
 * whole: half a suite's cache is worse than none, because it reports `cached`
 * markers on a run that still pays for everything else.
 */
export function prune(keepTrees = 20): void {
  try {
    const root = dir();
    if (!existsSync(root)) return;
    const bySha = new Map<string, { at: number, files: string[] }>();
    for (const name of readdirSync(root)) {
      const sha = name.split('-')[0];
      const f = path.join(root, name);
      const at = statSync(f).mtimeMs;
      const e = bySha.get(sha) ?? { at: 0, files: [] };
      e.at = Math.max(e.at, at);
      e.files.push(f);
      bySha.set(sha, e);
    }
    const old = [...bySha.values()].sort((a, b) => b.at - a.at).slice(keepTrees);
    for (const e of old) for (const f of e.files) rmSync(f, { force: true });
  } catch { /* ignore */ }
}
