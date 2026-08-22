#!/usr/bin/env node
/**
 * Replace `any` on a parameter with what its own body already proves.
 *
 *   node usage.mts <root> [tsconfig] [srcPrefix] [--dry] [--only=<substr>]
 *
 * `infer --params` reads a parameter's *call sites*. This one reads its *uses*.
 * `ao(x: any, y: any, z: any) { return this.L.occlusion(x, y, z); }` is the
 * shape the caller-based pass cannot touch -- every caller passes an `any` --
 * and the shape the body settles instantly, because `occlusion` declares
 * `(x: number, y: number, z: number)`.
 *
 * A use contributes a constraint when the language already pins it:
 *
 *   - passed as argument *i* to a signature whose parameter *i* has a real type
 *   - an operand of an arithmetic or ordering operator          -> number
 *   - `-p`, `+p`, `p++`, `p--`, `p -= 1`                        -> number
 *   - assigned into a typed field, variable or property         -> that type
 *   - returned from a function with a declared return type      -> that type
 *
 * Everything else (property reads, `p || d`, index expressions, `typeof`)
 * contributes nothing. The parameter is annotated only when at least one use
 * constrained it and every constraint agreed on one printable type -- the same
 * "types a reader can use" bar `infer` holds: primitives, named classes and
 * interfaces, arrays and `| null` of those, never an anonymous shape.
 *
 * The callers are then consulted, not to decide the type but to check it. A
 * caller passing `null` widens the annotation to `T | null` -- `B.glow(MAGITEK,
 * 2.6)` and `B.glow(null)` mean the parameter is nullable however numerically
 * the body uses it. A caller passing something the type would reject means the
 * body and the call sites genuinely disagree; the parameter is left alone,
 * because that is a design question and not an inference.
 */
import ts from 'typescript-api';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const tsconfig = process.argv[3] ?? 'tsconfig.json';
const prefix = path.resolve(root, process.argv[4] ?? 'src');
const flags = process.argv.slice(5);
const dry = flags.includes('--dry');
const only = flags.find((f) => f.startsWith('--only='))?.slice(7) ?? null;

const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(root, tsconfig), ts.sys.readFile).config, ts.sys, root);
const program = ts.createProgram(cfg.fileNames, { ...cfg.options, noEmit: true });
const checker = program.getTypeChecker();

/** Where a symbol is declared, as far as import strategy cares. */
function origin(sym) {
  const d = sym?.declarations?.[0];
  if (!d) return null;
  const f = d.getSourceFile().fileName;
  if (/node_modules\/typescript\/lib\//.test(f)) return { kind: 'global' };
  if (/node_modules\/@types\/three\//.test(f) || /node_modules\/three\//.test(f)) return { kind: 'three' };
  if (f.startsWith(prefix) || f.startsWith(path.resolve(root, 'src'))) return { kind: 'local', file: f };
  return null;
}

/** A printable type, plus what importing it needs. Same bar as `infer`. */
function printType(t, depth = 0) {
  if (!t || depth > 2) return null;
  const F = ts.TypeFlags;
  if (t.flags & (F.Any | F.Unknown | F.Never | F.TypeParameter | F.Index | F.Conditional)) return null;
  if (t.flags & F.BooleanLike) return { text: 'boolean', need: [] };
  if (t.flags & F.NumberLike) return { text: 'number', need: [] };
  if (t.flags & F.StringLike) return { text: 'string', need: [] };
  if (t.flags & F.Void) return { text: 'void', need: [] };
  if (t.isUnion()) {
    const parts = t.types.filter((x) => !(x.flags & (F.Null | F.Undefined)));
    const nullable = t.types.length !== parts.length;
    if (parts.length !== 1) {
      if (t.types.length === 2 && t.types.every((x) => x.flags & F.BooleanLiteral)) return { text: 'boolean', need: [] };
      return null;
    }
    const inner = printType(parts[0], depth);
    return inner && { text: nullable ? `${inner.text} | null` : inner.text, need: inner.need };
  }
  if (checker.isArrayType?.(t)) {
    const el = checker.getTypeArguments(t)[0];
    const inner = printType(el, depth + 1);
    if (!inner || inner.text.includes('|')) return null;
    return { text: `${inner.text}[]`, need: inner.need };
  }
  const sym = t.getSymbol?.() ?? t.symbol;
  if (!sym) return null;
  const name = sym.getName();
  if (!name || name === '__type' || name === '__object' || name === 'Object') return null;
  const decl = sym.declarations?.[0];
  const isNamed = decl && (ts.isClassDeclaration(decl) || ts.isInterfaceDeclaration(decl) ||
    ts.isTypeAliasDeclaration(decl) || ts.isClassExpression(decl) || ts.isEnumDeclaration(decl));
  if (!isNamed) return null;
  const args = checker.getTypeArguments?.(t) ?? [];
  const ownParams = decl.typeParameters?.length ?? 0;
  if (args.length && ownParams) {
    const ok = args.every((a) => { const p = printType(a, depth + 1); return p && !p.text.includes('any'); });
    if (!ok) return null;
  }
  const o = origin(sym);
  if (!o) return null;
  if (o.kind === 'global') return { text: name, need: [] };
  // three's `Vector3Like` / `ColorLike` are the structural supertypes its own
  // signatures accept. Writing one onto a parameter throws away every method
  // the body two frames down wanted to call, so refuse them and let the caller
  // pass decide instead.
  if (o.kind === 'three') return /Like$/.test(name) ? null : { text: `THREE.${name}`, need: [{ kind: 'three' }] };
  return { text: name, need: [{ kind: 'local', file: o.file, name }] };
}

/** Operators that only make sense on numbers. `+` is not one of them. */
const NUMERIC_BINARY = new Set([
  ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.PercentToken, ts.SyntaxKind.AsteriskAsteriskToken,
  ts.SyntaxKind.LessThanToken, ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.MinusEqualsToken, ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken, ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.LessThanLessThanToken, ts.SyntaxKind.GreaterThanGreaterThanToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken,
  ts.SyntaxKind.AmpersandToken, ts.SyntaxKind.BarToken, ts.SyntaxKind.CaretToken,
]);

const NUMBER = { text: 'number', need: [] };

/**
 * The type without the `undefined` an *optional* parameter carries. Three's
 * `BoxGeometry(width?: number, ...)` hands back `number | undefined`, and
 * printing that as `number | null` would spread a nullability the callee never
 * meant -- optionality is about arity, not about the value. A declared `| null`
 * is a real claim and survives.
 */
function stripUndefined(t) {
  if (!t?.isUnion?.()) return t;
  const parts = t.types.filter((x) => !(x.flags & ts.TypeFlags.Undefined));
  if (parts.length === t.types.length) return t;
  if (parts.length === 1) return parts[0];
  return checker.getUnionType ? checker.getUnionType(parts) : t;
}

/** The enclosing function of a node, or null. */
function enclosingFunction(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isArrowFunction(p) ||
        ts.isMethodDeclaration(p) || ts.isConstructorDeclaration(p) ||
        ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)) return p;
  }
  return null;
}

/**
 * The constraint one reference to the parameter imposes, or null for none.
 * `id` is the identifier node; it has already been matched to the parameter.
 */
function constraintAt(id) {
  const p = id.parent;
  if (!p) return null;

  // `f(.., p, ..)` / `new C(.., p, ..)` -- parameter `i` of the resolved signature.
  if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.arguments) {
    const i = p.arguments.indexOf(id);
    if (i >= 0) {
      const sig = checker.getResolvedSignature(p);
      const decl = sig?.declaration;
      const params = decl?.parameters;
      if (!params) return null;
      // A rest parameter absorbs every argument past its own index.
      const last = params[params.length - 1];
      const target = params[i] ?? (last?.dotDotDotToken ? last : null);
      if (!target) return null;
      let t = checker.getTypeAtLocation(target);
      if (target.dotDotDotToken && checker.isArrayType?.(t)) t = checker.getTypeArguments(t)[0];
      // Its own declared annotation must be real; an inferred-from-default
      // literal type would pin `1` where the author meant `number`.
      if (!target.type) return null;
      if (target.type.kind === ts.SyntaxKind.AnyKeyword) return null;
      return printType(checker.getBaseTypeOfLiteralType(stripUndefined(t)));
    }
  }

  // Arithmetic and ordering.
  if (ts.isBinaryExpression(p)) {
    const op = p.operatorToken.kind;
    if (NUMERIC_BINARY.has(op)) return NUMBER;
    if (op === ts.SyntaxKind.PlusToken || op === ts.SyntaxKind.PlusEqualsToken) {
      // `+` is string concatenation too; only a numeric partner settles it.
      const other = p.left === id ? p.right : p.left;
      const ot = checker.getTypeAtLocation(other);
      if (ot.flags & ts.TypeFlags.NumberLike) return NUMBER;
      return null;
    }
    // `field = p` / `local = p` -- the left side's declared type.
    if (op === ts.SyntaxKind.EqualsToken && p.right === id) {
      const lt = checker.getTypeAtLocation(p.left);
      return printType(checker.getBaseTypeOfLiteralType(stripUndefined(lt)));
    }
    return null;
  }

  if (ts.isPrefixUnaryExpression(p) &&
      (p.operator === ts.SyntaxKind.MinusToken || p.operator === ts.SyntaxKind.TildeToken)) return NUMBER;
  if (ts.isPostfixUnaryExpression(p)) return NUMBER;

  // `return p` from a function that declares what it returns.
  if (ts.isReturnStatement(p)) {
    const fn = enclosingFunction(p);
    if (fn?.type && fn.type.kind !== ts.SyntaxKind.AnyKeyword) {
      return printType(checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(fn.type)));
    }
    return null;
  }

  return null;
}

/**
 * Every `p: any` parameter declaration, mapped to the types its call sites
 * actually pass. `null` in the list means the argument was omitted there.
 */
const argsFor = new Map();
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !sf.fileName.startsWith(prefix)) continue;
  const visit = (n) => {
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const decl = checker.getResolvedSignature(n)?.declaration;
      if (decl?.parameters && decl.getSourceFile().fileName.startsWith(prefix)) {
        const args = n.arguments ?? [];
        decl.parameters.forEach((p, i) => {
          if (p.type?.kind !== ts.SyntaxKind.AnyKeyword || p.dotDotDotToken) return;
          const a = args[i];
          const list = argsFor.get(p) ?? (argsFor.set(p, []), argsFor.get(p));
          list.push(a ? checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(a)) : null);
        });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

/**
 * What the callers say about a type the body proposed: keep it, widen it to
 * `| null`, or drop the parameter entirely because a caller contradicts it.
 */
function reconcile(param, text) {
  const seen = argsFor.get(param);
  if (!seen?.length) return { verdict: 'ok', text };
  const F = ts.TypeFlags;
  let nullable = text.includes('null');
  for (const t of seen) {
    if (t === null) continue;                       // omitted; arity, not type
    if (t.flags & (F.Null | F.Undefined)) { nullable = true; continue; }
    if (t.flags & (F.Any | F.Unknown)) continue;    // says nothing either way
    const p = printType(t);
    if (!p) continue;                               // unprintable, not a conflict
    if (p.text !== text && p.text !== text.replace(' | null', '')) return { verdict: 'skip' };
  }
  return { verdict: 'ok', text: nullable && !text.includes('null') ? `${text} | null` : text };
}

const edits = new Map();
const imports = new Map();
const push = (file, e) => { const l = edits.get(file) ?? (edits.set(file, []), edits.get(file)); l.push(e); };
const wantImport = (file, key) => { const s = imports.get(file) ?? (imports.set(file, new Set()), imports.get(file)); s.add(key); };

let nParams = 0, nSkipped = 0;
const hist = new Map();
const REPORT = [];

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !sf.fileName.startsWith(prefix)) continue;
  if (only && !sf.fileName.includes(only)) continue;

  /** Every `p: any` parameter of every function in the file, with its body. */
  const targets = [];
  const collect = (n) => {
    const params = n.parameters;
    if (params && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
                   ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n) || ts.isSetAccessorDeclaration(n))) {
      for (const p of params) {
        if (p.type?.kind === ts.SyntaxKind.AnyKeyword && !p.dotDotDotToken && ts.isIdentifier(p.name) && n.body) {
          targets.push({ param: p, body: n.body });
        }
      }
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);

  for (const { param, body } of targets) {
    const sym = checker.getSymbolAtLocation(param.name);
    if (!sym) continue;
    const constraints = [];
    let sawUse = false;
    const walk = (n) => {
      if (ts.isIdentifier(n) && n.text === param.name.text && checker.getSymbolAtLocation(n) === sym) {
        sawUse = true;
        const c = constraintAt(n);
        if (c) constraints.push(c);
      }
      ts.forEachChild(n, walk);
    };
    walk(body);
    if (!sawUse || !constraints.length) continue;
    const texts = new Set(constraints.map((c) => c.text));
    if (texts.size !== 1) continue;
    let text = [...texts][0];
    if (text.includes('any')) continue;
    const verdict = reconcile(param, text);
    if (verdict.verdict === 'skip') { nSkipped++; continue; }
    text = verdict.text;
    // A parameter with a default already narrows itself; only widen, never
    // contradict -- `(n = 0)` annotated `string` is a bug, not an inference.
    if (param.initializer) {
      const it = checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(param.initializer));
      const ip = printType(it);
      if (ip && ip.text !== text && !text.startsWith(ip.text)) continue;
    }
    push(sf.fileName, { pos: param.type.getStart(sf), end: param.type.end, text });
    for (const need of constraints[0].need) wantImport(sf.fileName, need.kind === 'three' ? 'three' : `local:${need.file}:${need.name}`);
    nParams++;
    hist.set(text, (hist.get(text) ?? 0) + 1);
    if (dry) REPORT.push(`${path.relative(root, sf.fileName)}:${sf.getLineAndCharacterOfPosition(param.getStart(sf)).line + 1}  ${param.name.text}: ${text}`);
  }
}

// ---- apply -----------------------------------------------------------------
let files = 0;
if (!dry) {
  for (const [file, list] of edits) {
    let src = fs.readFileSync(file, 'utf8');
    const need = imports.get(file) ?? new Set();
    const add = [];
    for (const key of need) {
      if (key === 'three') {
        if (!/^import \* as THREE from 'three';/m.test(src) && !/^import type \* as THREE from 'three';/m.test(src)) {
          add.push("import type * as THREE from 'three';");
        }
        continue;
      }
      const [, target, name] = key.split(/local:(.*):([^:]*)$/);
      let rel = path.relative(path.dirname(file), target);
      if (!rel.startsWith('.')) rel = `./${rel}`;
      if (target === file) continue;
      const already = new RegExp(`^import[^\\n]*\\b${name}\\b[^\\n]*from '[^']*';`, 'm').test(src);
      if (!already) add.push(`import type { ${name} } from '${rel}';`);
    }
    const seen = new Set();
    const uniq = list.filter((e) => (seen.has(e.pos) ? false : (seen.add(e.pos), true))).sort((a, b) => b.pos - a.pos);
    for (const e of uniq) src = src.slice(0, e.pos) + e.text + src.slice(e.end);
    if (add.length) {
      const lines = src.split('\n');
      let last = -1, open = false;
      for (let i = 0; i < lines.length; i++) {
        if (/^import /.test(lines[i])) { last = i; open = !/;\s*$/.test(lines[i]); }
        else if (open && /^\}\s*from\s*'/.test(lines[i])) { last = i; open = false; }
      }
      lines.splice(last + 1, 0, ...[...new Set(add)]);
      src = lines.join('\n');
    }
    fs.writeFileSync(file, src);
    files++;
  }
}
if (dry && REPORT.length) console.log(REPORT.slice(0, 60).join('\n'));
console.log(`usage: ${nParams} params across ${files || edits.size} files, ${nSkipped} left alone (callers disagree)`);
console.log([...hist].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `  ${String(v).padStart(4)}  ${k}`).join('\n'));
