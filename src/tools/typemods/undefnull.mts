#!/usr/bin/env node
/**
 * `this.terrain = game.get('Terrain')` -- `get` answers `T | undefined` for a
 * system that is not registered, and the field holds `T | null` because a reset
 * writes null. Both mean "or nothing"; `?? null` says which one this codebase
 * spells it as, and every consumer guards on truthiness either way.
 */
import ts from 'typescript-api';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] ?? '.');
const cfgName = process.argv[3] ?? 'tsconfig.json';
const prefix = path.resolve(root, process.argv[4] ?? 'src');
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(root, cfgName), ts.sys.readFile).config, ts.sys, root);
const program = ts.createProgram(cfg.fileNames, { ...cfg.options, noEmit: true });
const edits = new Map();
let n = 0;
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !sf.fileName.startsWith(prefix)) continue;
  for (const d of program.getSemanticDiagnostics(sf)) {
    if (d.code !== 2322) continue;
    const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ');
    const m = /^Type '([^']+) \| undefined' is not assignable to type '([^']+) \| null'\./.exec(msg);
    if (!m || m[1] !== m[2]) continue;
    let node = ts.getTokenAtPosition(sf, d.start);
    while (node && !ts.isBinaryExpression(node) && !ts.isVariableDeclaration(node)) node = node.parent;
    if (!node) continue;
    const rhs = ts.isBinaryExpression(node) ? node.right : node.initializer;
    if (!rhs) continue;
    const list = edits.get(sf.fileName) ?? (edits.set(sf.fileName, []), edits.get(sf.fileName));
    list.push({ pos: rhs.end, text: ' ?? null' });
    n++;
  }
}
for (const [file, list] of edits) {
  const seen = new Set();
  const uniq = list.filter((e) => (seen.has(e.pos) ? false : (seen.add(e.pos), true))).sort((a, b) => b.pos - a.pos);
  let s = fs.readFileSync(file, 'utf8');
  for (const e of uniq) s = s.slice(0, e.pos) + e.text + s.slice(e.pos);
  fs.writeFileSync(file, s);
}
console.log(`undefnull: ${n} assignments`);
