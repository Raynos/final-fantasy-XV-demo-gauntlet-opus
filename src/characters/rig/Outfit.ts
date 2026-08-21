import * as THREE from 'three';
import { MeshBuilder, sweepTube, sweepShell, blob, roundedBox, abump, bump, lerp, smooth, clamp01 } from './Geo.ts';
import { torsoNodes, armNodes, legNodes, drape, torsoShape, armShape, legShape } from './Anatomy.ts';
import { Noise } from '../../util/Noise.ts';

const _c = new THREE.Color();
const _cloth = new Noise(9137);

/** Gaussian ridge centred on `c`, half-width `w`. */
const ridge = (x: any, c: any, w: any) => Math.exp(-((x - c) / w) * ((x - c) / w));

/** Same, on an angle, wrapping at 2π. */
function aridge(th: any, c: any, w: any) {
  let d = Math.abs(th - c) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return Math.exp(-(d / w) * (d / w));
}

/**
 * Panel break-up for a garment sweep.
 *
 * Near-black cloth carries almost no colour information, so everything that
 * says "jacket" rather than "shell" has to arrive as *value*: stitched seams a
 * shade darker than the panel they join, a hem and a shoulder worn a shade
 * lighter, and a low-frequency mottle so the field between them is never flat.
 * Roughness tells the same story — thread and creased cloth are matte, a worn
 * edge and a stretched shoulder are not — and on this palette the roughness
 * break is the more legible half of the pair.
 *
 * @param o garment piece description
 */
function clothShade(o: any): {color:(th:number,t:number)=>THREE.Color, mat:(th:number,t:number)=>number[]} {
  const base = new THREE.Color().setHex(o.color ?? 0x2a2a30, THREE.SRGBColorSpace);
  const rough = o.rough ?? 0.78;
  const metal = o.metal ?? 0;
  const seams = o.seams ?? [Math.PI, Math.PI * 0.54, Math.PI * 1.46];
  const yoke = o.yoke ?? 0.76;
  const wear = o.wear ?? 1;
  const out = new THREE.Color();
  const seamK = (th: any, t: any) => {
    let s = 0;
    for (const c of seams) s = Math.max(s, aridge(th, c, o.seamW ?? 0.055));
    s = Math.max(s, ridge(t, yoke, 0.020) * 0.9);
    return s;
  };
  const wearK = (th: any, t: any) => wear * (
    0.85 * ridge(t, o.hemAt ?? 0.030, 0.042)
    + 0.45 * ridge(t, 0.885, 0.055) * Math.pow(Math.abs(Math.sin(th)), 2.0)
  );
  const mottle = (th: any, t: any) => 0.11 * _cloth.fbm2(Math.cos(th) * 2.6 + 7.3, Math.sin(th) * 2.6 + t * 4.4, 3);
  return {
    /** Seam mask, 0..1 — also drives the raised topstitch ridge in `shape`. */
    seam: seamK,
    wear: wearK,
    color: (th, t) => out.copy(base).multiplyScalar(
      (1 - 0.40 * seamK(th, t)) * (1 + 0.62 * wearK(th, t)) * (1 + mottle(th, t))
    ),
    mat: (th, t) => [clamp01(rough + 0.15 * seamK(th, t) - 0.18 * wearK(th, t)), metal, 0],
  };
}

/** Damped body shaping remapped into a garment's own sweep parameter. */
function under(fn: any, u0: any, u1: any, damp = 0.88) {
  return (th: any, t: any) => 1 + (fn(th, u0 + (u1 - u0) * t) - 1) * damp;
}

/**
 * Clothing as real, layered geometry.
 *
 * Every piece is cut from the body sweeps it covers (see Anatomy.js), padded
 * outward and given its own skin weights, so a jacket sits *over* the tee that
 * sits over the torso, all three deform together, and an open jacket shows
 * genuine cloth thickness at the lapel.
 *
 * An outfit is data: a list of pieces, dispatched here.
 */

const PIECES = {};

/**
 * @param look character description; `look.outfit` is the piece list
 */
export function buildOutfit(rig: any, look: any): THREE.BufferGeometry {
  const B = new MeshBuilder('outfit');
  const ctx = {
    rig,
    look,
    torso: torsoNodes(rig),
    arm: (side: any) => armNodes(rig, side),
    leg: (side: any) => legNodes(rig, side),
    s: rig.dims.s,
  };
  let g = 10;
  for (const piece of look.outfit) {
    const fn = PIECES[piece.type];
    if (!fn) continue;
    B.group(g++);
    B.color(piece.color ?? 0x2a2a30).mat(piece.rough ?? 0.78, piece.metal ?? 0);
    fn(B, ctx, piece);
  }
  return B.build();
}

/** Register a garment type. */
function piece(name: any, fn: any) { PIECES[name] = fn; }

// ---------------------------------------------------------------------------
// torso layers
// ---------------------------------------------------------------------------

/** Closed torso layer — tee, tank top, undershirt. */
piece('shirt', (B: any, ctx: any, o: any) => {
  const u0 = o.u0 ?? 0.28, u1 = o.u1 ?? 0.96;
  const nodes = drape(ctx.torso, u0, u1, 10, o.pad ?? 0.010, o.padZ);
  const cut = o.neckCut ?? 0.55;
  const body = under(torsoShape(ctx.rig.profile.muscle), u0, u1, 0.92);
  const base = _c.clone().setHex(o.color ?? 0x2a2a30, THREE.SRGBColorSpace);
  const printC = new THREE.Color().setHex(o.printColor ?? 0xcccccc, THREE.SRGBColorSpace);
  const shade = clothShade({ ...o, seams: o.seams ?? [Math.PI * 0.52, Math.PI * 1.48], yoke: o.yoke ?? 0.86 });
  const tee = new THREE.Color();
  sweepTube(B, {
    nodes, steps: o.steps ?? 20, seg: o.seg ?? 32,
    shape: (th, t) => body(th, t)
      + (o.chest ?? 0.0) * abump(th, 0, 1.2) * bump(t, 0.7, 0.3)
      - 0.35 * cut * abump(th, 0, 0.75) * smooth((t - 0.86) / 0.15)     // neckline scoop
      - 0.30 * cut * abump(th, Math.PI, 0.9) * smooth((t - 0.9) / 0.12)
      + (o.wrinkle ?? 0.020) * Math.sin(th * 9 + t * 22) * bump(t, 0.35, 0.4)
      + (o.wrinkle ?? 0.020) * 0.7 * Math.sin(th * 4.5 - t * 12.0) * bump(t, 0.55, 0.45)
      // side and shoulder seams as raised topstitch, plus the ribbed neckband
      // and the doubled hem — the two edges of a tee that ever catch light
      + (o.seamRib ?? 0.011) * shade.seam(th, t)
      + (o.neckRib ?? 0.013) * ridge(t, 0.965, 0.030)
      + (o.hemRib ?? 0.011) * ridge(t, 0.030, 0.026),
    colorAt: o.print
      ? (th: any, t: any) => tee.copy(shade.color(th, t))
        .multiplyScalar(1 + 0.40 * ridge(t, 0.965, 0.030) + 0.30 * ridge(t, 0.030, 0.026))
        .lerp(printC, o.print(th, t))
      : (th: any, t: any) => tee.copy(shade.color(th, t))
        .multiplyScalar(1 + 0.40 * ridge(t, 0.965, 0.030) + 0.30 * ridge(t, 0.030, 0.026)),
    matAt: o.print
      ? (th: any, t: any) => { const m = shade.mat(th, t); return [clamp01(m[0] + 0.12 * o.print(th, t)), m[1], 0]; }
      : shade.mat,
    uvScale: [1.4, 2.4],
  });
  B.color(o.color ?? 0x2a2a30).mat(o.rough ?? 0.78, o.metal ?? 0, 0);
  if (o.hemBand) hemBand(B, ctx, nodes[0], o);
});

/** Open-front jacket / coat body, with lapels, thickness and a flared hem. */
piece('jacket', (B: any, ctx: any, o: any) => {
  const gap = o.gap ?? 0.42;
  const u0 = o.u0 ?? 0.30, u1 = o.u1 ?? 0.96;
  // the pad tucks in toward the yoke so the cut edge hides against the shoulder
  const base = o.pad ?? 0.026;
  const padFn = (t: any) => base * (1 - 0.62 * smooth((t - 0.70) / 0.30));
  const nodes = drape(ctx.torso, u0, u1, 12, padFn, padFn);
  const body = under(torsoShape(ctx.rig.profile.muscle), u0, u1, 0.90);
  const shade = clothShade(o);
  const jc = new THREE.Color();
  /** How proud of the panel a point sits: placket band plus hem band. */
  const proud = (th: any, t: any) => {
    const pl = Math.min(
      Math.abs(th - (gap + 0.20)),
      Math.abs(th - (Math.PI * 2 - gap - 0.20))
    );
    return Math.max(
      Math.exp(-(pl / 0.11) * (pl / 0.11)) * smooth(t / 0.18),
      ridge(t, 0.045, 0.030)
    );
  };
  sweepShell(B, {
    // a fold sampled four times across its own period is a facet, not a fold:
    // the ring count is what lets the creases below cast their own shadow
    nodes, steps: o.steps ?? 26, seg: o.seg ?? 38,
    theta0: gap, theta1: Math.PI * 2 - gap,
    thickness: o.thickness ?? 0.013,
    shape: (th: any, t: any) => {
      let k = body(th, t);
      // lapel roll: the front edges peel outward across the chest only — let it
      // reach the yoke and the shoulder grows a pointed epaulette
      const edge = Math.min(Math.abs(th - gap), Math.abs(th - (Math.PI * 2 - gap)));
      k += 0.085 * Math.exp(-edge * 5) * bump(t, 0.62, 0.34);
      k += (o.flare ?? 0.10) * smooth((0.18 - t) / 0.18);              // hem flare
      // a real waist. A jacket with no nip between ribcage and hip is a barrel,
      // and a barrel is the single loudest "this is a game model" tell there is.
      k -= (o.waist ?? 0.055) * bump(t, 0.30, 0.26);
      // hem break: cloth folds over on itself where it stops being supported
      k += (o.hemBreak ?? 0.030) * Math.pow(Math.max(0, 1 - t / 0.14), 1.6)
         * (0.6 + 0.4 * Math.sin(th * 5.0 + 1.1));
      // Real folds. Cloth that never creases reads as vacuum-formed plastic,
      // and on a near-black garment the shadow inside a crease is most of the
      // material information the viewer ever gets — so these run roughly twice
      // as deep as before, with a second, finer set crossing them.
      const wr = o.wrinkle ?? 0.030;
      k += wr * Math.sin(th * 7 + t * 16)
         + wr * 0.70 * Math.sin(th * 3.2 - t * 9.0) * smooth((0.55 - t) / 0.55)
         + wr * 0.55 * Math.sin(th * 13.0 + t * 4.0) * smooth((0.70 - t) / 0.55)
         // drag folds pulling from the armpit toward the opposite hip
         + wr * 0.90 * Math.sin(th * 2.0 + t * 7.5) * bump(t, 0.48, 0.34);
      // Topstitching. A raised 2 mm rib along every seam is the single detail
      // that turns a black shell into a tailored garment: it is geometry, so it
      // catches a real specular edge from any light direction, and it survives
      // minification in a way a painted line never does.
      k += (o.seamRib ?? 0.014) * shade.seam(th, t);
      // a doubled-over hem band around the bottom edge
      k += (o.hemRib ?? 0.016) * ridge(t, 0.045, 0.030);
      // zip guard: a raised placket running just inboard of each front edge
      const pl = Math.min(
        Math.abs(th - (gap + 0.20)),
        Math.abs(th - (Math.PI * 2 - gap - 0.20))
      );
      k += (o.placket ?? 0.016) * Math.exp(-(pl / 0.11) * (pl / 0.11)) * smooth(t / 0.18);
      k -= 0.05 * abump(th, Math.PI, 0.5) * bump(t, 0.9, 0.2);          // yoke tuck
      return k;
    },
    // the top edge follows the trapezius down toward the acromion — a flat
    // horizontal ring here is what produces boxy pauldron corners
    offset: (th: any, t: any, out: any) => {
      const drop = (o.shoulderDrop ?? 0.008) * ctx.s;
      out.y = -drop * smooth((t - 0.62) / 0.38) * Math.pow(Math.abs(Math.sin(th)), 1.6);
    },
    uvScale: [1.6, 2.6],
    // the placket and the hem are proud of the panel, so they take the light:
    // a shade lighter and a good deal smoother than the cloth behind them
    colorAt: (th: any, t: any) => jc.copy(shade.color(th, t)).multiplyScalar(1 + 0.45 * proud(th, t)),
    matAt: (th: any, t: any) => { const m = shade.mat(th, t); return [clamp01(m[0] - 0.26 * proud(th, t)), m[1], 0]; },
  });
  B.color(o.color ?? 0x2a2a30).mat(o.rough ?? 0.78, o.metal ?? 0, 0);
  if (o.collar !== false) collar(B, ctx, o);
});

/** Stand-up or fold-down collar wrapped around the neck. */
function collar(B: any, ctx: any, o: any) {
  const { rig } = ctx;
  const s = ctx.s;
  const y = (v: any) => v * s;
  const h = o.collarH ?? 0.055;
  const gap = o.collarGap ?? (o.gap ?? 0.42) * 0.8;
  const r0 = (o.collarR ?? 0.085) * s;
  const I = rig.index;
  const y0 = y(o.collarY ?? 1.418);
  const nodes = [
    { p: [0, y0, -0.012 * s], rx: r0 * 1.02, rz: r0 * 0.98, w: [[I.spine03, 0.95], [I.neck, 0.05]] },
    { p: [0, y0 + h * s * 0.5, -0.016 * s], rx: r0 * 0.90, rz: r0 * 0.90, w: [[I.spine03, 0.6], [I.neck, 0.4]] },
    { p: [0, y0 + h * s * 1.1, -0.018 * s], rx: r0 * (o.collarFlare ?? 1.0), rz: r0 * (o.collarFlare ?? 1.0), w: [[I.spine03, 0.28], [I.neck, 0.72]] },
  ];
  // A collar is the one garment edge that sits right beside the face, so it is
  // the piece that most repays being told apart from the body of the jacket:
  // its outer face is worn smoother, and its top edge catches the sky.
  const cCol = new THREE.Color().setHex(o.collarColor ?? o.color ?? 0x2a2a30, THREE.SRGBColorSpace);
  const cRough = (o.collarRough ?? (o.rough ?? 0.6) - 0.14);
  const out = new THREE.Color();
  sweepShell(B, {
    nodes, steps: 7, seg: 24,
    theta0: gap, theta1: Math.PI * 2 - gap,
    thickness: o.thickness ?? 0.012,
    shape: (th: any, t: any) => 1 + 0.16 * t * Math.exp(-Math.min(Math.abs(th - gap), Math.abs(th - (Math.PI * 2 - gap))) * 3)
      + 0.020 * Math.sin(th * 6.0 + 1.4) * t,
    colorAt: (th: any, t: any) => out.copy(cCol).multiplyScalar(1 + 0.55 * Math.pow(t, 2.2) + 0.05 * Math.sin(th * 5.0)),
    matAt: (th: any, t: any) => [clamp01(cRough - 0.22 * Math.pow(t, 2.2)), o.metal ?? 0, 0],
    uvScale: [1, 0.5],
  });
  B.color(o.color ?? 0x2a2a30).mat(o.rough ?? 0.78, o.metal ?? 0, 0);
}

/** Skirt / coat tails hanging from the waist, driven by the coat spring bones. */
piece('skirt', (B: any, ctx: any, o: any) => {
  const { rig } = ctx;
  const I = rig.index;
  const s = ctx.s;
  const y = (v: any) => v * s;
  const top = o.top ?? 1.02, bot = o.bottom ?? 0.72;
  const rTop = (o.rTop ?? 0.175) * s, rBot = (o.rBot ?? 0.20) * s;
  const steps = o.steps ?? 10;
  const nodes = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const yy = lerp(top, bot, t);
    const r = lerp(rTop, rBot, Math.pow(t, 0.8));
    // hips hold the waistband; the spring bones own the free hem
    const spring = Math.pow(t, 1.4) * (o.spring ?? 0.85);
    nodes.push({
      p: [0, y(yy), 0.004 * s],
      rx: r, rz: r * (o.depth ?? 0.85),
      w: [[I.hips, 1 - spring], [I.coatL, spring * 0.34], [I.coatR, spring * 0.34], [I.coatF, spring * 0.32]],
    });
  }
  const gap = o.gap ?? 0.5;
  sweepShell(B, {
    nodes, steps, seg: o.seg ?? 22,
    theta0: gap, theta1: Math.PI * 2 - gap,
    thickness: o.thickness ?? 0.012,
    shape: (th: any, t: any) => 1
      + (o.wave ?? 0.05) * Math.sin(th * 6) * t
      + (o.backLong ?? 0) * abump(th, Math.PI, 1.4) * t,
    offset: (th: any, t: any, out: any) => { out.y = -(o.backLong ?? 0) * abump(th, Math.PI, 1.5) * 0.4 * s * t; },
    uvScale: [1.6, 1.2],
  });
});

/** Sleeve over the arm; `u1` sets short / three-quarter / full length. */
piece('sleeve', (B: any, ctx: any, o: any) => {
  for (const side of (o.sides || ['L', 'R'])) {
    // The sleeve now starts at the *clavicle root*, i.e. buried inside the
    // torso shell, and simply emerges from under the jacket yoke. Cutting it at
    // the acromion and doming the cut (which is what this used to do) is what
    // produced the pointed wing at each shoulder corner, plus a triangle of
    // bare skin between sleeve and yoke.
    const u0 = o.u0 ?? 0.03, u1 = o.u1 ?? 0.88;
    const base = o.pad ?? 0.014;
    const nodes = drape(ctx.arm(side), u0, u1, 9,
      // negative padding at the root sinks the seam inside the body; the sleeve
      // reaches full thickness only once it is clear of the deltoid
      (t) => base * (0.15 + 0.85 * smooth(t * 2.4)) - 0.013 * (1 - smooth(t * 2.6)));
    const body = under(armShape(ctx.rig.profile.muscle, side === 'L' ? 1 : -1), u0, u1, 0.94);
    const shade = clothShade({ ...o, seams: o.seams ?? [Math.PI * 0.5, Math.PI * 1.5], yoke: 0.22, hemAt: 0.94 });
    sweepTube(B, {
      nodes, steps: o.steps ?? 18, seg: o.seg ?? 22,
      shape: (th, t) => body(th, t)
        + (o.wrinkle ?? 0.024) * Math.sin(th * 6 + t * 18) * smooth(t)
        // elbow crush: a sleeve is at its most creased where the arm bends
        + (o.wrinkle ?? 0.024) * 1.1 * Math.sin(t * 34.0 + th * 1.5) * bump(t, 0.52, 0.22)
        + (o.cuff ?? 0.0) * bump(t, 0.96, 0.10)
        - (o.taper ?? 0.05) * smooth((t - 0.86) / 0.14)     // wrist taper, no butt-seam
        + (o.shoulderPad ?? 0.0) * bump(t, 0.16, 0.14)
        + (o.seamRib ?? 0.012) * shade.seam(th, t),
      colorAt: shade.color,
      matAt: shade.mat,
      uvScale: [1, 2],
    });
    B.color(o.color ?? 0x1a1a1e).mat(o.rough ?? 0.78, o.metal ?? 0, 0);
    if (o.cuffBand) {
      const c = drape(ctx.arm(side), (o.u1 ?? 0.88) - 0.045, (o.u1 ?? 0.88) + 0.005, 3, (o.pad ?? 0.014) + 0.005);
      B.color(o.cuffColor ?? o.color ?? 0x1a1a1e);
      sweepTube(B, { nodes: c, steps: 3, seg: 14, uvScale: [1, 0.4] });
      B.color(o.color ?? 0x1a1a1e);
    }
  }
});

/** Trousers — one closed tube per leg plus a waistband. */
piece('pants', (B: any, ctx: any, o: any) => {
  for (const side of ['L', 'R']) {
    const u0 = o.u0 ?? 0.02, u1 = o.u1 ?? 0.93;
    const nodes = drape(ctx.leg(side), u0, u1, 10,
      (t) => lerp(o.padHip ?? 0.014, o.padAnkle ?? 0.012, t));
    const body = under(legShape(ctx.rig.profile.muscle), u0, u1, 0.94);
    const shade = clothShade({ ...o, seams: o.seams ?? [Math.PI * 0.5, Math.PI * 1.5], yoke: 0.06, hemAt: 0.10 });
    sweepTube(B, {
      nodes, steps: o.steps ?? 18, seg: o.seg ?? 22,
      shape: (th, t) => body(th, t)
        + (o.wrinkle ?? 0.020) * Math.sin(th * 5 + t * 20) * smooth(t * 1.6)
        // the stack of creases behind the knee and above the ankle
        + (o.wrinkle ?? 0.020) * 1.2 * Math.sin(t * 46.0) * bump(t, 0.56, 0.16)
        + (o.wrinkle ?? 0.020) * 0.9 * Math.sin(t * 38.0 + 1.0) * bump(t, 0.86, 0.12)
        + (o.knee ?? 0.03) * bump(t, 0.5, 0.12)
        + (o.cargo ?? 0) * (abump(th, Math.PI * 0.5, 0.8) + abump(th, -Math.PI * 0.5, 0.8)) * bump(t, 0.34, 0.10)
        + (o.boot ?? 0) * bump(t, 0.92, 0.14)
        + (o.seamRib ?? 0.010) * shade.seam(th, t),
      colorAt: shade.color,
      matAt: shade.mat,
      uvScale: [1.2, 2.4],
    });
    B.color(o.color ?? 0x22242a).mat(o.rough ?? 0.78, o.metal ?? 0, 0);
  }
  if (o.waist !== false) {
    // reaches down over the hip crest: the leg tubes only begin at the greater
    // trochanter, so a short waistband leaves a ring of bare skin at the pelvis
    const w = drape(ctx.torso, 0.16, 0.42, 5, (o.padHip ?? 0.014) + 0.004);
    B.color(o.waistColor ?? o.color ?? 0x22242a);
    sweepTube(B, { nodes: w, steps: 6, seg: 20, uvScale: [1, 0.5] });
  }
});

/** Boots: a foot shell swept heel-to-toe plus a shaft up the shin. */
piece('boots', (B: any, ctx: any, o: any) => {
  const { rig } = ctx;
  const I = rig.index;
  const s = ctx.s;
  for (const side of ['L', 'R']) {
    const an = rig.P[`foot${side}`];
    const sg = side === 'L' ? 1 : -1;
    const w = (o.width ?? 0.048) * s, hgt = (o.height ?? 0.036) * s;
    const soleY = (o.sole ?? 0.004) * s;
    const fw = [[I[`foot${side}`], 1]];
    const tw = [[I[`toe${side}`], 0.75], [I[`foot${side}`], 0.25]];
    sweepTube(B, {
      nodes: [
        { p: [an.x, an.y + 0.030 * s, an.z - 0.070 * s], rx: w * 0.72, rz: hgt * 0.95, w: fw },
        { p: [an.x, an.y - 0.030 * s, an.z - 0.062 * s], rx: w * 0.78, rz: hgt * 0.72, w: fw },
        { p: [an.x, an.y - 0.045 * s + soleY, an.z - 0.020 * s], rx: w * 0.94, rz: hgt * 0.88, w: fw },
        { p: [an.x, an.y - 0.046 * s + soleY, an.z + 0.040 * s], rx: w, rz: hgt * 0.80, w: [[I[`foot${side}`], 0.7], [I[`toe${side}`], 0.3]] },
        { p: [an.x, an.y - 0.046 * s + soleY, an.z + 0.098 * s], rx: w * 0.90, rz: hgt * 0.66, w: tw },
        { p: [an.x, an.y - 0.040 * s + soleY, an.z + 0.130 * s], rx: w * 0.55, rz: hgt * 0.42, w: tw },
      ],
      steps: 14, seg: 16, ref: [0, 1, 0],
      shape: (th, t) => 1
        + 0.10 * abump(th, 0, 1.2) * bump(t, 0.18, 0.25)          // heel counter
        - 0.06 * abump(th, Math.PI, 1.0) * bump(t, 0.55, 0.3),
      uvScale: [1, 1.4],
    });
    // sole slab
    B.color(o.soleColor ?? 0x14151a).mat(0.9, 0);
    sweepTube(B, {
      nodes: [
        { p: [an.x, an.y - 0.062 * s, an.z - 0.062 * s], rx: w * 0.80, rz: 0.014 * s, w: fw },
        { p: [an.x, an.y - 0.066 * s, an.z - 0.010 * s], rx: w * 0.98, rz: 0.014 * s, w: fw },
        { p: [an.x, an.y - 0.066 * s, an.z + 0.060 * s], rx: w * 1.02, rz: 0.014 * s, w: tw },
        { p: [an.x, an.y - 0.060 * s, an.z + 0.124 * s], rx: w * 0.66, rz: 0.012 * s, w: tw },
      ],
      steps: 8, seg: 12, ref: [0, 1, 0], uvScale: [1, 0.6],
    });
    B.color(o.color ?? 0x1b1c22).mat(o.rough ?? 0.6, 0);
    // shaft
    const shaft = drape(ctx.leg(side), 0.99, (o.shaft ?? 0.72), 5, (o.pad ?? 0.016));
    sweepTube(B, {
      nodes: shaft, steps: 8, seg: 16,
      shape: (th, t) => 1 + (o.cuff ?? 0.05) * bump(t, 0.95, 0.12) + 0.02 * Math.sin(th * 7 + t * 9),
      uvScale: [1, 0.8],
    });
    if (o.strap) {
      B.color(o.strapColor ?? 0x101116).mat(0.55, 0.1);
      const st = drape(ctx.leg(side), (o.shaft ?? 0.72) + 0.04, (o.shaft ?? 0.72) + 0.09, 3, (o.pad ?? 0.016) + 0.008);
      sweepTube(B, { nodes: st, steps: 3, seg: 14, uvScale: [1, 0.2] });
      B.color(o.color ?? 0x1b1c22);
    }
  }
});

/** Belt or waist strap. */
piece('belt', (B: any, ctx: any, o: any) => {
  const nodes = drape(ctx.torso, (o.u ?? 0.36) - 0.03, (o.u ?? 0.36) + 0.03, 3, o.pad ?? 0.020, (o.padZ ?? o.pad ?? 0.020));
  sweepTube(B, {
    nodes, steps: 3, seg: o.seg ?? 22,
    shape: (th) => 1 + (o.buckle ?? 0.05) * abump(th, 0, 0.35),
    uvScale: [1, 0.2],
  });
  if (o.buckleBox) {
    const n = nodes[1];
    B.color(o.buckleColor ?? 0x8a8f96).mat(0.32, 0.85);
    B.skin(n.w);
    roundedBox(B, {
      size: [0.055 * ctx.s, 0.036 * ctx.s, 0.014 * ctx.s],
      center: [0, n.p[1], n.p[2] + n.rz + 0.004 * ctx.s],
      bevel: 0.006 * ctx.s,
    });
  }
});

/** Shoulder-to-hip strap (camera strap, sword harness). */
piece('strap', (B: any, ctx: any, o: any) => {
  const { rig } = ctx;
  const I = rig.index;
  const s = ctx.s;
  const sg = o.side === 'R' ? -1 : 1;
  const w = (o.width ?? 0.020) * s;
  const end = o.to ? o.to.map((v: any) => v * s) : [-sg * 0.070 * s, rig.dims.shoulderY - 0.30 * s, 0.090 * s];
  const pts = [
    { p: [sg * 0.058 * s, rig.dims.shoulderY + 0.020 * s, -0.052 * s], w: [[I.spine03, 1]] },
    { p: [sg * 0.082 * s, rig.dims.shoulderY + 0.012 * s, 0.028 * s], w: [[I.spine03, 1]] },
    { p: [sg * 0.036 * s, rig.dims.shoulderY - 0.15 * s, 0.108 * s], w: [[I.spine02, 0.7], [I.spine03, 0.3]] },
    { p: end, w: [[I.spine01, 0.6], [I.spine02, 0.4]] },
  ];
  sweepTube(B, {
    nodes: pts.map((q) => ({ p: q.p, rx: w, rz: 0.005 * s, w: q.w })),
    steps: 12, seg: 8, ref: [0, 0, 1], uvScale: [1, 1.4],
  });
});

/** Wrist / arm band. */
piece('band', (B: any, ctx: any, o: any) => {
  for (const side of (o.sides || ['L', 'R'])) {
    const nodes = drape(ctx.arm(side), (o.u ?? 0.88) - 0.035, (o.u ?? 0.88) + 0.035, 4, o.pad ?? 0.008);
    sweepTube(B, {
      nodes, steps: 4, seg: o.seg ?? 14,
      shape: (th) => 1 + (o.ridge ?? 0.03) * Math.sin(th * 12),
      uvScale: [1, 0.25],
    });
  }
});

/** Shoulder guard / pauldron-ish pad. */
piece('pad', (B: any, ctx: any, o: any) => {
  const { rig } = ctx;
  const I = rig.index;
  const s = ctx.s;
  const m = rig.profile.muscle;
  for (const side of (o.sides || ['L', 'R'])) {
    const sh = rig.P[`upperArm${side}`];
    const sg = side === 'L' ? 1 : -1;
    B.skin([[I[`upperArm${side}`], 0.66], [I[`clavicle${side}`], 0.34]]);
    const r = (o.r ?? 0.062) * s * (1 + 0.28 * m);
    blob(B, {
      center: [sh.x - sg * 0.006 * s, sh.y + (o.lift ?? 0.004) * s, sh.z + 0.002 * s],
      scale: [r, r * (o.squash ?? 0.92), r * 0.97],
      segU: 16, segV: 10,
    });
  }
});

/** A camera body with lens, hanging where a strap would carry it. */
piece('camera', (B: any, ctx: any, o: any) => {
  const { rig } = ctx;
  const I = rig.index;
  const s = ctx.s;
  const p = [(o.at ?? [-0.10, 1.06, 0.135]).map((v: any, i: any) => v * s)[0],
    (o.at ?? [-0.10, 1.06, 0.135])[1] * s, (o.at ?? [-0.10, 1.06, 0.135])[2] * s];
  B.skin([[I.spine01, 0.65], [I.spine02, 0.35]]);
  B.color(o.color ?? 0x1c1d22).mat(0.45, 0.15);
  roundedBox(B, { size: [0.095 * s, 0.062 * s, 0.040 * s], center: p, bevel: 0.010 * s, rot: [0.15, 0, 0.1] });
  B.color(0x2b2d33).mat(0.3, 0.5);
  sweepTube(B, {
    nodes: [
      { p: [p[0], p[1], p[2] + 0.018 * s], rx: 0.024 * s, w: [[I.spine01, 0.65], [I.spine02, 0.35]] },
      { p: [p[0], p[1], p[2] + 0.040 * s], rx: 0.022 * s, w: [[I.spine01, 0.65], [I.spine02, 0.35]] },
    ],
    steps: 2, seg: 12, ref: [0, 1, 0], uvScale: [1, 0.2],
  });
  B.color(0x0a1620).mat(0.06, 0.2);
  blob(B, { center: [p[0], p[1], p[2] + 0.044 * s], scale: [0.019 * s, 0.019 * s, 0.006 * s], segU: 12, segV: 6 });
});

/** Rectangular spectacles: frame rims plus temple arms. */
piece('glasses', (B: any, ctx: any, o: any) => {
  const { rig } = ctx;
  const I = rig.index;
  const s = rig.dims.headScale;
  const org = rig.dims.headOrigin;
  const put = (x: any, y: any, z: any) => [org.x + x * s, org.y + y * s, org.z + z * s];
  B.skin([[I.head, 1]]);
  B.color(o.color ?? 0x23262c).mat(0.26, 0.55);
  const w = 0.0345, h = 0.0145;
  const eyeY = -0.006, eyeZ = 0.0796;   // just proud of the brow / FACE.eye
  for (const sg of [1, -1]) {
    const cx = sg * 0.0335;
    // rim: a thin rounded rectangle traced as a tube
    const pts = [];
    const N = 18;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const px = cx + Math.cos(a) * w * (1 - 0.10 * Math.pow(Math.abs(Math.sin(a)), 4));
      const py = eyeY + Math.sin(a) * h * (1 - 0.12 * Math.pow(Math.abs(Math.cos(a)), 4));
      pts.push({ p: put(px, py, eyeZ - Math.abs(px - cx) * 0.30), rx: 0.0018 * s, rz: 0.0026 * s, w: [[I.head, 1]] });
    }
    sweepTube(B, { nodes: pts, steps: 26, seg: 6, ref: [0, 0, 1], uvScale: [1, 1] });
    // temple arm back to the ear
    sweepTube(B, {
      nodes: [
        { p: put(cx + sg * w * 0.95, eyeY + 0.001, eyeZ - 0.008), rx: 0.0030 * s, w: [[I.head, 1]] },
        { p: put(sg * 0.070, eyeY + 0.004, 0.030), rx: 0.0028 * s, w: [[I.head, 1]] },
        { p: put(sg * 0.076, eyeY + 0.005, -0.020), rx: 0.0024 * s, w: [[I.head, 1]] },
      ],
      steps: 6, seg: 5, ref: [0, 1, 0], uvScale: [1, 1],
    });
  }
  // bridge
  sweepTube(B, {
    nodes: [
      { p: put(-0.009, eyeY + 0.003, eyeZ + 0.004), rx: 0.0028 * s, w: [[I.head, 1]] },
      { p: put(0, eyeY + 0.005, eyeZ + 0.007), rx: 0.0028 * s, w: [[I.head, 1]] },
      { p: put(0.009, eyeY + 0.003, eyeZ + 0.004), rx: 0.0028 * s, w: [[I.head, 1]] },
    ],
    steps: 4, seg: 5, ref: [0, 1, 0], uvScale: [1, 1],
  });
});

/** Small pouch / holster block on the thigh or belt. */
piece('pouch', (B: any, ctx: any, o: any) => {
  const { rig } = ctx;
  const I = rig.index;
  const s = ctx.s;
  for (const side of (o.sides || ['R'])) {
    const nodes = drape(ctx.leg(side), o.u ?? 0.22, o.u ?? 0.22, 1, 0);
    const n = nodes[0];
    const sg = side === 'L' ? 1 : -1;
    B.skin(n.w);
    roundedBox(B, {
      size: [(o.size ?? [0.05, 0.09, 0.035])[0] * s, (o.size ?? [0.05, 0.09, 0.035])[1] * s, (o.size ?? [0.05, 0.09, 0.035])[2] * s],
      center: [n.p[0] + sg * (n.rx + 0.016 * s), n.p[1], n.p[2] + 0.006 * s],
      bevel: 0.008 * s,
      rot: [0, 0, sg * 0.06],
    });
  }
});

/** Decorative panel — a flat plate laid on the chest or back (armour, tattoo pad). */
piece('plate', (B: any, ctx: any, o: any) => {
  const nodes = drape(ctx.torso, o.u0 ?? 0.6, o.u1 ?? 0.95, 5, (o.pad ?? 0.004));
  sweepTube(B, {
    nodes, steps: 6, seg: 18,
    theta0: (o.theta ?? [2.2, 4.1])[0], theta1: (o.theta ?? [2.2, 4.1])[1],
    uvScale: [1, 1],
  });
});

function hemBand(B: any, ctx: any, node: any, o: any) {
  const nodes = drape(ctx.torso, o.u0 ?? 0.28, (o.u0 ?? 0.28) + 0.05, 3, (o.pad ?? 0.010) + 0.004);
  sweepTube(B, { nodes, steps: 3, seg: 20, uvScale: [1, 0.2] });
}

export { PIECES };
