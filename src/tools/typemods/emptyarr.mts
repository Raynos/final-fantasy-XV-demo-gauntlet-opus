#!/usr/bin/env node
/** `f(tags = [])` infers `never[]`, which rejects every push and every include. */
import ts from 'typescript-api';
import fs from 'node:fs';
let n = 0;
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const edits = [];
  const visit = (x) => {
    const empty = (i) => i && ts.isArrayLiteralExpression(i) && i.elements.length === 0;
    if (ts.isParameter(x) && !x.type && ts.isIdentifier(x.name) && empty(x.initializer)) {
      edits.push({ pos: x.name.end, text: ': any[]' }); n++;
    }
    // `let x = []` gets TypeScript's evolving-array inference and is usually
    // better left alone; a parameter default gets `never[]` and is not.
    ts.forEachChild(x, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  edits.sort((a, b) => b.pos - a.pos);
  let out = src;
  for (const e of edits) out = out.slice(0, e.pos) + e.text + out.slice(e.pos);
  fs.writeFileSync(file, out);
}
console.log(`emptyarr: ${n} annotated`);
