#!/usr/bin/env node
/**
 * `TABLE[key]` where TABLE is a literal-typed const table: cast the key rather
 * than widening the table to `Record<string, T>`, so the table keeps its exact
 * per-key value types and only the lookup is asserted.
 */
import ts from 'typescript-api';
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '.';
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(root, process.argv[3] ?? 'tsconfig.json'), ts.sys.readFile).config, ts.sys, root);
const program = ts.createProgram(cfg.fileNames, { ...cfg.options, noEmit: true });

const edits = new Map();
let n = 0, wide = 0;
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !sf.fileName.startsWith(path.resolve(root, 'src'))) continue;
  for (const d of program.getSemanticDiagnostics(sf)) {
    if (d.code !== 7053) continue;
    let node = ts.getTokenAtPosition(sf, d.start);
    while (node && !ts.isElementAccessExpression(node)) node = node.parent;
    if (!node) continue;
    const obj = node.expression, arg = node.argumentExpression;
    const list = edits.get(sf.fileName) ?? (edits.set(sf.fileName, []), edits.get(sf.fileName));
    const simple = ts.isIdentifier(obj) || (ts.isPropertyAccessExpression(obj) &&
      (function ent(e) { return ts.isIdentifier(e) || e.kind === ts.SyntaxKind.ThisKeyword ||
        (ts.isPropertyAccessExpression(e) && ent(e.expression)); })(obj));
    if (simple) {
      list.push({ pos: arg.end, end: arg.end, text: ` as keyof typeof ${obj.getText(sf)}` });
      n++;
    } else {
      list.push({ pos: obj.getStart(sf), end: obj.getStart(sf), text: '(' });
      list.push({ pos: obj.end, end: obj.end, text: ' as any)' });
      wide++;
    }
  }
}
for (const [file, list] of edits) {
  const seen = new Set();
  const uniq = list.filter((e) => { const k = `${e.pos}:${e.text}`; return seen.has(k) ? false : (seen.add(k), true); })
                   .sort((a, b) => b.pos - a.pos);
  let src = fs.readFileSync(file, 'utf8');
  for (const e of uniq) src = src.slice(0, e.pos) + e.text + src.slice(e.end);
  fs.writeFileSync(file, src);
}
console.log(`keyofcast: ${n} key casts, ${wide} object casts across ${edits.size} files`);
