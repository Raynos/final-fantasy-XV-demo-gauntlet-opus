#!/usr/bin/env node
/**
 * `null` is a value this codebase passes constantly and TypeScript's `strict`
 * has opinions about. Three related fixes:
 *
 *   1. `f(x = null)` infers the parameter as `null`, which rejects every real
 *      argument. Those become `any`.
 *   2. a JSDoc-derived `T` on a parameter whose default is `null` becomes
 *      `T | null`.
 *   3. a parameter a caller passes `null` to becomes `T | null`.
 */
import ts from 'typescript-api';
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '.';
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(root, process.argv[3] ?? 'tsconfig.json'), ts.sys.readFile).config, ts.sys, root);
const program = ts.createProgram(cfg.fileNames, { ...cfg.options, noEmit: true });
const checker = program.getTypeChecker();
const src = path.resolve(root, process.argv[4] ?? 'src');

const edits = new Map();
const push = (file, e) => { const l = edits.get(file) ?? (edits.set(file, []), edits.get(file)); l.push(e); };
let untyped = 0, widened = 0;

// (1) untyped `= null` parameters
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !sf.fileName.startsWith(src)) continue;
  const visit = (n) => {
    if (ts.isParameter(n) && !n.type && n.initializer &&
        (n.initializer.kind === ts.SyntaxKind.NullKeyword ||
         (ts.isIdentifier(n.initializer) && n.initializer.text === 'undefined'))) {
      push(sf.fileName, { pos: n.name.end, end: n.name.end, text: ': any' });
      untyped++;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

// (2)+(3) widen an annotated parameter that has to admit null
const widen = (p) => {
  if (!p.type) return;
  const t = p.type;
  if (t.kind === ts.SyntaxKind.AnyKeyword || /\bnull\b/.test(t.getText())) return;
  const paren = ts.isUnionTypeNode(t) || ts.isFunctionTypeNode(t);
  push(p.getSourceFile().fileName, { pos: t.getStart(), end: t.getStart(), text: paren ? '(' : '' });
  push(p.getSourceFile().fileName, { pos: t.end, end: t.end, text: paren ? ') | null' : ' | null' });
  widened++;
};

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !sf.fileName.startsWith(src)) continue;
  for (const d of program.getSemanticDiagnostics(sf)) {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ');
    if (d.code === 2322 && /^Type 'null' is not assignable to type/.test(msg)) {
      let n = ts.getTokenAtPosition(sf, d.start);
      while (n && !ts.isParameter(n)) n = n.parent;
      if (n && n.getSourceFile().fileName.startsWith(src)) widen(n);
    } else if (d.code === 2345 && /^Argument of type 'null' is not assignable/.test(msg)) {
      let n = ts.getTokenAtPosition(sf, d.start);
      const arg = n;
      while (n && !ts.isCallExpression(n) && !ts.isNewExpression(n)) n = n.parent;
      if (!n) continue;
      const sig = checker.getResolvedSignature(n);
      const decl = sig?.declaration;
      if (!decl?.parameters || !decl.getSourceFile().fileName.startsWith(src)) continue;
      const i = n.arguments.findIndex((a) => a.getStart() === arg.getStart());
      const p = decl.parameters[i];
      if (p) widen(p);
    }
  }
}

for (const [file, list] of edits) {
  const seen = new Set();
  const uniq = list.filter((e) => { const k = `${e.pos}:${e.text}`; return seen.has(k) ? false : (seen.add(k), true); })
                   .sort((a, b) => b.pos - a.pos);
  let s = fs.readFileSync(file, 'utf8');
  for (const e of uniq) s = s.slice(0, e.pos) + e.text + s.slice(e.end);
  fs.writeFileSync(file, s);
}
console.log(`nulls: ${untyped} untyped \`= null\` params, ${widened} widened`);
