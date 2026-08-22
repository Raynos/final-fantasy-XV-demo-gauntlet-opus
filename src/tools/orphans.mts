#!/usr/bin/env node
/**
 * Static reachability audit.
 *
 * A module can be complete, tested and committed and still be dead: this
 * project shipped 5,765 lines of RPG systems that nothing outside their own
 * directory ever imported, while the HUD drew invented numbers over them.
 * Existence is not integration.
 *
 * Walks the real import graph from `src/main.ts` and reports every module that
 * is never reached, plus every exported symbol nothing imports.
 *
 *   node src/tools/orphans.mjs
 *   node src/tools/orphans.mjs --exports    # also list unused named exports
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'src');
const WANT_EXPORTS = process.argv.includes('--exports');

async function walk(dir: any, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    // `src/tools/` is the harness, not the game: it never appears in the import
    // graph from `main.ts`, so walking it would report every tool as an orphan.
    if (e.isDirectory() && dir === SRC && e.name === 'tools') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) await walk(f, out);
    // `.d.ts` files are ambient declarations: nothing imports them and that is
    // the point.
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) (out as string[]).push(f);
  }
  return out;
}

const all = await walk(SRC);
const source = new Map();
for (const f of all) source.set(f, await readFile(f, 'utf8'));

/** Resolve a specifier to an absolute file inside src/, or null if external. */
function resolve(from: any, spec: any) {
  if (!spec.startsWith('.')) return null;
  let p = path.resolve(path.dirname(from), spec);
  if (source.has(p)) return p;
  for (const ext of ['.ts', '/index.ts']) if (source.has(p + ext)) return p + ext;
  return null;
}

const IMPORT_RE = /(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|export\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;
const importsOf = new Map();
for (const [f, src] of source) {
  const deps = new Set();
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2] || m[3];
    const r = spec && resolve(f, spec);
    if (r) deps.add(r);
  }
  importsOf.set(f, deps);
}

// reachability from the real entry point
const entry = path.join(SRC, 'main.ts');
const seen = new Set([entry]);
const stack = [entry];
while (stack.length) {
  for (const d of importsOf.get(stack.pop()) || []) {
    if (!seen.has(d)) { seen.add(d); stack.push(d); }
  }
}

const orphans = all.filter((f) => !seen.has(f)).sort();
const rel = (f: any) => path.relative(ROOT, f);

console.log(`${all.length} modules under src/, ${seen.size} reachable from main.ts\n`);
if (!orphans.length) console.log('no orphaned modules — every file is reachable');
else {
  console.log(`${orphans.length} ORPHANED module(s) — present but never imported:`);
  for (const f of orphans) console.log('  ' + rel(f));
}

if (WANT_EXPORTS) {
  const EXPORT_RE = /export\s+(?:async\s+)?(?:class|function|const|let|var)\s+([A-Za-z0-9_$]+)/g;
  const unused = [];
  for (const f of all) {
    if (!seen.has(f)) continue;
    for (const m of source.get(f).matchAll(EXPORT_RE)) {
      const name = m[1];
      let used = false;
      for (const [g, src] of source) {
        if (g === f) continue;
        if (!importsOf.get(g)?.has(f)) continue;
        if (new RegExp(`\\b${name}\\b`).test(src)) { used = true; break; }
      }
      if (!used) unused.push(`${rel(f)}  ${name}`);
    }
  }
  console.log(`\n${unused.length} exported symbol(s) nothing imports:`);
  for (const u of unused.slice(0, 40)) console.log('  ' + u);
}

process.exit(orphans.length ? 1 : 0);
