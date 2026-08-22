#!/usr/bin/env node
/**
 * `f(opts = {})` infers `{}`, which forbids every property the body then reads.
 * Annotate the declaration `any` where the compiler says the receiver is `{}`.
 */
import ts from 'typescript-api';
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '.';
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(root, process.argv[3] ?? 'tsconfig.json'), ts.sys.readFile).config, ts.sys, root);
const program = ts.createProgram(cfg.fileNames, { ...cfg.options, noEmit: true });
const checker = program.getTypeChecker();

const edits = new Map();
let n = 0;
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !sf.fileName.startsWith(path.resolve(root, 'src'))) continue;
  for (const d of program.getSemanticDiagnostics(sf)) {
    if (d.code !== 2339) continue;
    if (!/does not exist on type '\{\}'\.$/.test(ts.flattenDiagnosticMessageText(d.messageText, ' '))) continue;
    let node = ts.getTokenAtPosition(sf, d.start);
    while (node && !ts.isPropertyAccessExpression(node)) node = node.parent;
    if (!node) continue;
    const sym = checker.getSymbolAtLocation(node.expression);
    const decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
    if (!decl) continue;
    if (!(ts.isParameter(decl) || ts.isVariableDeclaration(decl)) || decl.type) continue;
    if (!ts.isIdentifier(decl.name)) continue;
    const f = decl.getSourceFile().fileName;
    const list = edits.get(f) ?? (edits.set(f, []), edits.get(f));
    list.push({ pos: decl.name.end + (decl.questionToken ? 1 : 0), text: ': any' });
    n++;
  }
}
for (const [file, list] of edits) {
  const seen = new Set();
  const uniq = list.filter((e) => (seen.has(e.pos) ? false : (seen.add(e.pos), true))).sort((a, b) => b.pos - a.pos);
  let src = fs.readFileSync(file, 'utf8');
  for (const e of uniq) src = src.slice(0, e.pos) + e.text + src.slice(e.pos);
  fs.writeFileSync(file, src);
}
console.log(`emptyobj: ${n} declarations across ${edits.size} files`);
