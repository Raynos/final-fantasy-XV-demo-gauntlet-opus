#!/usr/bin/env node
/**
 * Annotate what the compiler says it cannot infer: implicit-any parameters,
 * destructured parameters and implicitly-any locals.
 *
 * Every annotation this writes is `any` -- an honest marker of a parameter the
 * port did not type, greppable and narrowable later, which is more than
 * `noImplicitAny: false` would leave behind.
 *
 *   node annparams.mjs <tsc-error-file> <repo-root>
 */
import ts from 'typescript-api';
import fs from 'node:fs';
import path from 'node:path';

const [errFile, root] = process.argv.slice(2);
const RE = /^(.+?)\((\d+),(\d+)\): error TS(7006|7031|7005|7034|7019)(?:.*?): (.*)$/;
const byFile = new Map();
for (const l of fs.readFileSync(errFile, 'utf8').split('\n')) {
  const m = RE.exec(l);
  if (!m) continue;
  const [, file, line, col, code, msg] = m;
  const arr = byFile.get(file) ?? (byFile.set(file, []), byFile.get(file));
  arr.push({ line: +line, col: +col, code, msg });
}

let params = 0, vars = 0, files = 0;
for (const [file, errs] of byFile) {
  const abs = path.resolve(root, file);
  if (!fs.existsSync(abs)) continue;
  const src = fs.readFileSync(abs, 'utf8');
  const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const want = new Map(); // offset -> {code,msg}
  for (const e of errs) want.set(sf.getPositionOfLineAndCharacter(e.line - 1, e.col - 1), e);
  const edits = [];

  const visit = (n) => {
    if (ts.isParameter(n) && !n.type) {
      const at = want.get(n.name.getStart(sf));
      if (at && (at.code === '7006' || at.code === '7031' || at.code === '7019')) {
        const t = n.dotDotDotToken ? 'any[]' : 'any';
        edits.push({ pos: n.name.end + (n.questionToken ? 1 : 0), text: `: ${t}` });
        params++;
      }
    }
    if (ts.isBindingElement(n)) {
      const at = want.get(n.name.getStart(sf));
      if (at && at.code === '7031') {
        // annotate the parameter the binding belongs to, once
        let p = n.parent;
        while (p && !ts.isParameter(p)) p = p.parent;
        if (p && !p.type) { edits.push({ pos: p.name.end, text: ': any' }); params++; }
      }
    }
    if (ts.isVariableDeclaration(n) && !n.type && ts.isIdentifier(n.name)) {
      const at = want.get(n.name.getStart(sf));
      if (at && (at.code === '7005' || at.code === '7034')) {
        const t = /'any\[\]'/.test(at.msg) ? 'any[]' : 'any';
        edits.push({ pos: n.name.end, text: `: ${t}` });
        vars++;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  if (edits.length) {
    const seen = new Set();
    const uniq = edits.filter((e) => (seen.has(e.pos) ? false : (seen.add(e.pos), true)));
    uniq.sort((a, b) => b.pos - a.pos);
    let out = src;
    for (const e of uniq) out = out.slice(0, e.pos) + e.text + out.slice(e.pos);
    fs.writeFileSync(abs, out);
    files++;
  }
}
console.log(`annparams: ${params} params, ${vars} locals across ${files} files`);
