#!/usr/bin/env node
/**
 * Every GLSL operation in this repo that is UNDEFINED on some input it can be
 * handed.
 *
 * **Why a static sweep and not a probe.** `probes/nanscan.mts` reads the linear
 * scene target and counts NaN pixels, which is the right instrument and reports
 * 0 of 142 shots. It can only see a NaN that is on screen in one of 142 poses,
 * at one time of day, with one weather state — and both of this month's NaNs
 * were operations that are undefined on an input the shader can be handed but
 * usually is not:
 *
 *  - the trail ribbon's `pow(vUv.x, k)` with `vUv.x < 0` on the tail quad;
 *  - the terrain's `normalize(vec3(0))` on a perfectly flat cell.
 *
 * A NaN written by any material survives the composer and lands on the canvas
 * as a hole of pure black. It is invisible to every gate: not a page error, not
 * a draw-count change, and against a baseline that has the same hole in it, not
 * even a pixel diff. So the second instrument looks at the source instead, and
 * the two together are the coverage: `nanscan` says "not in these 142 frames",
 * this says "and here is what could still do it".
 *
 *   node src/tools/nansweep.mts              # the report, grouped by file
 *   node src/tools/nansweep.mts --all        # include the guarded call sites too
 *   node src/tools/nansweep.mts --rule pow   # one rule
 *
 * ## What counts as guarded
 *
 * `pow(x, y)` is undefined for `x < 0` in every GLSL spec, and for `x == 0 &&
 * y <= 0`. A base is accepted when it cannot be negative by construction: a
 * non-negative literal, or a call to `max(0…`, `abs`, `clamp`, `saturate`,
 * `length`, `smoothstep`, `step`, `fract`, `exp`, `distance`, or another
 * `pow`/`sqrt`. Everything else is reported — including `dot(n, l)`, which is
 * the classic one, and including things that happen to be non-negative today
 * because a uniform is positive today.
 *
 * `normalize(v)` is `v / length(v)`, so it is `0/0` on a zero vector. A vector
 * is accepted when it is a literal with a non-zero component, or when the call
 * site already divides by a guarded length. `cross(` inside a `normalize(` is
 * called out separately and loudly: two parallel edges are not a rare input, it
 * is what a degenerate triangle and a vertical wall both produce.
 *
 * ## Two idioms this cannot see, and both are in the tree
 *
 * The sweep is line-local by construction — it reads an expression, not a
 * program — so it re-raises two guards that live on a *different* line. Both
 * were triaged by hand on 2026-08-31 and both are correct code:
 *
 *  - **The anti-parallel ternary.** `vec3 ref = abs(up.y) > 0.92 ? vec3(1,0,0)
 *    : vec3(0,1,0); vec3 rt = normalize(cross(up, ref));` picks the reference
 *    axis that cannot be parallel to `up`, so the cross is never zero.
 *    `CrystalShards.ts:283` and `sky.glsl.ts:116` both do this.
 *  - **The length guard one statement up.** `if (dot(vel, vel) > 1e-4) { vec3
 *    up = normalize(vel); … }` — `CrystalShards.ts:280`.
 *
 * If you add a third, write it in one of these two shapes so the next reader
 * recognises it. Teaching the sweep to follow control flow is not worth it; a
 * false positive costs one glance and a false negative costs a black hole in a
 * frame.
 *
 * The output is deliberately a list of *call sites*, not a verdict. This tool
 * does not know whether `vUv.x` can go negative — the lane that owns the file
 * does. Findings go to that lane through `project/TASKS.md`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'src');

function parse(argv: string[]) {
  const o = { all: false, rule: null as string | null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--all') o.all = true;
    else if (argv[i] === '--rule') o.rule = argv[++i];
    else throw new Error(`unknown flag ${argv[i]}`);
  }
  return o;
}
const opts = parse(process.argv.slice(2));

/** Every `.ts` under `src/` that is not the harness. */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === 'tools' || e === 'public' || e === 'node_modules') continue;
      walk(p, out);
    } else if (e.endsWith('.ts')) out.push(p);
  }
  return out;
}

/**
 * The argument list of a call whose `(` is at `open`, split at top level.
 *
 * A regex cannot do this: `pow(max(0.0, dot(n, l)), k)` has three commas and
 * one of them is the one that matters. Depth counting is the whole trick.
 */
function argsOf(s: string, open: number): { args: string[], end: number } | null {
  let depth = 0, start = open + 1;
  const args: string[] = [];
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) { args.push(s.slice(start, i)); return { args, end: i }; }
    } else if (c === ',' && depth === 1) { args.push(s.slice(start, i)); start = i + 1; }
  }
  return null;
}

/** Calls whose result cannot be negative, so a `pow` base built from one is safe. */
const NONNEG = /^(max|abs|clamp|saturate|length|distance|smoothstep|step|fract|exp|exp2|sqrt|pow|dot2|luma)\s*\(/;

/** `pow(x, y)` is undefined for x < 0. Is this base provably non-negative? */
function powBaseSafe(raw: string): boolean {
  const b = raw.trim();
  if (!b) return true;
  // A literal, or a parenthesised literal: `pow(2.0, x)`.
  if (/^\(*\s*\d[\d.eE+-]*\s*\)*$/.test(b)) return true;
  if (NONNEG.test(b)) {
    // `max(` only guards when one side is a non-negative constant.
    if (!b.startsWith('max')) return true;
    const inner = argsOf(b, b.indexOf('('));
    return !!inner && inner.args.some((a) => /^\s*\(*\s*\d[\d.eE+-]*\s*\)*\s*$/.test(a));
  }
  // A whole expression wrapped in parens: unwrap once and re-ask.
  if (b.startsWith('(') && b.endsWith(')')) {
    const inner = argsOf(b, 0);
    if (inner && inner.end === b.length - 1 && inner.args.length === 1) return powBaseSafe(inner.args[0]);
  }
  // `1.0 - <something provably in [0,1]>` is the commonest base in this repo --
  // every Fresnel term is one -- and it is provably in [0,1] too. Reporting it
  // buries the five sites that matter under forty that cannot fire.
  if (/^1\.0\s*-\s*(clamp|saturate|smoothstep|step|fract)\s*\(/.test(b)) return true;
  return false;
}

/**
 * Is a `pow` base a SUBTRACTION, and therefore reachably negative?
 *
 * This is the shape both of this month's NaNs had and the one a reader's eye
 * slides over, because the exponent is usually an innocent `2.0`:
 *
 *     exp(-pow((r - 0.82) / (0.16 + 0.22 * vLife), 2.0))
 *
 * That reads as "squared" and is not: GLSL leaves `pow(x, y)` undefined for
 * `x < 0` **for every y, integral or not**, and `r < 0.82` is most of the quad.
 * A gaussian written this way is a NaN generator wearing a bell curve's
 * clothes; the fix is `x * x`, which is defined everywhere, and costs less.
 */
function powBaseSigned(raw: string): boolean {
  let depth = 0;
  const b = raw.trim();
  // `1.0 - foo` is the Fresnel idiom and it is everywhere: forty sites, all of
  // them fed a dot product that is clamped a line earlier. Calling those HIGH
  // buries the eight that are gaussians written with `pow(x, 2.0)`. Reported at
  // MED, not dropped -- `1.0 - ndv` really is negative if `ndv` ever exceeds 1.
  if (/^1\.0\s*-\s*[A-Za-z_]\w*\s*$/.test(b)) return false;
  for (let i = 1; i < b.length - 1; i++) {
    const c = b[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    // A leading unary minus, an exponent's `e-3`, and `->` are not subtraction.
    else if (c === '-' && depth === 0 && /[\w).\]]\s?$/.test(b.slice(0, i)) && !/[eE]$/.test(b.slice(0, i))) return true;
  }
  return false;
}

/** `normalize(v)` is 0/0 on a zero vector. Is this argument provably non-zero? */
function normalizeArgSafe(raw: string): boolean {
  const v = raw.trim();
  // A constructor with at least one non-zero literal component can never be zero.
  const ctor = /^vec[234]\s*\(/.exec(v);
  if (ctor) {
    const inner = argsOf(v, v.indexOf('('));
    if (inner && inner.args.some((a) => /^\s*-?\s*\d*\.?\d+\s*$/.test(a) && Number(a) !== 0)) return true;
  }
  // A single non-zero literal scalar, or already-normalised input.
  if (/^normalize\s*\(/.test(v)) return true;
  return false;
}

interface Hit { file: string; line: number; rule: string; text: string; severity: 'HIGH' | 'MED'; }
const hits: Hit[] = [];

for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  // Only look inside GLSL. Every shader in this repo is a template literal
  // tagged with the `/* glsl */` comment or assigned to a *_GLSL / *_VERT_* /
  // *_FRAG_* name; a plain grep over the whole file finds JS `Math.pow` and
  // three.js `.normalize()`, which are neither undefined nor ours.
  const rel = path.relative(ROOT, file);
  const lines = src.split('\n');
  let inGlsl = false, fence = 0, inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    let ln = lines[i];
    if (!inGlsl && (/\/\*\s*glsl\s*\*\/\s*`/.test(ln) || /^\s*(export\s+)?const\s+\w*(GLSL|VERT|FRAG|SHADER|CHUNK|PARS|BEGIN)\w*\s*=\s*`/.test(ln))) {
      inGlsl = true; fence = i;
      continue;
    }
    if (!inGlsl) continue;
    // A backtick that is not `${` closes it. Template interpolation of another
    // chunk is still GLSL, so only a bare closing backtick ends the block.
    if (/^\s*`\s*[;,)\]]?\s*$/.test(ln) || /`\s*;\s*$/.test(ln)) { inGlsl = false; continue; }
    if (i - fence > 4000) inGlsl = false;

    /**
     * Strip comments before scanning, or the tool reports its own prose.
     *
     * Caught on itself, within a minute of its first fix landing: the guard
     * written for `SsrPass.ts:75` explains the defect in a block comment above
     * the code that closes it, and the sweep re-reported the words
     * `normalize(cross(dy, dx))` out of that explanation as a HIGH call site --
     * one line below the fix. **A tool that cannot tell a fix's rationale from
     * the defect keeps every fix it inspires permanently red**, which trains the
     * reader to write the fix without the reason.
     */
    if (inBlockComment) {
      const close = ln.indexOf('*/');
      if (close < 0) continue;
      inBlockComment = false;
      ln = ln.slice(close + 2);
    }
    for (;;) {
      const open = ln.indexOf('/*');
      if (open < 0) break;
      const close = ln.indexOf('*/', open + 2);
      if (close < 0) { ln = ln.slice(0, open); inBlockComment = true; break; }
      ln = ln.slice(0, open) + ' ' + ln.slice(close + 2);
    }
    const lineComment = ln.indexOf('//');
    if (lineComment >= 0) ln = ln.slice(0, lineComment);

    // ---- pow ------------------------------------------------------------
    for (let m = ln.indexOf('pow('); m >= 0; m = ln.indexOf('pow(', m + 1)) {
      if (m > 0 && /[A-Za-z0-9_.]/.test(ln[m - 1])) continue;   // `tf_pow(`, `.pow(`
      const a = argsOf(ln, m + 3);
      if (!a || a.args.length < 2) continue;                      // wrapped over lines
      if (powBaseSafe(a.args[0])) { if (opts.all) hits.push({ file: rel, line: i + 1, rule: 'pow', text: lines[i].trim(), severity: 'MED' }); continue; }
      // A varying or an interpolated attribute is the HIGH case: it is the only
      // base whose sign the author cannot read off the line, and it is what bit
      // the trail ribbon (`pow(vUv.x, k)` on the tail quad, vUv.x < 0).
      const varying = /\bv[A-Z]\w*|\ba[A-Z]\w*|\bgl_PointCoord|\bvUv|\bUv\b/.test(a.args[0]);
      const signed = powBaseSigned(a.args[0]);
      hits.push({
        file: rel, line: i + 1, text: lines[i].trim(),
        rule: signed ? 'pow(signed base)' : 'pow',
        severity: varying || signed ? 'HIGH' : 'MED',
      });
    }

    // ---- normalize ------------------------------------------------------
    for (let m = ln.indexOf('normalize('); m >= 0; m = ln.indexOf('normalize(', m + 1)) {
      if (m > 0 && /[A-Za-z0-9_.]/.test(ln[m - 1])) continue;
      const a = argsOf(ln, m + 9);
      if (!a) continue;
      if (normalizeArgSafe(a.args[0])) { if (opts.all) hits.push({ file: rel, line: i + 1, rule: 'normalize', text: lines[i].trim(), severity: 'MED' }); continue; }
      // `normalize(cross(a, b))` is the one that is not a corner case: two
      // parallel edges are what a degenerate triangle and a vertical wall both
      // hand it, and the result is exactly vec3(0).
      const cross = /\bcross\s*\(/.test(a.args[0]);
      hits.push({ file: rel, line: i + 1, rule: cross ? 'normalize(cross)' : 'normalize', text: lines[i].trim(), severity: cross ? 'HIGH' : 'MED' });
    }
  }
}

const shown = opts.rule ? hits.filter((h) => h.rule.startsWith(opts.rule!)) : hits;
const byFile = new Map<string, Hit[]>();
for (const h of shown) {
  if (!byFile.has(h.file)) byFile.set(h.file, []);
  byFile.get(h.file)!.push(h);
}
const files = [...byFile.entries()].sort((a, b) =>
  b[1].filter((h) => h.severity === 'HIGH').length - a[1].filter((h) => h.severity === 'HIGH').length
  || b[1].length - a[1].length);

for (const [file, hs] of files) {
  console.log(`\n${file}   ${hs.length} site(s), ${hs.filter((h) => h.severity === 'HIGH').length} HIGH`);
  for (const h of hs) {
    console.log(`  ${String(h.line).padStart(5)}  ${h.severity.padEnd(4)} ${h.rule.padEnd(16)} ${h.text.slice(0, 96)}`);
  }
}

const high = shown.filter((h) => h.severity === 'HIGH').length;
console.log(`\n${shown.length} unguarded call site(s) across ${files.length} file(s); ${high} HIGH.`);
console.log('HIGH = a `pow` whose base is a varying or a SUBTRACTION, or a `normalize(cross(..))`:');
console.log('the three shapes that have actually produced a NaN here. This tool reports, it does');
console.log('not judge —');
console.log('whether `vUv.x` can go negative is a question for the lane that owns the file.');
console.log('Confirm any fix with `node src/tools/probe.mts src/tools/probes/nanscan.mts`.');
