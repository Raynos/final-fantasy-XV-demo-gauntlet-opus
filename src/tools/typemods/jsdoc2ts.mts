#!/usr/bin/env node
/**
 * Turn the JSDoc types this codebase already carries into real annotations.
 *
 * 1,491 `@param {T}` tags were written by hand over the project's life and are
 * ignored outright once a file is `.ts`. Converting them is strictly better
 * than the `: any` the fallback pass would otherwise write, and it keeps the
 * intent the author recorded.
 *
 *   node jsdoc2ts.mts <file...>
 */
import ts from 'typescript-api';
import fs from 'node:fs';

const NAME_MAP = { object: 'any', Object: 'any', Function: '((...args: any[]) => any)', Array: 'any[]', '*': 'any' };

function mapText(t) {
  return t.replace(/\bobject\b/g, 'any').replace(/\bObject\b/g, 'any')
          .replace(/\bFunction\b/g, '((...args: any[]) => any)').replace(/\*/g, 'any');
}

function typeText(n) {
  const t = typeText_(n);
  return t == null ? t : (/[\n@]/.test(t) ? 'any' : t);
}

function typeText_(n) {
  if (!n) return null;
  switch (n.kind) {
    case ts.SyntaxKind.JSDocAllType:
    case ts.SyntaxKind.JSDocUnknownType: return 'any';
    case ts.SyntaxKind.JSDocNullableType: return `${typeText(n.type)} | null`;
    case ts.SyntaxKind.JSDocNonNullableType: return typeText(n.type);
    case ts.SyntaxKind.JSDocOptionalType: return typeText(n.type);
    case ts.SyntaxKind.JSDocVariadicType: return `${typeText(n.type)}[]`;
    case ts.SyntaxKind.UnionType: return n.types.map(typeText).join(' | ');
    case ts.SyntaxKind.ArrayType: return `${typeText(n.elementType)}[]`;
    case ts.SyntaxKind.ParenthesizedType: return `(${typeText(n.type)})`;
    case ts.SyntaxKind.JSDocFunctionType: {
      const ps = n.parameters.map((p, i) => `a${i}: ${typeText(p.type) ?? 'any'}`).join(', ');
      return `((${ps}) => ${n.type ? typeText(n.type) : 'any'})`;
    }
    case ts.SyntaxKind.JSDocTypeLiteral: {
      const props = (n.jsDocPropertyTags ?? []).map((t) => {
        const nm = ts.isQualifiedName(t.name) ? t.name.right.text : t.name.text;
        const inner = t.typeExpression?.type ? typeText(t.typeExpression.type) : 'any';
        const opt = t.isBracketed || t.typeExpression?.type?.kind === ts.SyntaxKind.JSDocOptionalType;
        return `${nm}${opt ? '?' : ''}: ${inner}`;
      });
      if (!props.length) return 'any';
      const obj = `{ ${props.join(', ')} }`;
      return n.isArrayType ? `${obj}[]` : obj;
    }
    case ts.SyntaxKind.TypeReference: {
      const name = n.typeName.getText();
      if (!n.typeArguments?.length && NAME_MAP[name]) return NAME_MAP[name];
      const args = n.typeArguments?.length ? `<${n.typeArguments.map(typeText).join(', ')}>` : '';
      return name + args;
    }
  }
  return mapText(n.getText());
}

let files = 0, params = 0, returns = 0, vars = 0;
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const edits = [];
  const strip = (tag) => {
    // drop the now-duplicated `{T}` from the tag, keeping the description
    const te = tag.typeExpression;
    if (!te) return;
    let end = te.end;
    if (src[end] === ' ') end++;
    edits.push({ pos: te.pos + (src.slice(te.pos, te.end).length - src.slice(te.pos, te.end).trimStart().length), end, text: '' });
  };

  const annotate = (node) => {
    if (!node.parameters) return;
    for (const p of node.parameters) {
      const tags = ts.getJSDocParameterTags(p);
      const tag = tags?.find((t) => t.typeExpression);
      if (!tag || p.type) continue;
      const t = typeText(tag.typeExpression.type);
      if (!t) continue;
      const optional = tag.isBracketed || tag.typeExpression.type.kind === ts.SyntaxKind.JSDocOptionalType;
      const canOptional = optional && !p.initializer && !p.dotDotDotToken;
      edits.push({ pos: p.name.end, end: p.name.end, text: `${canOptional ? '?' : ''}: ${t}` });
      params++;
      strip(tag);
    }
    if (!node.type) {
      const rt = ts.getJSDocReturnTag(node);
      if (rt?.typeExpression && node.parameters) {
        const isArrow = ts.isArrowFunction(node);
        const close = src.indexOf(')', node.parameters.end === node.pos ? node.getStart(sf) : node.parameters.end);
        const hasParens = !isArrow || src.slice(node.getStart(sf), node.body.pos).includes('(');
        if (close > 0 && hasParens && !ts.isSetAccessor(node)) {
          const t = typeText(rt.typeExpression.type);
          if (t) { edits.push({ pos: close + 1, end: close + 1, text: `: ${t}` }); returns++; strip(rt); }
        }
      }
    }
  };

  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n) ||
        ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n)) annotate(n);
    if (ts.isVariableDeclaration(n) && !n.type && ts.isIdentifier(n.name)) {
      const st = n.parent?.parent;
      const tt = st && ts.isVariableStatement(st) ? ts.getJSDocType(st) : null;
      if (tt && st.declarationList.declarations.length === 1) {
        const t = typeText(tt);
        if (t) {
          edits.push({ pos: n.name.end, end: n.name.end, text: `: ${t}` });
          vars++;
          const tag = ts.getJSDocTypeTag(st);
          if (tag) strip(tag);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  if (edits.length) {
    edits.sort((a, b) => b.pos - a.pos || b.end - a.end);
    let out = src;
    for (const e of edits) out = out.slice(0, e.pos) + e.text + out.slice(e.end);
    fs.writeFileSync(file, out);
    files++;
  }
}
console.log(`jsdoc2ts: ${params} params, ${returns} returns, ${vars} vars across ${files} files`);
