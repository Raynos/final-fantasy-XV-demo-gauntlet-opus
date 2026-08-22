import * as THREE from 'three';

/**
 * Nesting-safe colour blending for the species sculpts.
 *
 * Every organic species grew its own two-line `mix(a, b, t)` over a pair of
 * module-level scratch `THREE.Color`s. That shape has **two** independent
 * failure modes, and both of them render a body part solid black with no
 * error anywhere:
 *
 * 1. `Color.setHex` runs `Math.floor` on its argument. Hand it a `THREE.Color`
 *    — which is exactly what the inner call of `mix(mix(A, B, s), C, t)`
 *    returns — and every channel comes out `NaN`. This is the bug that kept
 *    the sabertusk's head black for its entire existence.
 * 2. Even with a type guard, two scratch registers cannot survive nesting.
 *    JavaScript evaluates arguments left to right, so in
 *    `mix(mix(A, B, s), mix(C, D, u), t)` the second inner call overwrites the
 *    very register the first one just returned, and the outer call blends a
 *    colour with itself.
 *
 * Measured cost of leaving it alone: the dualhorn — which a previous pass
 * recorded as "deep rebuild, verified by eye" — rendered its whole flank, its
 * entire head and all four legs as flat black, and so did the coeurl's torso
 * and the voretooth's dorsal and skull. Four of the eight nested call sites in
 * the bestiary were on species nobody had re-captured since the nesting was
 * introduced.
 *
 * The fix is a small ring of scratch colours plus a type guard. Arguments are
 * fully evaluated before the body runs, so reading both ends into fixed
 * component scratch *first* and only then claiming an output register makes
 * the call safe at any depth. A returned colour stays valid until eight more
 * blends have been taken, which is far longer than a `colorAt` callback lives.
 */

const RING: any[] = [];
for (let i = 0; i < 8; i++) RING.push(new THREE.Color());
let _at = 0;
const _rd = new THREE.Color();
const _a = { r: 0, g: 0, b: 0 };
const _b = { r: 0, g: 0, b: 0 };

/** @returns the next scratch register. */
function take(): THREE.Color { _at = (_at + 1) % RING.length; return RING[_at]; }

/**
 * Read a hex literal or a `THREE.Color` into linear component scratch.
 * @param v @param out
 */
function read(v: number | THREE.Color, out: {r:number,g:number,b:number}) {
  if (v && (v as THREE.Color).isColor) {
    const c = v as THREE.Color;
    out.r = c.r; out.g = c.g; out.b = c.b;
    return out;
  }
  _rd.setHex(v as number, THREE.SRGBColorSpace);
  out.r = _rd.r; out.g = _rd.g; out.b = _rd.b;
  return out;
}

/**
 * Blend two colours in linear space. Either end may be a hex literal or a
 * `THREE.Color`, and calls may be nested freely.
 * @param t 0..1, clamped
 * @returns a scratch colour — copy it if you need to keep it
 */
export function mixc(a: number | THREE.Color, b: number | THREE.Color, t: number): THREE.Color {
  read(a, _a); read(b, _b);
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return take().setRGB(
    _a.r + (_b.r - _a.r) * k,
    _a.g + (_b.g - _a.g) * k,
    _a.b + (_b.b - _a.b) * k,
  );
}

/**
 * A single colour in a scratch register, hex or `THREE.Color`.
 */
export function colc(v: number | THREE.Color): THREE.Color {
  read(v, _a);
  return take().setRGB(_a.r, _a.g, _a.b);
}
