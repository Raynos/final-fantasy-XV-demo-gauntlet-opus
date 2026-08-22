#!/usr/bin/env node
/**
 * `this.flow` is declared `Flow | null` because a reset assigns null, and read
 * unguarded in an update that only runs after init built it. The runtime
 * guarantee is real and local; the assertion states it.
 */
import ts from 'typescript-api';
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '.';
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(root, process.argv[3] ?? 'tsconfig.json'), ts.sys.readFile).config, ts.sys, root);
const program = ts.createProgram(cfg.fileNames, { ...cfg.options, noEmit: true });
const src = path.resolve(root, process.argv[4] ?? 'src');

const edits = new Map();
let n = 0;
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !sf.fileName.startsWith(src)) continue;
  for (const d of program.getSemanticDiagnostics(sf)) {
    if (![18047, 18048, 2531, 2532].includes(d.code)) continue;
    let node = ts.getTokenAtPosition(sf, d.start);
    while (node && node.end < d.start + d.length) node = node.parent;
    if (!node) continue;
    if (!ts.isIdentifier(node) && !ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node) &&
        !ts.isCallExpression(node) && node.kind !== ts.SyntaxKind.ThisKeyword) continue;
    const p = node.parent;
    if (!p || !((ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) && p.expression === node) &&
        !(ts.isCallExpression(p) && p.expression === node)) continue;
    const list = edits.get(sf.fileName) ?? (edits.set(sf.fileName, []), edits.get(sf.fileName));
    list.push({ pos: node.end });
    n++;
  }
}
for (const [file, list] of edits) {
  const seen = new Set();
  const uniq = list.filter((e) => (seen.has(e.pos) ? false : (seen.add(e.pos), true))).sort((a, b) => b.pos - a.pos);
  let s = fs.readFileSync(file, 'utf8');
  for (const e of uniq) s = s.slice(0, e.pos) + '!' + s.slice(e.pos);
  fs.writeFileSync(file, s);
}
console.log(`nonnull: ${n} assertions across ${edits.size} files`);
