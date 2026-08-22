#!/usr/bin/env node
/**
 * A JSDoc options type that drifted from its callers: the call passes `ref`,
 * `uvScale`, `colorAt`, and the hand-written `{nodes, steps, seg}` never
 * learned about them. The code is the truth here, so the type gets the
 * property -- optional, typed from what the caller actually passes.
 */
import ts from 'typescript-api';
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '.';
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(root, process.argv[3] ?? 'tsconfig.json'), ts.sys.readFile).config, ts.sys, root);
const program = ts.createProgram(cfg.fileNames, { ...cfg.options, noEmit: true });
const checker = program.getTypeChecker();
const src = path.resolve(root, process.argv[4] ?? 'src');

/** A contextual type may be `T | undefined`; the literal we want is inside. */
function literalDecls(t) {
  if (!t) return [];
  const parts = t.isUnion?.() ? t.types : [t];
  const out = [];
  for (const p of parts) for (const d of p?.symbol?.declarations ?? []) if (ts.isTypeLiteralNode(d)) out.push(d);
  return out;
}

const adds = new Map(); // `${file}:${end}` -> {file, end, props:Map<name,type>}
let n = 0;
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !sf.fileName.startsWith(src)) continue;
  for (const d of program.getSemanticDiagnostics(sf)) {
    const flat = ts.flattenDiagnosticMessageText(d.messageText, ' ');
    // a *read* of a property the options type never declared
    if (d.code === 2339) {
      const r = /Property '([^']+)' does not exist on type/.exec(flat);
      if (!r) continue;
      let acc = ts.getTokenAtPosition(sf, d.start);
      while (acc && !ts.isPropertyAccessExpression(acc)) acc = acc.parent;
      if (!acc) continue;
      const t = checker.getTypeAtLocation(acc.expression);
      const lit = literalDecls(t).find((x) => x.getSourceFile().fileName.startsWith(src));
      if (!lit) continue;
      const key2 = `${lit.getSourceFile().fileName}:${lit.end}`;
      const rec2 = adds.get(key2) ?? (adds.set(key2, { file: lit.getSourceFile().fileName, end: lit.end, props: new Map(), have: new Set(lit.members.filter((mm) => mm.name && ts.isIdentifier(mm.name)).map((mm) => mm.name.text)) }), adds.get(key2));
      if (!rec2.props.has(r[1]) && !rec2.have.has(r[1])) { rec2.props.set(r[1], 'any'); n++; }
      continue;
    }
    if (d.code !== 2353) continue;
    const m = /and '([^']+)' does not exist in type/.exec(flat);
    if (!m) continue;
    let node = ts.getTokenAtPosition(sf, d.start);
    while (node && !ts.isPropertyAssignment(node) && !ts.isShorthandPropertyAssignment(node)) node = node.parent;
    if (!node) continue;
    const obj = node.parent;
    if (!obj || !ts.isObjectLiteralExpression(obj)) continue;
    const ctx = checker.getContextualType(obj);
    const decl = literalDecls(ctx).find((x) => x.getSourceFile().fileName.startsWith(src));
    if (!decl || !decl.getSourceFile().fileName.startsWith(src)) continue;
    let t = 'any';
    if (ts.isPropertyAssignment(node)) {
      const vt = checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(node.initializer));
      const str = checker.typeToString(vt);
      if (/^(number|string|boolean|number\[\]|string\[\]|any\[\])$/.test(str)) t = str;
    }
    const key = `${decl.getSourceFile().fileName}:${decl.end}`;
    const rec = adds.get(key) ?? (adds.set(key, { file: decl.getSourceFile().fileName, end: decl.end, props: new Map(), have: new Set(decl.members.filter((mm) => mm.name && ts.isIdentifier(mm.name)).map((mm) => mm.name.text)) }), adds.get(key));
    if (!rec.props.has(m[1]) && !rec.have.has(m[1])) { rec.props.set(m[1], t); n++; }
  }
}

const byFile = new Map();
for (const r of adds.values()) {
  const l = byFile.get(r.file) ?? (byFile.set(r.file, []), byFile.get(r.file));
  l.push(r);
}
for (const [file, list] of byFile) {
  list.sort((a, b) => b.end - a.end);
  let s = fs.readFileSync(file, 'utf8');
  for (const r of list) {
    if (!r.props.size) continue;
    const close = s.lastIndexOf('}', r.end - 1);
    const body = [...r.props].map(([k, t]) => `${k}?: ${t}`).join(', ');
    const before = s.slice(0, close).replace(/[\s,]+$/, '');
    s = before + (before.endsWith('{') ? ' ' : ', ') + body + ' ' + s.slice(close);
  }
  fs.writeFileSync(file, s);
}
console.log(`extendopts: ${n} properties across ${byFile.size} files`);
