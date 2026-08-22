#!/usr/bin/env node
/** Add the `override` modifier `noImplicitOverride` asks for. */
import ts from 'typescript-api';
import fs from 'node:fs';
import path from 'node:path';

const [errFile, root] = process.argv.slice(2);
const RE = /^(.+?)\((\d+),(\d+)\): error TS4114:/;
const byFile = new Map();
for (const l of fs.readFileSync(errFile, 'utf8').split('\n')) {
  const m = RE.exec(l);
  if (!m) continue;
  const arr = byFile.get(m[1]) ?? (byFile.set(m[1], []), byFile.get(m[1]));
  arr.push({ line: +m[2], col: +m[3] });
}

let n = 0;
for (const [file, errs] of byFile) {
  const abs = path.resolve(root, file);
  const src = fs.readFileSync(abs, 'utf8');
  const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const want = new Set(errs.map((e) => sf.getPositionOfLineAndCharacter(e.line - 1, e.col - 1)));
  const edits = [];
  const visit = (x) => {
    if ((ts.isMethodDeclaration(x) || ts.isPropertyDeclaration(x) || ts.isGetAccessor(x) || ts.isSetAccessor(x)) &&
        x.name && want.has(x.name.getStart(sf))) {
      const mods = ts.getModifiers(x);
      const at = mods?.length ? mods[mods.length - 1].end + 1 : x.getStart(sf);
      edits.push({ pos: at, text: 'override ' });
      n++;
    }
    ts.forEachChild(x, visit);
  };
  visit(sf);
  edits.sort((a, b) => b.pos - a.pos);
  let out = src;
  for (const e of edits) out = out.slice(0, e.pos) + e.text + out.slice(e.pos);
  fs.writeFileSync(abs, out);
}
console.log(`addoverride: ${n} members`);
