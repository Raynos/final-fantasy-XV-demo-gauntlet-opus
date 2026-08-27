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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoCacheDir } from './identity.mts';

export interface GateVerdict {
  gate: string;
  /** The full tree sha this verdict is about. */
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
