#!/usr/bin/env node
/**
 * JavaScript lets a caller omit trailing arguments; TypeScript wants them
 * declared optional. Resolve each TS2554 call to the signature it actually
 * binds and mark that signature's trailing parameters `?`.
 *
 * Anything resolving into node_modules is reported, never edited -- a call
 * passing three.js the wrong number of arguments is a defect, not a port chore.
 */
import ts from 'typescript-api';
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '.';
const cfgPath = path.join(root, process.argv[3] ?? 'tsconfig.json');
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, root);
const program = ts.createProgram(cfg.fileNames, { ...cfg.options, noEmit: true });
const checker = program.getTypeChecker();

const edits = new Map(); // file -> [{pos,text}]
let marked = 0;
const external = [];

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !sf.fileName.startsWith(path.resolve(root, 'src'))) continue;
  for (const d of program.getSemanticDiagnostics(sf)) {
    if (d.code !== 2554) continue;
    const want = /Expected (\d+) arguments?, but got (\d+)\./.exec(ts.flattenDiagnosticMessageText(d.messageText, ' '));
    if (!want) continue;
    const got = +want[2];
    let node = ts.getTokenAtPosition ? ts.getTokenAtPosition(sf, d.start) : null;
    if (!node) continue;
    while (node && !ts.isCallExpression(node) && !ts.isNewExpression(node)) node = node.parent;
    if (!node) continue;
    const sig = checker.getResolvedSignature(node);
    const decl = sig?.declaration;
    if (!decl || !decl.parameters) continue;
    const file = decl.getSourceFile();
    if (file.fileName.includes('node_modules')) {
      external.push(`${path.relative(root, sf.fileName)}:${sf.getLineAndCharacterOfPosition(d.start).line + 1} -> ${path.basename(file.fileName)} ${want[1]} vs ${got}`);
      continue;
    }
    const list = edits.get(file.fileName) ?? (edits.set(file.fileName, []), edits.get(file.fileName));
    for (let i = got; i < decl.parameters.length; i++) {
      const p = decl.parameters[i];
      if (p.questionToken || p.initializer || p.dotDotDotToken) continue;
      list.push({ pos: p.name.end, text: '?' });
      marked++;
    }
  }
}

for (const [file, list] of edits) {
  const seen = new Set();
  const uniq = list.filter((e) => (seen.has(e.pos) ? false : (seen.add(e.pos), true))).sort((a, b) => b.pos - a.pos);
  let src = fs.readFileSync(file, 'utf8');
  for (const e of uniq) src = src.slice(0, e.pos) + e.text + src.slice(e.pos);
  fs.writeFileSync(file, src);
}
console.log(`optionalize: ${marked} parameters across ${edits.size} files`);
if (external.length) console.log('EXTERNAL (review by hand):\n' + [...new Set(external)].join('\n'));
