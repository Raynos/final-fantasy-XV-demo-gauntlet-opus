#!/usr/bin/env node
/**
 * Count `any` in the ported source, and fail if it goes up.
 *
 *   node src/tools/anycheck.mts            # report + enforce the ratchet
 *   node src/tools/anycheck.mts --set      # write the current count as the new ceiling
 *   node src/tools/anycheck.mts --by-file  # worst files first
 *
 * The port left `any` behind wherever a mechanical pass could not infer a type.
 * That is honest but it is not the goal: the goal is a strictly typed codebase,
 * so this gate makes the number a one-way street. `--set` after a reduction
 * lowers the ceiling; nothing raises it but an edit to `ANY_BUDGET.json`.
 *
 * Counted as `any`: a type annotation (`: any`), a type argument (`<any>`,
 * `Array<any>`), an array type (`any[]`), an assertion (`as any`), and a
 * declared field (`x!: any`). Not counted: the word inside a comment or a
 * string, which is why this reads the source with the comments stripped rather
 * than grepping it raw.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUDGET = path.join(ROOT, 'ANY_BUDGET.json');

/** Strip line and block comments and string/template literals, so only code is counted. */
function code(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; continue;
    }
    out += c; i++;
  }
  return out;
}

const RE = /(?<![A-Za-z0-9_$])any(?![A-Za-z0-9_$])/g;

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'public') await walk(f, out); }
    else if (/\.(ts|mts)$/.test(e.name)) out.push(f);
  }
  return out;
}

const files = await walk(path.join(ROOT, 'src'));
const counts: [string, number][] = [];
let total = 0;
for (const f of files) {
  const n = (code(await readFile(f, 'utf8')).match(RE) ?? []).length;
  if (n) counts.push([path.relative(ROOT, f), n]);
  total += n;
}
counts.sort((a, b) => b[1] - a[1]);

const args = process.argv.slice(2);
if (args.includes('--by-file')) {
  for (const [f, n] of counts.slice(0, 40)) console.log(`${String(n).padStart(5)}  ${f}`);
  console.log('');
}

if (args.includes('--set')) {
  await writeFile(BUDGET, `${JSON.stringify({ ceiling: total }, null, 2)}\n`);
  console.log(`anycheck: ceiling set to ${total}`);
  process.exit(0);
}

let ceiling = Infinity;
try { ceiling = JSON.parse(await readFile(BUDGET, 'utf8')).ceiling; } catch { /* no budget yet */ }

console.log(`anycheck: ${total} \`any\` across ${counts.length} files (ceiling ${ceiling})`);
if (total > ceiling) {
  console.log(`\nFAIL: ${total - ceiling} more than the ceiling. The goal is zero; the number only goes down.`);
  console.log('      Run with --by-file to see where, or --set if you are deliberately raising it.');
  process.exit(1);
}
if (total < ceiling) console.log(`  ${ceiling - total} below the ceiling — run --set to lock it in.`);
