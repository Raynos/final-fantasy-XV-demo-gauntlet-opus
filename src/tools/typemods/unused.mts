#!/usr/bin/env node
/**
 * Remove what `noUnusedLocals` found: unused import specifiers and unused
 * declarations whose initializer cannot have a side effect. Anything
 * initialised by a call is reported, not deleted -- the call may matter even
 * though the binding does not.
 */
import ts from 'typescript-api';
import fs from 'node:fs';
import path from 'node:path';

const [errFile, root] = process.argv.slice(2);
const RE = /^(.+?)\((\d+),(\d+)\): error TS6133: '([^']+)'/;
const byFile = new Map();
for (const l of fs.readFileSync(errFile, 'utf8').split('\n')) {
  const m = RE.exec(l);
  if (!m) continue;
  const arr = byFile.get(m[1]) ?? (byFile.set(m[1], []), byFile.get(m[1]));
  arr.push({ line: +m[2], col: +m[3], name: m[4] });
}

const pure = (n) => !n || ts.isNewExpression(n) || ts.isObjectLiteralExpression(n) || ts.isArrayLiteralExpression(n) ||
  ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) ||
  ts.isIdentifier(n) || ts.isPropertyAccessExpression(n) || ts.isTemplateExpression(n) ||
  ts.isNoSubstitutionTemplateLiteral(n) || n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword;

let removed = 0;
const skipped = [];
for (const [file, errs] of byFile) {
  const abs = path.resolve(root, file);
  const src = fs.readFileSync(abs, 'utf8');
  const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const want = new Map(errs.map((e) => [sf.getPositionOfLineAndCharacter(e.line - 1, e.col - 1), e]));
  const edits = [];
  const visit = (n) => {
    if (ts.isImportSpecifier(n) || ts.isImportClause(n) || ts.isNamespaceImport(n)) {
      const nameNode = ts.isImportClause(n) ? n.name : n.name;
      if (nameNode && want.has(nameNode.getStart(sf))) {
        const decl = ts.isImportSpecifier(n) ? n.parent : null; // NamedImports
        if (decl && decl.elements.length > 1) {
          const i = decl.elements.indexOf(n);
          const from = i > 0 ? decl.elements[i - 1].end : n.getStart(sf);
          const to = i > 0 ? n.end : decl.elements[i + 1].getStart(sf);
          edits.push({ pos: from, end: to });
        } else {
          let stmt = n; while (stmt && !ts.isImportDeclaration(stmt)) stmt = stmt.parent;
          if (stmt) edits.push({ pos: stmt.getStart(sf), end: Math.min(src.length, stmt.end + 1) });
        }
        removed++;
      }
    }
    if (ts.isBindingElement(n) && ts.isIdentifier(n.name) && want.has(n.name.getStart(sf))) {
      const pat = n.parent;
      const i = pat.elements.indexOf(n);
      const from = i > 0 ? pat.elements[i - 1].end : n.getStart(sf);
      const to = i > 0 ? n.end : (pat.elements[i + 1] ? pat.elements[i + 1].getStart(sf) : n.end);
      edits.push({ pos: from, end: to });
      removed++;
    }
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && want.has(n.name.getStart(sf))) {
      if (!pure(n.initializer) && !process.argv.includes('--impure')) { skipped.push(`${file} ${n.name.text}`); }
      else {
        const list = n.parent;
        if (list.declarations.length > 1) {
          const i = list.declarations.indexOf(n);
          const from = i > 0 ? list.declarations[i - 1].end : n.getStart(sf);
          const to = i > 0 ? n.end : list.declarations[i + 1].getStart(sf);
          edits.push({ pos: from, end: to });
        } else {
          const stmt = list.parent;
          // getStart, never getFullStart: leading trivia is the doc comment
          // above the declaration, and deleting that with it loses the note
          // that explains the code below.
          const lineStart = src.lastIndexOf('\n', stmt.getStart(sf)) + 1;
          const blank = src.slice(lineStart, stmt.getStart(sf)).trim() === '';
          edits.push({ pos: blank ? lineStart : stmt.getStart(sf), end: stmt.end + (src[stmt.end] === '\n' ? 1 : 0) });
        }
        removed++;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  edits.sort((a, b) => b.pos - a.pos);
  let out = src;
  for (const e of edits) out = out.slice(0, e.pos) + out.slice(e.end);
  fs.writeFileSync(abs, out);
}
console.log(`unused: ${removed} removed`);
if (skipped.length) console.log('SKIPPED (call initialiser, read by hand):\n' + skipped.join('\n'));
