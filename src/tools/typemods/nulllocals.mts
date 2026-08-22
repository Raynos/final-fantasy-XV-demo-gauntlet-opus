#!/usr/bin/env node
/** `let x = null` infers `null`, which narrows to `never` the moment it is
 * guarded. Same reasoning as the parameter pass: it means "this holds
 * something later". */
import ts from 'typescript-api';
import fs from 'node:fs';
const files = process.argv.slice(2);
let n = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const edits = [];
  const visit = (x) => {
    if (ts.isVariableDeclaration(x) && !x.type && ts.isIdentifier(x.name) && x.initializer &&
        (x.initializer.kind === ts.SyntaxKind.NullKeyword ||
         (ts.isIdentifier(x.initializer) && x.initializer.text === 'undefined')) &&
        x.parent.flags !== ts.NodeFlags.Const) {
      const list = x.parent;
      if (ts.isVariableDeclarationList(list) && !(list.flags & ts.NodeFlags.Const)) {
        edits.push({ pos: x.name.end, text: ': any' });
        n++;
      }
    }
    ts.forEachChild(x, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  edits.sort((a, b) => b.pos - a.pos);
  let out = src;
  for (const e of edits) out = out.slice(0, e.pos) + e.text + out.slice(e.pos);
  fs.writeFileSync(file, out);
}
console.log(`nulllocals: ${n} locals`);
