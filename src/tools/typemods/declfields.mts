#!/usr/bin/env node
/**
 * Declare class fields that TypeScript reports as missing on `this`.
 *
 * Driven by tsc's own TS2339 output (so base-class members from three.js are
 * never shadowed), typed by a conservative read of every `this.X = ...` in the
 * class. Anything the heuristic cannot agree on becomes `any`.
 *
 *   node declfields.mjs <tsc-error-file> <repo-root>
 */
import ts from 'typescript-api';
import fs from 'node:fs';
import path from 'node:path';

const [errFile, root] = process.argv.slice(2);
const lines = fs.readFileSync(errFile, 'utf8').split('\n');

// file -> class -> Set(prop)
const missing = new Map();
const RE = /^(.+?)\((\d+),(\d+)\): error TS(?:2339|2551): Property '([^']+)' does not exist on type '([^']+)'\./;
for (const l of lines) {
  const m = RE.exec(l);
  if (!m) continue;
  const [, file, , , prop, type] = m;
  if (!/^[A-Z]/.test(type)) continue; // only class-ish receivers
  const byClass = missing.get(file) ?? (missing.set(file, new Map()), missing.get(file));
  const set = byClass.get(type) ?? (byClass.set(type, new Set()), byClass.get(type));
  set.add(prop);
}

/** Type string for an assignment RHS, or null when it says nothing useful. */
function typeOf(node, sf) {
  if (!node) return null;
  if (ts.isParenthesizedExpression(node)) return typeOf(node.expression, sf);
  switch (node.kind) {
    case ts.SyntaxKind.NumericLiteral: return 'number';
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.TemplateExpression: return 'string';
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword: return 'boolean';
    case ts.SyntaxKind.NullKeyword: return 'null';
  }
  if (ts.isIdentifier(node) && node.text === 'undefined') return 'null';
  if (ts.isPrefixUnaryExpression(node)) {
    if (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken)
      return ts.isNumericLiteral(node.operand) ? 'number' : null;
    if (node.operator === ts.SyntaxKind.ExclamationToken) return 'boolean';
    return null;
  }
  if (ts.isNewExpression(node)) {
    const e = node.expression;
    if (ts.isIdentifier(e)) return e.text;
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression))
      return `${e.expression.text}.${e.name.text}`;
    return null;
  }
  if (ts.isArrayLiteralExpression(node)) {
    if (node.elements.length === 0) return 'any[]';
    const els = node.elements.map((e) => typeOf(e, sf));
    return els.every((t) => t === 'number') ? 'number[]' : null;
  }
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        op === ts.SyntaxKind.LessThanToken || op === ts.SyntaxKind.GreaterThanToken ||
        op === ts.SyntaxKind.LessThanEqualsToken || op === ts.SyntaxKind.GreaterThanEqualsToken ||
        op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken) return 'boolean';
    if (op === ts.SyntaxKind.AsteriskToken || op === ts.SyntaxKind.SlashToken ||
        op === ts.SyntaxKind.MinusToken || op === ts.SyntaxKind.PercentToken) return 'number';
  }
  return null;
}

function merge(types) {
  const set = new Set(types.filter(Boolean));
  const nullable = set.delete('null');
  if (set.size === 0) return 'any';
  if (set.size > 1) return 'any';
  const t = [...set][0];
  return nullable ? `${t} | null` : t;
}

let filesTouched = 0, declsAdded = 0;
for (const [file, byClass] of missing) {
  const abs = path.resolve(root, file);
  if (!fs.existsSync(abs)) continue;
  const src = fs.readFileSync(abs, 'utf8');
  const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const edits = [];

  const visit = (node) => {
    if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name && byClass.has(node.name.text)) {
      const want = byClass.get(node.name.text);
      const declared = new Set();
      for (const m of node.members) if (m.name && ts.isIdentifier(m.name)) declared.add(m.name.text);
      // every `this.X <assign-op> rhs` inside this class, for the type read
      const rhs = new Map();
      const scan = (n) => {
        if (n !== node && (ts.isClassDeclaration(n) || ts.isClassExpression(n))) return;
        if (ts.isBinaryExpression(n) && ts.isPropertyAccessExpression(n.left) &&
            n.left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(n.left.name)) {
          const op = n.operatorToken.kind, name = n.left.name.text;
          const list = rhs.get(name) ?? (rhs.set(name, []), rhs.get(name));
          if (op === ts.SyntaxKind.EqualsToken) list.push(typeOf(n.right, sf));
          else if (op === ts.SyntaxKind.PlusEqualsToken || op === ts.SyntaxKind.MinusEqualsToken ||
                   op === ts.SyntaxKind.AsteriskEqualsToken || op === ts.SyntaxKind.SlashEqualsToken) list.push('number');
          else if (op === ts.SyntaxKind.QuestionQuestionEqualsToken || op === ts.SyntaxKind.BarBarEqualsToken ||
                   op === ts.SyntaxKind.AmpersandAmpersandEqualsToken) list.push(typeOf(n.right, sf));
        }
        if ((ts.isPostfixUnaryExpression(n) || ts.isPrefixUnaryExpression(n)) &&
            (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken) &&
            ts.isPropertyAccessExpression(n.operand) && n.operand.expression.kind === ts.SyntaxKind.ThisKeyword &&
            ts.isIdentifier(n.operand.name)) {
          const name = n.operand.name.text;
          const list = rhs.get(name) ?? (rhs.set(name, []), rhs.get(name));
          list.push('number');
        }
        ts.forEachChild(n, scan);
      };
      ts.forEachChild(node, scan);

      const props = [...want].filter((p) => !declared.has(p)).sort();
      if (props.length) {
        const openBrace = src.indexOf('{', node.members.pos === node.pos ? node.getStart(sf) : node.getStart(sf));
        const bodyStart = node.members.pos; // right after `{`
        const classLineStart = src.lastIndexOf('\n', node.getStart(sf)) + 1;
        const indent = ' '.repeat(node.getStart(sf) - classLineStart + 2);
        for (const p of props) if (!(rhs.get(p) ?? []).length) console.log(`  NEVER-ASSIGNED ${path.relative(root, abs)} ${node.name.text}.${p}`);
        const text = '\n' + props.map((p) => `${indent}${/^[A-Za-z_$][\w$]*$/.test(p) ? p : JSON.stringify(p)}!: ${merge(rhs.get(p) ?? [])};`).join('\n');
        edits.push({ pos: bodyStart, text });
        declsAdded += props.length;
        void openBrace;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (edits.length) {
    edits.sort((a, b) => b.pos - a.pos);
    let out = src;
    for (const e of edits) out = out.slice(0, e.pos) + e.text + out.slice(e.pos);
    fs.writeFileSync(abs, out);
    filesTouched++;
  }
}
console.log(`declfields: ${declsAdded} declarations across ${filesTouched} files`);
