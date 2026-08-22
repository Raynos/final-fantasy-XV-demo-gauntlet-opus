#!/usr/bin/env node
/**
 * Replace `any` with what the checker already knows.
 *
 *   node infer.mts <root> [tsconfig] [srcPrefix] [--fields] [--params] [--dry]
 *
 * Fields: a field declared `x!: any` takes the type of what is assigned to it,
 * when every assignment agrees on one clean named type.
 * Params: a parameter declared `p: any` takes the type of what is passed to it,
 * when every call site agrees.
 *
 * A "clean" type is a primitive, a class or interface instance, or an array or
 * `| null` of one. Anonymous object shapes, function types, unions wider than
 * `T | null` and anything containing `any` are refused -- writing those out
 * would be noise, and the point is types a reader can use.
 */
import ts from 'typescript-api';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const tsconfig = process.argv[3] ?? 'tsconfig.json';
const prefix = path.resolve(root, process.argv[4] ?? 'src');
const flags = process.argv.slice(5);
const doFields = flags.includes('--fields') || !flags.some((f) => f === '--params');
const doParams = flags.includes('--params');
const dry = flags.includes('--dry');

const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(root, tsconfig), ts.sys.readFile).config, ts.sys, root);
const program = ts.createProgram(cfg.fileNames, { ...cfg.options, noEmit: true });
const checker = program.getTypeChecker();

const PRIMS = new Set(['number', 'string', 'boolean', 'void', 'bigint', 'symbol']);

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

/**
 * A printable type, plus what importing it needs.
 * @returns {{text:string, need:Array<{kind:string,file?:string,name?:string}>}|null}
 */
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
      // `boolean` arrives as `true | false`
      const p = printBool(t);
      if (p) return p;
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
  // A generic instantiation prints its arguments; refuse unless they are all clean.
  const args = checker.getTypeArguments?.(t) ?? [];
  const ownParams = decl.typeParameters?.length ?? 0;
  if (args.length && ownParams) {
    const allDefault = args.every((a) => {
      const p = printType(a, depth + 1);
      return p && !p.text.includes('any');
    });
    if (!allDefault) return null;
  }
  const o = origin(sym);
  if (!o) return null;
  if (o.kind === 'global') return { text: name, need: [] };
  if (o.kind === 'three') return { text: `THREE.${name}`, need: [{ kind: 'three' }] };
  return { text: name, need: [{ kind: 'local', file: o.file, name }] };
}

function printBool(t) {
  const F = ts.TypeFlags;
  if (t.isUnion() && t.types.length === 2 && t.types.every((x) => x.flags & F.BooleanLiteral)) {
    return { text: 'boolean', need: [] };
  }
  return null;
}

const edits = new Map();      // file -> [{pos,end,text}]
const imports = new Map();    // file -> Set of "three" | "local:<file>:<name>"
const push = (file, e) => { const l = edits.get(file) ?? (edits.set(file, []), edits.get(file)); l.push(e); };
const wantImport = (file, key) => { const s = imports.get(file) ?? (imports.set(file, new Set()), imports.get(file)); s.add(key); };

let nFields = 0, nParams = 0;
const hist = new Map();

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !sf.fileName.startsWith(prefix)) continue;

  const visit = (n) => {
    if (doFields && ts.isClassDeclaration(n)) {
      const anyFields = new Map();
      for (const m of n.members) {
        if (ts.isPropertyDeclaration(m) && m.type?.kind === ts.SyntaxKind.AnyKeyword &&
            m.name && ts.isIdentifier(m.name)) anyFields.set(m.name.text, m);
      }
      if (anyFields.size) {
        const seen = new Map();
        const scan = (x) => {
          if (x !== n && (ts.isClassDeclaration(x) || ts.isClassExpression(x))) return;
          if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
              ts.isPropertyAccessExpression(x.left) && x.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
              ts.isIdentifier(x.left.name) && anyFields.has(x.left.name.text)) {
            const key = x.left.name.text;
            const list = seen.get(key) ?? (seen.set(key, []), seen.get(key));
            list.push(x.right);
          }
          ts.forEachChild(x, scan);
        };
        ts.forEachChild(n, scan);
        for (const [name, member] of anyFields) {
          const rhs = seen.get(name);
          if (!rhs || !rhs.length) continue;
          const printed = rhs.map((r) => printType(checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(r))));
          const nulls = rhs.filter((r) => {
            const f = checker.getTypeAtLocation(r).flags;
            return f & (ts.TypeFlags.Null | ts.TypeFlags.Undefined);
          }).length;
          const real = printed.filter(Boolean);
          if (real.length + nulls !== printed.length) continue;    // something unprintable
          const texts = new Set(real.map((p) => p.text));
          if (texts.size !== 1) continue;
          let text = [...texts][0];
          if (nulls && !text.includes('null')) text += ' | null';
          push(sf.fileName, { pos: member.type.getStart(sf), end: member.type.end, text });
          for (const need of real[0].need) wantImport(sf.fileName, need.kind === 'three' ? 'three' : `local:${need.file}:${need.name}`);
          nFields++;
          hist.set(text, (hist.get(text) ?? 0) + 1);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

if (doParams) {
  // index every call site by the signature it resolves to
  const argsFor = new Map();  // paramDecl -> [types]
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || !sf.fileName.startsWith(prefix)) continue;
    const visit = (n) => {
      if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
        const sig = checker.getResolvedSignature(n);
        const decl = sig?.declaration;
        if (decl?.parameters && decl.getSourceFile().fileName.startsWith(prefix)) {
          const args = n.arguments ?? [];
          decl.parameters.forEach((p, i) => {
            if (!p.type || p.type.kind !== ts.SyntaxKind.AnyKeyword || p.dotDotDotToken) return;
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
  for (const [p, types] of argsFor) {
    if (!types.length) continue;
    const missing = types.filter((t) => t === null).length;      // omitted at some call site
    const nulls = types.filter((t) => t && (t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))).length;
    const real = types.filter((t) => t && !(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))).map((t) => printType(t));
    if (!real.length || real.some((x) => !x)) continue;
    const texts = new Set(real.map((x) => x.text));
    if (texts.size !== 1) continue;
    let text = [...texts][0];
    if (nulls && !text.includes('null')) text += ' | null';
    const sf = p.getSourceFile();
    if (missing && !p.questionToken && !p.initializer) continue;   // leave arity alone
    push(sf.fileName, { pos: p.type.getStart(sf), end: p.type.end, text });
    for (const need of real[0].need) wantImport(sf.fileName, need.kind === 'three' ? 'three' : `local:${need.file}:${need.name}`);
    nParams++;
    hist.set(text, (hist.get(text) ?? 0) + 1);
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
      let rel = path.relative(path.dirname(file), target).replace(/\.ts$/, '.ts');
      if (!rel.startsWith('.')) rel = `./${rel}`;
      if (target === file) continue;
      const already = new RegExp(`^import[^\\n]*\\b${name}\\b[^\\n]*from '[^']*';`, 'm').test(src);
      if (!already) add.push(`import type { ${name} } from '${rel}';`);
    }
    const seen = new Set();
    const uniq = list.filter((e) => (seen.has(e.pos) ? false : (seen.add(e.pos), true))).sort((a, b) => b.pos - a.pos);
    for (const e of uniq) src = src.slice(0, e.pos) + e.text + src.slice(e.end);
    if (add.length) {
      // after the *last import statement*, which may span several lines --
      // splicing after the last line that starts with `import` lands inside a
      // multi-line named import and produces a syntax error.
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
console.log(`infer: ${nFields} fields, ${nParams} params across ${files || edits.size} files`);
console.log([...hist].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `  ${String(v).padStart(4)}  ${k}`).join('\n'));
