#!/usr/bin/env node
/**
 * Drop JSDoc tags that say nothing once their type moved into the signature.
 * `@param hud` with no description is noise; `@param dt seconds` is not.
 */
import fs from 'node:fs';

const BARE = /^\s*\*?\s*@(param\s+\[?[A-Za-z_$][\w$.]*\]?|returns?|type)\s*$/;
const TAG = /^\s*\*?\s*@\w+/;

let touched = 0;
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // single-line block: /** @param x */
    const one = /^(\s*)\/\*\*(.*)\*\/\s*$/.exec(line);
    if (one) {
      const inner = one[2].trim();
      if (BARE.test(` * ${inner}`) || inner === '') continue;
      out.push(line);
      continue;
    }
    if (!/^\s*\/\*\*\s*$/.test(line)) { out.push(line); continue; }
    // multi-line block: collect it, filter, and drop it if nothing survives
    let j = i;
    const block = [];
    while (j < lines.length && !/\*\//.test(lines[j])) block.push(lines[j++]);
    if (j >= lines.length) { out.push(line); continue; }
    block.push(lines[j]);
    const body = block.slice(1, -1);
    const kept = [];
    for (let k = 0; k < body.length; k++) {
      const nextIsTagOrEnd = k + 1 >= body.length || TAG.test(body[k + 1]);
      if (BARE.test(body[k]) && nextIsTagOrEnd) continue;
      kept.push(/^\s*\*\s*@\w+\s+$/.test(body[k]) ? body[k].replace(/\s+$/, '') : body[k]);
    }
    const meaningful = kept.some((l) => l.replace(/^\s*\*?\s*/, '').trim() !== '');
    if (!meaningful) { i = j; continue; }
    out.push(block[0], ...kept, block[block.length - 1]);
    i = j;
    touched++;
  }
  const res = out.join('\n');
  if (res !== src) fs.writeFileSync(file, res);
}
console.log(`jsdocclean: done (${touched} blocks rewritten)`);
