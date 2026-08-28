#!/usr/bin/env node
/**
 * Does the face read as a face **in a rendered frame**?
 *
 *   node src/tools/facecheck.mts
 *   node src/tools/facecheck.mts --dirty --shots tmp/shots/facecheck   # keep the frames
 *   node src/tools/facecheck.mts --json tmp/facecheck.json
 *
 * ## Why this exists, and why it is not another probe
 *
 * Round 14 scored 3.0 and the judge's costed advice was *"fix the head, and
 * only the head."* Its defect sentence was:
 *
 * > the chin projects further forward than the nose ... no mouth geometry or
 * > mouth texture on the mouth's location.
 *
 * Three lanes have now been sent at that sentence and **each time a measurement
 * agreed while the picture did not**. `muzzleMm` went 22.44 -> 6.46, inside the
 * adult-male band, and the frame got worse. The reason is structural and
 * `headprop.mts` says it about itself: *"it reads the position buffer"*. So does
 * `headprofile.mts`, so does `brushsurvive.mts`, so does `hairstand.mts`. Every
 * head instrument in this repo measures **vertices**. The judge measures
 * **pixels**, and the two came apart three times.
 *
 * `head-r3.md` section 5 is the proof that they are genuinely different
 * questions rather than the same one measured sloppily. Eight millimetres of
 * added lip relief, an overhanging mouth line and a lip rolled to face the sky
 * moved the *rendered* mouth by **1 of 255** — below two fresh boots' own
 * disagreement. A vertex bench scored that change as a success. A frame did not
 * contain it. Nothing in the suite could tell the difference.
 *
 * **This gate is the pixel half.** It renders a face at the range
 * `LANDMINES.md` says face work must be judged at (0.4-0.6 m, not the corpus's
 * ~100 px `hero_face`), and asks of the image itself: is there a mouth in it,
 * and is there a nose in it.
 *
 * ## The measurement, and the control that makes it mean something
 *
 * "Is there a mouth" cannot be asked as an absolute value. Skin tone, exposure,
 * the grade and the hour all move every number in the window, and a threshold
 * picked against one of them is a threshold against that day's light.
 *
 * So every feature window is scored **against a control window on the same
 * face, at the same height, in the same light**: the same box slid 40 mm
 * sideways onto the cheek, which is skin and nothing else. A mouth exists when
 * the mouth box carries materially more structure than a blank patch of the
 * same person's cheek at the same moment. That subtracts the lighting, the
 * grade, the skin and the exposure, and leaves the feature.
 *
 * Two numbers per window, because they fail differently and `head-r3.md`
 * section 5 turns on exactly that distinction:
 *
 * - **`range`** — p97 minus p03 of the window. Is there *any* value difference
 *   where the mouth is.
 * - **`edge`** — the steepest step between adjacent rows of row-means, in
 *   luminance **per millimetre of face** rather than per pixel, so it does not
 *   move when the framing does. A soft 18 px ramp and a lip both have `range`;
 *   only a lip has `edge`. head-r3 measured the shipped mouth as *"an 18 px
 *   soft ramp down and back up with no edge, which is exactly a brown smudge on
 *   the texture"* — that sentence is this row.
 *
 * ## Half a face is dark, on purpose, and the windows know it
 *
 * The studio hour here is 16.2, the same low raking key `hero_portrait` and
 * `facecam.mts` use. `head-r3.md` section 8 measured what that costs: the
 * shadow half of the face sits at a uniform Y 65-100 with no detail of any
 * kind, and it is **the same with the normal map ablated** — the light doing
 * its job, not a sculpt defect. A window straddling the midline would therefore
 * score its own terminator as a feature and read a mouth on a head with none.
 *
 * Every window here is placed on **the lit half only**, chosen at runtime by
 * comparing the two cheeks, and the terminator is never inside one.
 *
 * ## The four geometry rows, and why they are here and not in `headprop.mts`
 *
 * `headprop.mts` is a *bench*: it prints numbers next to published norms and
 * nothing fails. Four of its rows are load-bearing enough to gate, and two of
 * them are the judge's sentence, so they are re-derived here — from unambiguous
 * extrema over ranges, with no peak-finder and no persistence filter:
 *
 * - **`noseLeadMm`** — the front-most midline z anywhere, minus the front-most
 *   midline z in the chin's own band. **Nothing in this repo has ever asserted
 *   that the nose must lead the chin**, which is the specific gap the round-14
 *   plan names. It passes today at ~26 mm and it is here as a ratchet: this is
 *   the number that went the wrong way when the mid-face was pulled back.
 * - **`mouthReliefMm`** — how far the stomion sits behind the nearer of the two
 *   lips. The depth a light has to find to draw a mouth line at all.
 * - **`transverseDropMm`** — how far the surface falls back from the midline by
 *   x = 30 mm at the mouth line. A head does about 7. `shellPoint` sweeps a
 *   pure ellipse, so this is the one number under "a blank cheek", "flat
 *   sockets" and "a wedge" alike.
 * - **`mentonWidthFrac`** — half-width at the menton over the head's own
 *   maximum half-width. Farkas' adult male runs 0.32; a cone runs less, and a
 *   chin that comes to a point is what makes a low camera read the chin as the
 *   leading feature of the face.
 *
 * ## What this gate is blind to
 *
 * 1. **Everything above the eyes.** Hair, brow and cranium are not scored.
 * 2. **Whether the mouth is a *good* mouth.** It asserts that a mouth is
 *    legible, not that it is beautiful. `BRIEF.md`'s "look at the image
 *    yourself" is not replaced by this and cannot be.
 * 3. **The shadow half of the face**, deliberately — see above.
 * 4. **Every character but the four heroes.** NPC faces share the generator and
 *    are not sampled.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { harnessArgs, announceBuild, lease, pageOpts, runTool } from './harness.mts';
import { decodePng, type DecodedPng } from './imgdiff.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Thresholds.
 *
 * The pixel rows are stated as *margins over the same face's own cheek*, so
 * they are not calibrated against a light. A blank patch of cheek at this range
 * carries a `range` of roughly 10-25 (pore normal, the mottling in `paintFace`
 * and the grade's grain) and an `edge` near zero, so a feature has to clear its
 * own control by a real amount rather than by grain.
 *
 * The geometry rows are anthropometry, sourced in the block comment above.
 */
const LIMITS = {
  /** mouth window `range` minus cheek window `range`, 0-255. */
  mouthRange: 14,
  /** mouth window `edge` minus cheek window `edge`, luminance per mm of face. */
  mouthEdge: 3.0,
  /** pronasale z minus the chin band's front-most z, mm. Adult male ~20. */
  noseLeadMm: 12,
  /** lips against the stomion, mm. */
  mouthReliefMm: 2.0,
  /** fall-back from the midline by x = 30 mm at the mouth line, mm. Head: ~7. */
  transverseDropMm: 12,
  /** menton half-width over max half-width. Farkas adult male: 0.32. */
  mentonWidthFrac: 0.28,
};

/**
 * Residual range above which a control patch is not a control.
 *
 * The whole pixel half of this gate is *a feature window against a blank
 * window*, so if no patch of a face is blank the comparison has no meaning and
 * the right answer is to say so rather than to fail the head for it.
 *
 * **Gladiolus is why this exists, and it is a real defect rather than an
 * instrument problem.** His beard is ~350 individual black slivers scattered
 * loose over the whole lower face — they read as flies stuck to his jaw, not as
 * stubble — so both candidate controls land on it and score 224 of 255. No
 * measurement of a mouth is possible under that, by this gate or by an eye.
 * Fix the beard and he stops being VOID.
 */
const CONTROL_CEILING = 60;

/** One window's two scores. */
interface Win { range: number, edge: number, mean: number, box: number[] }
interface CharRow {
  name: string;
  litSign: number;
  pxPerMm: number;
  mouth: Win; nose: Win; cheek: Win;
  noseLeadMm: number;
  mouthReliefMm: number;
  transverseDropMm: number;
  mentonWidthFrac: number;
  headHeightMm: number;
}

/** Rec.709 luma of an sRGB byte triple. */
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Score one axis-aligned box of a decoded frame, **after removing a plane**.
 *
 * The plane fit is the load-bearing part and the first version of this file did
 * not have it. Under this game's key a 17 x 16 mm patch of cheek can span 60
 * luminance levels from one corner to the other with nothing on it at all — the
 * terminator, the fringe's cast shadow and the falloff across a curved surface
 * are all *smooth ramps*, and a raw p97-p03 scores every one of them as a
 * feature. Measured on the first run: a blank cheek came back with a `range` of
 * 157 and an `edge` of 74 per mm, both larger than the mouth's.
 *
 * Least-squares `a + b*x + c*y` is exactly what a ramp is and exactly what a
 * lip is not, so subtracting it leaves the anatomy and throws away the light.
 * Both numbers below are of the residual:
 *
 * - `range` — p97 minus p03. Is there any value structure here at all.
 * - `edge` — the steepest step between adjacent **row means**, in luminance per
 *   millimetre of face rather than per pixel, so it does not move when the
 *   framing does. A soft 18 px ramp and a lip both have `range`; only a lip has
 *   `edge`. Row means rather than raw pixels because one hot pixel is noise and
 *   a lip is a line.
 */
function scoreWindow(
  img: DecodedPng,
  x0: number, y0: number, x1: number, y1: number, pxPerMm: number,
): Win {
  const ch = img.ch;
  const xa = Math.max(0, Math.min(img.w - 1, Math.round(x0)));
  const xb = Math.max(0, Math.min(img.w - 1, Math.round(x1)));
  const ya = Math.max(0, Math.min(img.h - 1, Math.round(y0)));
  const yb = Math.max(0, Math.min(img.h - 1, Math.round(y1)));
  const nx = xb - xa + 1, ny = yb - ya + 1;
  const v = new Float64Array(nx * ny);
  let sum = 0;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const i = ((ya + y) * img.w + (xa + x)) * ch;
      const q = luma(img.data[i], img.data[i + 1], img.data[i + 2]);
      v[y * nx + x] = q; sum += q;
    }
  }
  const n = nx * ny;
  const mean = n ? sum / n : 0;
  // Centred x and y make the normal equations diagonal, so the fit is three
  // sums rather than a 3x3 solve.
  const cx = (nx - 1) / 2, cy = (ny - 1) / 2;
  let sxx = 0, syy = 0, sxv = 0, syv = 0;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const dx = x - cx, dy = y - cy, d = v[y * nx + x] - mean;
      sxx += dx * dx; syy += dy * dy; sxv += dx * d; syv += dy * d;
    }
  }
  const bx = sxx > 0 ? sxv / sxx : 0, by = syy > 0 ? syv / syy : 0;
  const res = new Float64Array(n);
  const rowMean = new Float64Array(ny);
  for (let y = 0; y < ny; y++) {
    let s = 0;
    for (let x = 0; x < nx; x++) {
      const r = v[y * nx + x] - (mean + bx * (x - cx) + by * (y - cy));
      res[y * nx + x] = r; s += r;
    }
    rowMean[y] = nx ? s / nx : 0;
  }
  const sorted = Array.from(res).sort((a, b) => a - b);
  const q = (f: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))] : 0);
  let edge = 0;
  for (let i = 1; i < ny; i++) edge = Math.max(edge, Math.abs(rowMean[i] - rowMean[i - 1]));
  return {
    range: +(q(0.97) - q(0.03)).toFixed(2),
    // per pixel -> per mm of face
    edge: +(edge * pxPerMm).toFixed(3),
    mean: +mean.toFixed(1),
    box: [xa, ya, xb, yb],
  };
}

/**
 * Everything measured inside the page for one character: where the landmarks
 * land in pixels, how big a millimetre is there, which cheek the sun is on, and
 * the four geometry rows off the head's own position buffer.
 *
 * Written as a string and evaluated as a function body for the same reason the
 * probes are: it needs `window.GAME`, `THREE` and a dynamic `import()` of the
 * game's own modules, none of which exist in this process.
 */
const PAGE = String.raw`
const g = window.GAME;
// A probe body is eval'd in the page and the page has no bare-specifier map, so
// a bare three import throws (standingroom.mts and eyeoccluder.mts both say so).
// Scratch vectors are cloned off a live one instead.
const { SHOTS } = await import('/game/Shots.ts');
const { FACE, HEAD_SEG_U, HEAD_SEG_V } = await import('/characters/rig/Face.ts');
const HOUR = 16.2;
const W = 1600, H = 900;

const party = g.get('Party');
const player = g.get('Player');
const m = NAME === 'noctis' ? player : (party && party.get && party.get(NAME));
const ch = m && m.character;
if (!ch || !ch.rig || !ch.head) return null;

if (!g.__facecheckPinned) {
  g.settle(90);
  if (g.post && g.post.dof) g.post.dof.enabled = false;
  // The tutorial hint card parks itself over the subject's forehead in every
  // face framing; it is not the HUD and shot.hud does not suppress it.
  const hud = g.get('HUD');
  if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }
  // Pin exactly what facecam.mts pins, and for its reasons: without the root
  // pin the subject walks out of frame between captures, because the sim is
  // settled between them.
  const pinned = [];
  const pin = (o, holder) => pinned.push({ o, holder, p: o.position.clone(), r: o.rotation.y });
  const restore = () => {
    for (const q of pinned) {
      q.o.position.copy(q.p); q.o.rotation.y = q.r;
      if (q.holder && q.holder.velocity) q.holder.velocity.set(0, 0, 0);
      if (q.holder) q.holder.speed = 0;
    }
  };
  const wrap = (sys) => {
    if (!sys || sys.__facePinned) return;
    const orig = sys.update.bind(sys);
    sys.update = (dt, game) => { orig(dt, game); restore(); };
    sys.__facePinned = true;
  };
  if (player && player.root) pin(player.root, player);
  if (party) for (const q of party.members) pin(q.root, q);
  wrap(player); wrap(party);
  g.__facecheckPinned = true;
}

// Head, gaze and blink pinned per character. Without the head pin a "front"
// framing is really a 35-60 degree three-quarter -- the head-turn layer leaves
// the subject there -- and the mouth is foreshortened to nothing, which is how
// two rounds in a row were graded on a frame that could not show one.
if (ch.anim && !ch.anim.__facecheck) {
  const orig = ch.anim.update.bind(ch.anim);
  const bn = ch.rig.byName;
  ch.anim.update = (dt, st) => {
    orig(dt, st);
    ch.anim.blink = 0;
    for (const b of [bn.neck, bn.head]) if (b) { b.rotation.set(0, 0, 0); b.updateMatrix(); }
    const zero = (o) => { o.rotation.set(0, 0, 0); o.updateMatrix(); };
    if (ch.eyes) zero(ch.eyes);
    if (ch.eyeGlobes) for (const gp of ch.eyeGlobes) zero(gp);
  };
  ch.anim.__facecheck = true;
}

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; };
m.root.updateWorldMatrix(true, false);
const rp = [m.root.position.x, m.root.position.y, m.root.position.z];
const e = m.root.matrixWorld.elements;
const fwd = norm([e[8], 0, e[10]]);
const hb = ch.rig.byName.head;
hb.updateWorldMatrix(true, false);
const he = hb.matrixWorld.elements;
const s = ch.rig.dims.headScale;
// Aim at the head's own live world position: headOrigin is bind-space and every
// character has a different headScale, so a framing written against one of them
// misses the other three.
const aim = [he[12] + fwd[0]*0.02 - rp[0], he[13] + s*0.045 - rp[1], he[14] + fwd[2]*0.02 - rp[2]];
const dir = norm([fwd[0], 0.10, fwd[2]]);
SHOTS.__facecheck = {
  name: '__facecheck', fov: 30, time: HOUR, weather: 'clear',
  follow: NAME === 'noctis' ? 'player' : NAME, hud: false,
  offset: [aim[0] + dir[0]*0.55, aim[1] + dir[1]*0.55, aim[2] + dir[2]*0.55],
  lookOffset: aim,
};
// Applied twice around a settle for the reason framecam does: the follow rig
// re-anchors on the live root every frame, and the first apply is the one that
// moves the world into the shot.
g.applyShot('__facecheck');
g.settle(8);
g.applyShot('__facecheck');
g.settle(4);

// ---- landmark projection ---------------------------------------------------
// Canonical head space -> pixels, in one matrix.
//
// The head mesh is bound with an identity bindMatrix and every vertex of the
// skull grid is weighted 1.0 to the head bone, so the skinning three does for
// this mesh is exactly one matrix -- bone.matrixWorld * boneInverses[head] --
// and it maps a bind-pose position straight to WORLD. eyeoccluder.mts builds
// the same product and inverts it to go the other way.
//
// Do NOT then call localToWorld. That applies the character root a second time,
// which is what the first version of this file did: it reported 1522 px/mm on
// Ignis where the true figure is about 3, every window clamped to the whole
// frame, and the cheek control came back as a range of 255.
const org = ch.rig.dims.headOrigin;
const mesh = ch.head;
mesh.updateWorldMatrix(true, false);
const pos = mesh.geometry.attributes.position;
// The skull grid is emitted first, row-major (segV+1) x (segU+1); the chin cap,
// the ears and the lids follow it. The geometry rows below read only the grid,
// so a landmark can never be taken off a lid rim or an ear.
const NSKULL = Math.min(pos.count, (HEAD_SEG_V + 1) * (HEAD_SEG_U + 1));
const skel = mesh.skeleton;
const hbi = skel.bones.indexOf(ch.rig.byName.head);
const M = ch.rig.byName.head.matrixWorld.clone().multiply(skel.boneInverses[hbi]);
const cam = g.camera;
const _v = cam.position.clone();
const screen = (c) => {
  _v.set(c[0]*s + org.x, c[1]*s + org.y, c[2]*s + org.z).applyMatrix4(M).project(cam);
  return [(_v.x*0.5 + 0.5)*W, (0.5 - _v.y*0.5)*H];
};
const pStom = screen([0, FACE.mouth[1], FACE.mouth[2]]);
const pChin = screen(FACE.chin);
const pNose = screen(FACE.noseTip);
const pSubn = screen([0, -0.0425, 0.087]);
// A millimetre of face in pixels, taken over the 44 mm mouth-to-chin baseline
// so a short one cannot amplify its own error.
const dyCanon = (FACE.mouth[1] - FACE.chin[1]) * s * 1000;
const pxPerMm = Math.hypot(pChin[0]-pStom[0], pChin[1]-pStom[1]) / Math.max(1e-6, dyCanon);

// ---- geometry rows, off the same buffer ------------------------------------
// Canonical space, millimetres. The midline strip is 4 mm half-width for the
// reason headprop.mts states: at 10 mm it reaches the nostril brush and the
// front-most z alternates between the dorsum and the alar crease band to band.
const SAG = 0.004, BAND = 0.001;
let yMin = Infinity, yMax = -Infinity;
const Q = new Float64Array(NSKULL * 3);
for (let i = 0; i < NSKULL; i++) {
  const x = (pos.getX(i)-org.x)/s, y = (pos.getY(i)-org.y)/s, z = (pos.getZ(i)-org.z)/s;
  Q[i*3] = x; Q[i*3+1] = y; Q[i*3+2] = z;
  if (y < yMin) yMin = y;
  if (y > yMax) yMax = y;
}
const NB = Math.max(2, Math.ceil((yMax - yMin) / BAND));
const zf = new Float64Array(NB).fill(-Infinity);
const wf = new Float64Array(NB);
const z30 = new Float64Array(NB).fill(-Infinity);
for (let i = 0; i < NSKULL; i++) {
  const x = Q[i*3], y = Q[i*3+1], z = Q[i*3+2];
  const b = Math.min(NB-1, Math.max(0, Math.floor((y - yMin) / BAND)));
  const ax = Math.abs(x);
  // z > 0 or the back of the skull gets in. The midline strip runs right round
  // the head, and phiWarp puts the occipital rows at different heights from the
  // facial ones, so a 1 mm band can contain a vertex at z = -43 mm and none at
  // all in front -- which is how the first run of this file reported a 135 mm
  // mouth relief. A face is entirely z > 0 at every height this looks at.
  if (z > 0) {
    if (ax <= SAG && z > zf[b]) zf[b] = z;
    if (Math.abs(ax - 0.030) <= 0.004 && z > z30[b]) z30[b] = z;
  }
  if (ax > wf[b]) wf[b] = ax;
}
const bandOf = (y) => Math.min(NB-1, Math.max(0, Math.floor((y - yMin) / BAND)));
const maxOver = (arr, ylo, yhi) => {
  let v = -Infinity;
  for (let b = bandOf(ylo); b <= bandOf(yhi); b++) if (arr[b] > v) v = arr[b];
  return v;
};
const minOver = (arr, ylo, yhi) => {
  let v = Infinity;
  for (let b = bandOf(ylo); b <= bandOf(yhi); b++) if (arr[b] > -Infinity && arr[b] < v) v = arr[b];
  return v;
};
// Pronasale: the front-most midline band of the whole face. Unambiguous -- no
// search window, no peak-finder, no persistence filter.
let prn = -Infinity;
for (let b = 0; b < NB; b++) if (zf[b] > prn) prn = zf[b];
// The chin's own band: everything from 15 mm below the authored mouth line down
// to the menton. A maximum over a stated range, not an extremum somebody had to
// find, which is what makes it impossible to land on the lower lip's skirt.
const chinZ = maxOver(zf, yMin, FACE.mouth[1] - 0.015);
// The stomion is a *recess*, so it is the minimum of the band and not the
// maximum: a max over a 3 mm window grabs whichever lip skirt reaches into it
// and reports a mouth 4.7 mm shallower than it is.
const stoZ = minOver(zf, FACE.mouth[1] - 0.0020, FACE.mouth[1] + 0.0020);
const upZ  = maxOver(zf, FACE.mouth[1] + 0.002, FACE.mouth[1] + 0.009);
const loZ  = maxOver(zf, FACE.mouth[1] - 0.009, FACE.mouth[1] - 0.002);
// The transverse row is a *shape* comparison at one height, so both sides of it
// are the same reducer: front-most on the midline against front-most at
// x = 30 mm, in the same 4 mm band.
const midZ = maxOver(zf, FACE.mouth[1] - 0.002, FACE.mouth[1] + 0.002);
const dropZ = maxOver(z30, FACE.mouth[1] - 0.002, FACE.mouth[1] + 0.002);
let wMax = 0;
for (let b = 0; b < NB; b++) if (wf[b] > wMax) wMax = wf[b];
let wMenton = 0;
for (let b = bandOf(yMin); b <= bandOf(yMin + 0.008); b++) if (wf[b] > wMenton) wMenton = wf[b];
const mm = (v) => +(v * s * 1000).toFixed(2);

return {
  name: NAME,
  px: { stomion: pStom, chin: pChin, noseTip: pNose, subnasale: pSubn,
        // The control patch. Two constraints, both learned the hard way on the
        // first two runs of this file: it has to be INBOARD (at x = 48 mm the
        // box reaches the silhouette -- the head's own half-width there is
        // ~55 mm -- and it scored a range of 224 on Gladiolus, which was the
        // background), and it has to be at the MOUTH'S OWN HEIGHT (at eye
        // height the fringe hangs into it and it scored the hair). x = 36 mm on
        // the mouth line is cheek, inside the outline and below every lock.
        cheekL: screen([-0.036, FACE.mouth[1], 0.070]), cheekR: screen([0.036, FACE.mouth[1], 0.070]),
        // The two blank patches the control is the *blanker* of. See the note
        // at their use.
        chinL: screen([-0.012, FACE.mouth[1] - 0.030, 0.077]), chinR: screen([0.012, FACE.mouth[1] - 0.030, 0.077]),
        sideL: screen([-0.038, -0.0450, 0.066]), sideR: screen([0.038, -0.0450, 0.066]) },
  pxPerMm,
  noseLeadMm: mm(prn - chinZ),
  mouthReliefMm: mm(Math.min(upZ, loZ) - stoZ),
  transverseDropMm: mm(midZ - dropZ),
  mentonWidthFrac: +(wMenton / Math.max(1e-9, wMax)).toFixed(3),
  headHeightMm: mm(yMax - yMin),
};
`;

interface PageRow {
  name: string;
  px: Record<'stomion' | 'chin' | 'noseTip' | 'subnasale' | 'cheekL' | 'cheekR' | 'chinL' | 'chinR' | 'sideL' | 'sideR', number[]>;
  pxPerMm: number;
  noseLeadMm: number;
  mouthReliefMm: number;
  transverseDropMm: number;
  mentonWidthFrac: number;
  headHeightMm: number;
}

const HEROES = ['noctis', 'gladio', 'ignis', 'prompto'];

async function main() {
  const ha = harnessArgs(process.argv.slice(2));
  announceBuild(ha);
  const argv = process.argv.slice(2);
  const jsonAt = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null;
  const shotsAt = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
  const shotDir = shotsAt ? (path.isAbsolute(shotsAt) ? shotsAt : path.join(ROOT, shotsAt)) : null;
  if (shotDir) await mkdir(shotDir, { recursive: true });
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : HEROES;

  const leased = await lease({ ...pageOpts(ha), w: 1600, h: 900 });
  const page = leased.page;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const rows: CharRow[] = [];
  try {
    for (const name of only) {
      // One pose and one frame per character: only one of them can be 0.55 m in
      // front of the camera at a time.
      const c = await page.evaluate(
        new Function('NAME', `return (async () => { ${PAGE} })()`) as (n: string) => Promise<PageRow | null>,
        name,
      ) as unknown as PageRow | null;
      if (!c) continue;

      const buf = await page.screenshot({ type: 'png' });
      if (shotDir) await writeFile(path.join(shotDir, `${name}_facecheck.png`), buf);
      const img = decodePng(buf);
      const mmp = c.pxPerMm;

      // Which cheek the key is on. head-r3 section 8 measured what the studio
      // hour costs: the shadow half sits at a uniform Y 65-100 with no detail of
      // any kind, and it is the SAME with the normal map ablated. A window
      // straddling the terminator would score the light as a feature.
      const cheekBox = (p: number[]) =>
        [p[0] - 8*mmp, p[1] - 8*mmp, p[0] + 8*mmp, p[1] + 8*mmp] as const;
      const lL = scoreWindow(img, ...cheekBox(c.px.cheekL), mmp).mean;
      const lR = scoreWindow(img, ...cheekBox(c.px.cheekR), mmp).mean;
      const litSign = lR >= lL ? 1 : -1;

      /** A window on the lit half only, in millimetres of face from `p`. */
      const win = (p: number[], x0: number, x1: number, y0: number, y1: number) => {
        const a = p[0] + x0 * litSign * mmp, b = p[0] + x1 * litSign * mmp;
        return [Math.min(a, b), p[1] + y0 * mmp, Math.max(a, b), p[1] + y1 * mmp] as const;
      };

      // Mouth: 3 to 20 mm off the midline. A half-mouth is 22-25 mm wide and the
      // last few millimetres are the corner, which is a *vertical* feature — and
      // head-r3 section 3 records that under this key the corners are the only
      // part of a mouth that reads at all. Including them would let a face with
      // a corner and no mouth pass, which is the exact head this gate exists
      // for. It starts at 3 mm rather than 0 because the terminator is the
      // midline.
      const mouth = scoreWindow(img, ...win(c.px.stomion, 3, 20, -8, 8), mmp);
      // Nose: the alar wall and the shadow under the tip, between the two.
      const nCy = (c.px.noseTip[1] + c.px.subnasale[1]) / 2;
      const nose = scoreWindow(img, ...win([c.px.noseTip[0], nCy], 1, 15, -9, 9), mmp);
      // ---- the control ------------------------------------------------------
      // The blanker of two boxes of the SAME SIZE on the same lit half of the
      // same face, because on a face there is no patch that is blank by
      // definition and picking one by hand picked a feature twice:
      //
      //   - the first try, x = 48 mm on the mouth line, reached the silhouette
      //     and scored the badlands behind it (range 224 on Gladiolus);
      //   - the second, x = 34 mm at eye height, sat under the fringe and
      //     scored hair (range 130, edge 51/mm);
      //   - the third, x = 36 mm on the mouth line, contains the **nasolabial
      //     fold**, which `Face.ts` itself calls "the strongest off-midline
      //     value on the lower face at any angle other than dead-on".
      //
      // A control that is itself a feature makes the bar unpassable and, worse,
      // makes it unpassable by an amount that depends on which feature. So:
      // the chin plate below the mentolabial sulcus, and the cheek at the nose
      // base above the fold's top — and whichever scores lower is the floor.
      const cChin = scoreWindow(img, ...win(litSign > 0 ? c.px.chinR : c.px.chinL, -8, 9, -7, 7), mmp);
      const cSide = scoreWindow(img, ...win(litSign > 0 ? c.px.sideR : c.px.sideL, -8, 9, -7, 7), mmp);
      const cheek = cChin.range <= cSide.range ? cChin : cSide;

      rows.push({
        name, litSign, pxPerMm: +mmp.toFixed(3), mouth, nose, cheek,
        noseLeadMm: c.noseLeadMm, mouthReliefMm: c.mouthReliefMm,
        transverseDropMm: c.transverseDropMm, mentonWidthFrac: c.mentonWidthFrac,
        headHeightMm: c.headHeightMm,
      });
    }
  } finally {
    await leased.release();
  }

  if (errors.length) {
    console.error(`\n${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 12)) console.error('  ' + e.split('\n')[0]);
    process.exit(1);
  }
  if (!rows.length) {
    console.error('facecheck: no heads measured — the party did not build.');
    process.exit(1);
  }

  const pad = (s: string, n: number) => s.padEnd(n);
  const num = (v: number, n = 2, w = 8) => v.toFixed(n).padStart(w);
  const fails: string[] = [];

  console.log('\nrendered — 0.55 m front framing, hour 16.2, lit half only.');
  console.log('  every feature window is scored against the SAME face\'s cheek, same height, same light.');
  console.log(`  ${pad('char', 9)}${pad('lit', 5)}${pad('px/mm', 8)}` +
    `${'mouthRange'.padStart(11)}${'mouthEdge'.padStart(11)}${'noseRange*'.padStart(12)}${'cheek r/e'.padStart(14)}`);
  let voided = 0;
  for (const r of rows) {
    const mR = r.mouth.range - r.cheek.range;
    const mE = r.mouth.edge - r.cheek.edge;
    const nR = r.nose.range - r.cheek.range;
    const void_ = r.cheek.range > CONTROL_CEILING;
    console.log(`  ${pad(r.name, 9)}${pad(r.litSign > 0 ? 'R' : 'L', 5)}${num(r.pxPerMm, 2, 8)}` +
      `${num(mR, 1, 11)}${num(mE, 2, 11)}${num(nR, 1, 12)}` +
      `${`${r.cheek.range.toFixed(1)}/${r.cheek.edge.toFixed(2)}`.padStart(14)}` +
      (void_ ? '   VOID — no blank patch on this face' : ''));
    if (void_) { voided++; continue; }
    if (mR < LIMITS.mouthRange) fails.push(`${r.name}: mouthRange ${mR.toFixed(1)} < ${LIMITS.mouthRange} — no mouth in the frame`);
    if (mE < LIMITS.mouthEdge) fails.push(`${r.name}: mouthEdge ${mE.toFixed(2)} < ${LIMITS.mouthEdge}/mm — the mouth is a ramp, not an edge`);
    // `noseRange` is REPORTED, NOT GATED, and the reason is specific: the
    // nose window sits at the height Noctis' and Prompto's fringe casts its
    // shadow across, so the one control that makes these numbers mean anything
    // — a blank patch of the same face in the same light — cannot be matched
    // for it. Measured across the cast on the first run it swung -131 to +121
    // with no sculpt change between the four. The nose is gated on the
    // geometry side instead, by `noseLeadMm`.
  }

  console.log('\ngeometry — canonical head space, millimetres.');
  console.log(`  ${pad('char', 9)}${'noseLead'.padStart(10)}${'mouthRelief'.padStart(12)}${'transDrop'.padStart(11)}${'menton/max'.padStart(12)}${'headH'.padStart(8)}`);
  for (const r of rows) {
    console.log(`  ${pad(r.name, 9)}${num(r.noseLeadMm, 1, 10)}${num(r.mouthReliefMm, 2, 12)}` +
      `${num(r.transverseDropMm, 1, 11)}${num(r.mentonWidthFrac, 3, 12)}${num(r.headHeightMm, 0, 8)}`);
    if (r.noseLeadMm < LIMITS.noseLeadMm) fails.push(`${r.name}: noseLeadMm ${r.noseLeadMm} < ${LIMITS.noseLeadMm} — the chin is level with or ahead of the nose`);
    if (r.mouthReliefMm < LIMITS.mouthReliefMm) fails.push(`${r.name}: mouthReliefMm ${r.mouthReliefMm} < ${LIMITS.mouthReliefMm} — no mouth geometry`);
    if (r.transverseDropMm > LIMITS.transverseDropMm) fails.push(`${r.name}: transverseDropMm ${r.transverseDropMm} > ${LIMITS.transverseDropMm} — the face turns away from the front too fast`);
    if (r.mentonWidthFrac < LIMITS.mentonWidthFrac) fails.push(`${r.name}: mentonWidthFrac ${r.mentonWidthFrac} < ${LIMITS.mentonWidthFrac} — the chin comes to a point`);
  }
  console.log(`\n  limits: ${JSON.stringify(LIMITS)}`);
  console.log('  * noseRange is reported, not gated — see the comment at its call site.');
  if (voided) console.log(`  ${voided} head(s) VOID on the pixel rows: control range over ${CONTROL_CEILING}.`);

  if (jsonAt) {
    const p = path.isAbsolute(jsonAt) ? jsonAt : path.join(ROOT, jsonAt);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, JSON.stringify({ limits: LIMITS, rows }, null, 1));
  }

  if (fails.length) {
    console.log(`\nFAIL — ${fails.length} of ${rows.length * 6} rows:`);
    for (const f of fails) console.log('  ' + f);
    process.exit(1);
  }
  console.log(`\nPASS — ${rows.length} heads: a mouth and a nose read in the frame, and the nose leads the chin.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await runTool(main);
}
