#!/usr/bin/env node
/**
 * Give every `<name>: any` one named type, and import it where it lands.
 *
 *   node name.mts <root> <tsconfig> <srcPrefix> <ident> <Type> <declFile> [--dry]
 *
 * The inference passes work bottom-up from what the code already proves. This
 * one is top-down: a human knows that every parameter called `game` is the
 * `Game`, and no amount of reading bodies will discover that when the callers
 * hold an `any` too. It edits parameters and field declarations alike, skips
 * the file the type is declared in, and leaves anything already annotated.
 *
 * The errors it produces are the deliverable. A `game.foo` that no longer
 * compiles is either drift in the caller or a missing field on `Game`.
 */
import ts from 'typescript-api';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const tsconfig = process.argv[3] ?? 'tsconfig.json';
const prefix = path.resolve(root, process.argv[4] ?? 'src');
const ident = process.argv[5];
const typeName = process.argv[6];
const declFile = path.resolve(root, process.argv[7]);
const dry = process.argv.includes('--dry');
if (!ident || !typeName || !process.argv[7]) {
  console.error('usage: name.mts <root> <tsconfig> <srcPrefix> <ident> <Type> <declFile> [--dry]');
  process.exit(2);
}

const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(root, tsconfig), ts.sys.readFile).config, ts.sys, root);
const program = ts.createProgram(cfg.fileNames, { ...cfg.options, noEmit: true });

const edits = new Map();
const push = (f, e) => { const l = edits.get(f) ?? (edits.set(f, []), edits.get(f)); l.push(e); };

let n = 0;
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !sf.fileName.startsWith(prefix)) continue;
  if (sf.fileName === declFile) continue;
  const visit = (node) => {
    const named = (ts.isParameter(node) || ts.isPropertyDeclaration(node)) &&
      node.name && ts.isIdentifier(node.name) && node.name.text === ident &&
      node.type?.kind === ts.SyntaxKind.AnyKeyword;
    if (named) {
      push(sf.fileName, { pos: node.type.getStart(sf), end: node.type.end });
      n++;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

let files = 0;
if (!dry) {
  for (const [file, list] of edits) {
    let src = fs.readFileSync(file, 'utf8');
    const seen = new Set();
    const uniq = list.filter((e) => (seen.has(e.pos) ? false : (seen.add(e.pos), true))).sort((a, b) => b.pos - a.pos);
    for (const e of uniq) src = src.slice(0, e.pos) + typeName + src.slice(e.end);
    const already = new RegExp(`^import[^\\n]*\\b${typeName}\\b[^\\n]*from '[^']*';`, 'm').test(src);
    if (!already) {
      let rel = path.relative(path.dirname(file), declFile);
      if (!rel.startsWith('.')) rel = `./${rel}`;
      const lines = src.split('\n');
      let last = -1, open = false;
      for (let i = 0; i < lines.length; i++) {
        if (/^import /.test(lines[i])) { last = i; open = !/;\s*$/.test(lines[i]); }
        else if (open && /^\}\s*from\s*'/.test(lines[i])) { last = i; open = false; }
      }
      lines.splice(last + 1, 0, `import type { ${typeName} } from '${rel}';`);
      src = lines.join('\n');
    }
    fs.writeFileSync(file, src);
    files++;
  }
}
console.log(`name: ${n} \`${ident}: any\` -> ${typeName} across ${files || edits.size} files`);
