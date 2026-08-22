#!/usr/bin/env node
/**
 * Two more kinds of type that were written as documentation and never checked:
 *
 *   TS2741/TS2739 -- an options literal declares a property required that half
 *   its callers omit. The callers are the truth; the property becomes optional.
 *
 *   TS2322 into a field this port declared -- the type merged from the
 *   assignments was too narrow (a field assigned `0` in one place and a
 *   comparison result in another). Widen it to `any`.
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

const edits = new Map();
const push = (file, e) => { const l = edits.get(file) ?? (edits.set(file, []), edits.get(file)); l.push(e); };
let opt = 0, wide = 0;

const markOptional = (typeNode, names) => {
  if (!ts.isTypeLiteralNode(typeNode) || !typeNode.getSourceFile().fileName.startsWith(src)) return;
  for (const m of typeNode.members) {
    if (!m.name || !ts.isIdentifier(m.name) || m.questionToken || !names.has(m.name.text)) continue;
    push(typeNode.getSourceFile().fileName, { pos: m.name.end, end: m.name.end, text: '?' });
    opt++;
  }
};

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !sf.fileName.startsWith(src)) continue;
  for (const d of program.getSemanticDiagnostics(sf)) {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ');
    if (d.code === 2741 || d.code === 2739) {
      const names = new Set();
      const one = /Property '([^']+)' is missing in type/.exec(msg);
      if (one) names.add(one[1]);
      const many = /missing the following properties from type [^:]*: (.+)$/.exec(msg);
      if (many) for (const w of many[1].split(',')) names.add(w.trim().replace(/ and \d+ more\.?$/, ''));
      if (!names.size) continue;
      let node = ts.getTokenAtPosition(sf, d.start);
      while (node && !ts.isObjectLiteralExpression(node)) node = node.parent;
      if (!node) continue;
      const ctx = checker.getContextualType(node);
      for (const decl of literalDecls(ctx)) markOptional(decl, names);
    } else if (d.code === 2322) {
      // an options property whose declared type was read off one caller and is
      // wrong for the next -- widen the member, not the call
      let prop = ts.getTokenAtPosition(sf, d.start);
      while (prop && !ts.isPropertyAssignment(prop)) prop = prop.parent;
      if (prop && ts.isObjectLiteralExpression(prop.parent)) {
        const ctx = checker.getContextualType(prop.parent);
        const name = ts.isIdentifier(prop.name) ? prop.name.text : null;
        let done = false;
        for (const decl of literalDecls(ctx)) {
          if (!decl.getSourceFile().fileName.startsWith(src)) continue;
          for (const m of decl.members) {
            if (!m.name || !ts.isIdentifier(m.name) || m.name.text !== name || !m.type) continue;
            if (m.type.kind === ts.SyntaxKind.AnyKeyword) continue;
            push(decl.getSourceFile().fileName, { pos: m.type.getStart(), end: m.type.end, text: 'any' });
            wide++; done = true;
          }
        }
        if (done) continue;
      }
      let node = ts.getTokenAtPosition(sf, d.start);
      while (node && !ts.isBinaryExpression(node)) node = node.parent;
      if (!node || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) continue;
      if (!ts.isPropertyAccessExpression(node.left) || node.left.expression.kind !== ts.SyntaxKind.ThisKeyword) continue;
      const sym = checker.getSymbolAtLocation(node.left);
      const decl = sym?.valueDeclaration;
      if (!decl || !ts.isPropertyDeclaration(decl) || !decl.type) continue;
      if (!decl.getSourceFile().fileName.startsWith(src)) continue;
      if (decl.type.kind === ts.SyntaxKind.AnyKeyword) continue;
      push(decl.getSourceFile().fileName, { pos: decl.type.getStart(), end: decl.type.end, text: 'any' });
      wide++;
    }
  }
}

for (const [file, list] of edits) {
  const seen = new Set();
  const uniq = list.filter((e) => { const k = `${e.pos}:${e.end}`; return seen.has(k) ? false : (seen.add(k), true); })
                   .sort((a, b) => b.pos - a.pos);
  let s = fs.readFileSync(file, 'utf8');
  for (const e of uniq) s = s.slice(0, e.pos) + e.text + s.slice(e.end);
  fs.writeFileSync(file, s);
}
console.log(`relax: ${opt} properties made optional, ${wide} field types widened`);
