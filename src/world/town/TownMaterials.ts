import * as THREE from 'three';
import { Noise } from '../../util/Noise.ts';
import { makeTexture, makeDataMap, normalFromHeight, canvasTexture } from '../../util/TextureGen.ts';

/**
 * Materials and signage for Hammerhead.
 *
 * The palette is deliberately narrow and deliberately dirty: Hammerhead is a
 * working truck stop in a red-dust basin, so everything is either sun-bleached
 * cream, oxidised yellow, oil-black rubber or galvanised steel that has been
 * outdoors for twenty years. The only saturated colour in the whole town is the
 * red of the pylon sign and the diner trim — which is exactly why the eye goes
 * to them.
 *
 * Every material is memoised: the garage, the diner, the canopy and the fence
 * share four or five merged meshes between them.
 */

const cache = new Map();
function memo(k: string, f: any) { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); }

/** A textured PBR set built from one height function. */
function pbr(key: string, {
  tint, rough = 0.8, metal = 0, height, albedo, roughAt, normalScale = 1.0, size = 256, repeat = 1,
}: any) {
  return memo(key, () => {
    const base = new THREE.Color().setHex(tint, THREE.NoColorSpace);
    const map = makeTexture(size, (u: any, v: any, c: any) => albedo(u, v, c, base), { repeat });
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const normalMap = normalFromHeight(size, height, normalScale);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    const roughnessMap = roughAt ? makeDataMap(size, roughAt) : null;
    if (roughnessMap) roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
    const m = new THREE.MeshStandardMaterial({
      color: 0xffffff, map, normalMap, roughnessMap, roughness: rough, metalness: metal,
      normalScale: new THREE.Vector2(1, 1),
    });
    m.name = key;
    return m;
  });
}

/* ------------------------------------------------------------------ surfaces */

/**
 * Old asphalt.
 *
 * The trap here is making it *look* like tarmac up close and forgetting that
 * ninety percent of the time it is seen at a grazing angle across forty metres.
 * A strong normal map and a mid-grey albedo turn into lavender cobblestones the
 * moment the sky's blue ambient hits it. So: dark, warm with red dust blown
 * across it, and a normal barely deep enough to catch the sun.
 */
export function asphaltMaterial() {
  const n = new Noise(2211);
  const h = (u: number, v: number) => {
    const grit = n.worley2(u * 120, v * 120).f1;
    const coarse = n.fbm2(u * 34, v * 34, 3) * 0.5 + 0.5;
    return grit * 0.5 + coarse * 0.5;
  };
  return pbr('town_asphalt', {
    tint: 0x191612, rough: 0.96, size: 512, normalScale: 0.35, height: h,
    albedo: (u: number, v: number, c: any, base: any) => {
      const k = 0.86 + h(u, v) * 0.22;
      // Leide's red dust drifts over everything and collects in the low spots
      const dust = THREE.MathUtils.smoothstep(n.fbm2(u * 3.2 + 9, v * 3.2 - 4, 4) * 0.5 + 0.5, 0.34, 0.88);
      const tar = 1 - THREE.MathUtils.smoothstep(Math.abs(n.fbm2(u * 2.0, v * 2.0, 2)), 0.02, 0.10);
      const bleach = Math.max(0, n.fbm2(u * 7 - 20, v * 7 + 3, 3)) * 0.20;
      c[0] = (base.r * k + dust * 0.115 + bleach * 0.10) * (1 - tar * 0.28);
      c[1] = (base.g * k + dust * 0.082 + bleach * 0.09) * (1 - tar * 0.28);
      c[2] = (base.b * k + dust * 0.050 + bleach * 0.08) * (1 - tar * 0.28);
    },
    roughAt: (u: any, v: any) => 0.82 + h(u, v) * 0.17,
  });
}

/** Poured, oil-stained workshop floor and forecourt slabs. */
export function slabMaterial() {
  const n = new Noise(5512);
  const h = (u: number, v: number) => {
    const pit = Math.max(0, n.worley2(u * 44, v * 44).f1 - 0.36) * 1.2;
    const grain = n.fbm2(u * 62, v * 62, 3) * 0.5 + 0.5;
    // expansion joints on a 1/4 grid
    const joint = Math.min(sawEdge(u, 0.25), sawEdge(v, 0.25));
    return grain * 0.26 + 0.5 - pit * 0.22 - joint * 0.5;
  };
  return pbr('town_slab', {
    tint: 0x625b4e, rough: 0.94, size: 512, normalScale: 0.42, height: h,
    albedo: (u: number, v: number, c: any, base: any) => {
      const k = 0.80 + h(u, v) * 0.40;
      const oil = Math.pow(Math.max(0, n.fbm2(u * 4.5 + 31, v * 4.5 - 12, 4)), 1.6) * 1.6;
      const dust = Math.max(0, n.fbm2(u * 6 - 5, v * 6 + 17, 3)) * 0.5;
      c[0] = base.r * k * (1 - oil * 0.66) + dust * 0.09;
      c[1] = base.g * k * (1 - oil * 0.68) + dust * 0.065;
      c[2] = base.b * k * (1 - oil * 0.64) + dust * 0.035;
    },
    roughAt: (u: any, v: any) => 0.78 + h(u, v) * 0.2,
  });
}

function sawEdge(x: number, period: number) {
  const t = Math.abs((x % period) / period - 0.5) * 2;
  return 1 - THREE.MathUtils.smoothstep(t, 0.86, 1.0);
}

/** Gravel and compacted dirt for the parts yard. */
export function gravelMaterial() {
  const n = new Noise(7742);
  const h = (u: number, v: number) => {
    const w = n.worley2(u * 42, v * 42);
    return (1 - Math.min(1, w.f1 * 3.4)) * 0.7 + (n.fbm2(u * 18, v * 18, 3) * 0.5 + 0.5) * 0.3;
  };
  return pbr('town_gravel', {
    tint: 0x5c4a35, rough: 0.97, size: 512, normalScale: 0.7, height: h,
    albedo: (u: number, v: number, c: any, base: any) => {
      const k = 0.72 + h(u, v) * 0.5;
      const red = Math.max(0, n.fbm2(u * 5, v * 5, 3)) * 0.4;
      c[0] = base.r * k * (1 + red * 0.40);
      c[1] = base.g * k * (1 + red * 0.10);
      c[2] = base.b * k * (1 - red * 0.28);
    },
    roughAt: (u: any, v: any) => 0.90 + h(u, v) * 0.1,
  });
}

/** Corrugated wall/roof sheet — the garage, the fuel canopy fascia. */
export function corrugatedMaterial(tint = 0xb9b09a, rough = 0.62, metal = 0.35) {
  const n = new Noise(3391);
  const h = (u: number, v: number) => {
    const rib = Math.sin(u * Math.PI * 2 * 16) * 0.5 + 0.5;
    const dent = n.fbm2(u * 12, v * 12, 3) * 0.5 + 0.5;
    return rib * 0.72 + dent * 0.28;
  };
  return pbr(`town_corr${tint}${rough}${metal}`, {
    tint, rough, metal, size: 256, normalScale: 1.3, height: h,
    albedo: (u: number, v: number, c: any, base: any) => {
      // shade the ribs rather than rely on the normal alone; a corrugated wall
      // reads by its stripes long after the normal has mipped away
      const k = 0.80 + h(u, v) * 0.26;
      // streaked grime running down from the fixings, heavier at the foot
      const streak = Math.max(0, n.fbm2(u * 30, v * 2.0, 3)) * (1 - v) * 0.75;
      const dust = Math.max(0, n.fbm2(u * 5 + 7, v * 5, 3)) * (1 - v) * 0.4;
      c[0] = (base.r * k) * (1 - streak * 0.26) + dust * 0.10;
      c[1] = (base.g * k) * (1 - streak * 0.30) + dust * 0.07;
      c[2] = (base.b * k) * (1 - streak * 0.36) + dust * 0.04;
    },
    roughAt: (u: any, v: any) => rough * (0.86 + h(u, v) * 0.28),
  });
}

/** Painted panel steel: the canopy, the caravan shell, vehicle bodies. */
export function panelMaterial(tint = 0xd8cfb4, rough = 0.44, metal = 0.55) {
  const n = new Noise(6613);
  const h = (u: number, v: number) => n.fbm2(u * 26, v * 26, 3) * 0.5 + 0.5;
  return pbr(`town_panel${tint}${rough}${metal}`, {
    tint, rough, metal, size: 256, normalScale: 0.55, height: h,
    albedo: (u: number, v: number, c: any, base: any) => {
      // Chipping has to be *sparse*: a paint chip is a few square millimetres,
      // and a threshold low enough to show up everywhere reads as black mould.
      const chip = THREE.MathUtils.smoothstep(n.fbm2(u * 19 + 2, v * 19 - 6, 4) * 0.5 + 0.5, 0.80, 0.94) * 0.7;
      const dirt = Math.max(0, n.fbm2(u * 5, v * 5, 3)) * 0.30;
      const k = 0.90 + h(u, v) * 0.14;
      c[0] = THREE.MathUtils.lerp(base.r, base.r * 0.34, chip) * k * (1 - dirt * 0.24);
      c[1] = THREE.MathUtils.lerp(base.g, base.g * 0.32, chip) * k * (1 - dirt * 0.28);
      c[2] = THREE.MathUtils.lerp(base.b, base.b * 0.30, chip) * k * (1 - dirt * 0.34);
    },
  });
}

/** Galvanised structural steel: posts, gantries, fence rails, tool racks. */
export function galvMaterial() {
  const n = new Noise(8842);
  const h = (u: number, v: number) => n.fbm2(u * 40, v * 40, 3) * 0.5 + 0.5;
  return pbr('town_galv', {
    tint: 0x9aa0a4, rough: 0.5, metal: 0.85, size: 256, normalScale: 0.6, height: h,
    albedo: (u: number, v: number, c: any, base: any) => {
      const spangle = THREE.MathUtils.smoothstep(n.worley2(u * 16, v * 16).f1, 0.05, 0.5);
      const k = 0.74 + h(u, v) * 0.3 + spangle * 0.18;
      const rust = Math.pow(Math.max(0, n.fbm2(u * 7 + 11, v * 7, 3)), 2.2) * 1.4;
      c[0] = base.r * k * (1 + rust * 1.1);
      c[1] = base.g * k * (1 + rust * 0.24);
      c[2] = base.b * k * (1 - rust * 0.36);
    },
    roughAt: (u: any, v: any) => 0.36 + h(u, v) * 0.4,
  });
}

/** Heavily oxidised iron for drums, scrap and the parts yard. */
export function scrapMaterial(tint = 0x8a5432) {
  const n = new Noise(1177);
  const h = (u: number, v: number) => (n.fbm2(u * 20, v * 20, 4) * 0.5 + 0.5) * 0.6 + n.worley2(u * 11, v * 11).f1 * 0.4;
  return pbr(`town_scrap${tint}`, {
    tint, rough: 0.86, metal: 0.42, size: 256, normalScale: 1.6, height: h,
    albedo: (u: number, v: number, c: any, base: any) => {
      const r = n.fbm2(u * 6, v * 6, 4) * 0.5 + 0.5;
      const k = 0.5 + h(u, v) * 0.8;
      const rust = THREE.MathUtils.smoothstep(r, 0.3, 0.72);
      c[0] = THREE.MathUtils.lerp(0.26, base.r * 1.4, rust) * k;
      c[1] = THREE.MathUtils.lerp(0.27, base.g, rust) * k;
      c[2] = THREE.MathUtils.lerp(0.28, base.b * 0.8, rust) * k;
    },
    roughAt: (u: any, v: any) => 0.55 + h(u, v) * 0.42,
  });
}

/** Tyre rubber — stacks, wheels, the mat outside the diner. */
export function rubberMaterial() {
  const n = new Noise(9021);
  const h = (u: number, v: number) => {
    const tread = Math.abs(Math.sin(v * Math.PI * 2 * 14 + Math.sin(u * 9) * 0.9));
    return tread * 0.5 + (n.fbm2(u * 30, v * 30, 3) * 0.5 + 0.5) * 0.5;
  };
  return pbr('town_rubber', {
    tint: 0x191a1c, rough: 0.95, size: 256, normalScale: 1.4, height: h,
    albedo: (u: number, v: number, c: any, base: any) => {
      const k = 0.7 + h(u, v) * 0.6;
      const dust = Math.max(0, n.fbm2(u * 8, v * 8, 3)) * 0.4;
      c[0] = base.r * k + dust * 0.10;
      c[1] = base.g * k + dust * 0.08;
      c[2] = base.b * k + dust * 0.06;
    },
  });
}

/**
 * Vehicle and caravan glazing: opaque, dark, mirror-flat.
 *
 * Deliberately *not* the diner's transparent glass — a caravan window you can
 * see through shows the inside of an empty box, and a windscreen you can see
 * through shows the tarmac on the far side of the car.
 */
export function darkGlassMaterial() {
  return memo('town_glass_dark', () => {
    const m = new THREE.MeshStandardMaterial({
      color: 0x0e1418, roughness: 0.07, metalness: 0.15, envMapIntensity: 1.8,
      emissive: 0x141a20, emissiveIntensity: 0.35,
    });
    m.name = 'town_glass_dark';
    return m;
  });
}

/** Diner glass and windscreens. */
export function glassMaterial(tint = 0x141c22) {
  return memo(`town_glass${tint}`, () => {
    // Actually transparent. An opaque dark pane reads as a painted panel from
    // outside no matter how it is shaded — and the whole point of the Crow's
    // Nest frontage is that you can see Takka behind the counter through it.
    // `depthWrite: false` keeps the panes from occluding each other.
    const m = new THREE.MeshStandardMaterial({
      color: tint, roughness: 0.045, metalness: 0.0, envMapIntensity: 2.4,
      transparent: true, opacity: 0.34, depthWrite: false,
      emissive: 0x1c2229, emissiveIntensity: 0.4,
    });
    m.name = 'town_glass';
    return m;
  });
}

/** Self-lit accent. Callers ramp `emissiveIntensity` with time of day. */
export function lampMaterial(color = 0xffe6b4, base = 0x14120e) {
  return memo(`town_lamp${color}${base}`, () => {
    const m = new THREE.MeshStandardMaterial({
      color: base, emissive: color, emissiveIntensity: 0.4, roughness: 0.5, metalness: 0,
    });
    m.name = 'town_lamp';
    return m;
  });
}

/* ------------------------------------------------------------------ signage */

/**
 * Draw text scaled down until it fits. Fixed sizes overrun and the sign ends
 * up reading "MMERHE" — the same trap the highway signs already fell into.
 */
function fit(ctx: any, text: string, s: number, maxFrac: number, px0: number, y: number, { weight = 700, family = 'sans-serif', track = 0 } = {}) {
  let px = Math.round(s * px0);
  const set = () => { ctx.font = `${weight} ${px}px ${family}`; };
  set();
  const width = (t: string) => ctx.measureText(t).width + track * px * (t.length - 1);
  while (px > 6 && width(text) > s * maxFrac) { px -= 1; set(); }
  if (!track) { ctx.fillText(text, s * 0.5, y); return px; }
  // manual letter-spacing so the wide FFXV signage tracking survives
  const total = width(text);
  let x = s * 0.5 - total / 2;
  ctx.save();
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + track * px;
  }
  ctx.restore();
  return px;
}

/** Speckled grime pass, so no sign face is ever flat. */
function grime(ctx: any, s: number, seed = 4, strength = 0.16) {
  const n = new Noise(seed);
  const img = ctx.getImageData(0, 0, s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const g = n.fbm2(x / s * 7, y / s * 7, 4) * 0.5 + 0.5;
      const k = 1 - strength * (1 - g) - strength * 0.4 * (y / s);
      const i = (y * s + x) * 4;
      img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * The HAMMERHEAD pylon face: cream ground, a red band, black slab lettering and
 * the shark-fin mark. The real thing is a squat backlit box on a single pole,
 * visible from a kilometre in either direction.
 */
export function hammerheadSignTexture() {
  return memo('sign_hammerhead', () => canvasTexture(512, (ctx: any, s: number) => {
    ctx.fillStyle = '#e6dcc2'; ctx.fillRect(0, 0, s, s);
    // red header band
    ctx.fillStyle = '#a8291d'; ctx.fillRect(0, 0, s, s * 0.30);
    ctx.fillStyle = '#1c1a18'; ctx.fillRect(0, s * 0.30, s, s * 0.022);
    // shark fin mark in the band
    ctx.fillStyle = '#f0e6cc';
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.05);
    ctx.quadraticCurveTo(s * 0.60, s * 0.14, s * 0.70, s * 0.245);
    ctx.lineTo(s * 0.30, s * 0.245);
    ctx.quadraticCurveTo(s * 0.42, s * 0.16, s * 0.5, s * 0.05);
    ctx.closePath(); ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#141210';
    fit(ctx, 'HAMMERHEAD', s, 0.90, 0.155, s * 0.505, { weight: 800, track: 0.02 });
    ctx.fillStyle = '#8c2a1e';
    fit(ctx, 'GAS · GARAGE · GRUB', s, 0.84, 0.072, s * 0.635, { weight: 600, track: 0.08 });
    ctx.fillStyle = '#3a352c';
    fit(ctx, 'CID SOPHIAR, PROP.', s, 0.70, 0.052, s * 0.735, { weight: 500, track: 0.10 });
    // fuel price plate at the foot
    ctx.fillStyle = '#1a1c20'; ctx.fillRect(s * 0.16, s * 0.79, s * 0.68, s * 0.15);
    ctx.fillStyle = '#ffb03a';
    fit(ctx, 'REG  148', s, 0.52, 0.098, s * 0.895, { weight: 700, track: 0.05 });
    ctx.strokeStyle = '#1c1a18'; ctx.lineWidth = s * 0.014;
    ctx.strokeRect(s * 0.008, s * 0.008, s * 0.984, s * 0.984);
    grime(ctx, s, 4, 0.18);
  }));
}

/** The Crow's Nest diner fascia — FFXV's roadside diner chain. */
export function crowsNestSignTexture() {
  return memo('sign_crowsnest', () => canvasTexture(512, (ctx: any, s: number) => {
    ctx.fillStyle = '#1d2228'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#e8dcbe';
    ctx.fillRect(s * 0.03, s * 0.06, s * 0.94, s * 0.88);
    // crow silhouette
    ctx.fillStyle = '#1a1714';
    ctx.beginPath();
    ctx.moveTo(s * 0.20, s * 0.44);
    ctx.quadraticCurveTo(s * 0.26, s * 0.26, s * 0.40, s * 0.30);
    ctx.quadraticCurveTo(s * 0.50, s * 0.32, s * 0.52, s * 0.40);
    ctx.lineTo(s * 0.60, s * 0.38);
    ctx.lineTo(s * 0.53, s * 0.45);
    ctx.quadraticCurveTo(s * 0.46, s * 0.56, s * 0.28, s * 0.53);
    ctx.closePath(); ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#141210';
    fit(ctx, "THE CROW'S NEST", s, 0.86, 0.115, s * 0.71, { weight: 800, track: 0.015 });
    ctx.fillStyle = '#9c3a24';
    fit(ctx, 'DINER', s, 0.60, 0.088, s * 0.855, { weight: 700, track: 0.30 });
    grime(ctx, s, 12, 0.20);
  }));
}

/** Garage fascia lettering. */
export function garageSignTexture() {
  return memo('sign_garage', () => canvasTexture(512, (ctx: any, s: number) => {
    ctx.fillStyle = '#2a2c30'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#c8bda0';
    ctx.textAlign = 'center';
    fit(ctx, 'SOPHIAR', s, 0.86, 0.20, s * 0.44, { weight: 800, track: 0.06 });
    ctx.fillStyle = '#8fa4b4';
    fit(ctx, 'AUTOMOTIVE  ·  REPAIRS', s, 0.90, 0.072, s * 0.63, { weight: 600, track: 0.06 });
    ctx.strokeStyle = 'rgba(200,189,160,.5)'; ctx.lineWidth = s * 0.008;
    ctx.beginPath(); ctx.moveTo(s * 0.12, s * 0.72); ctx.lineTo(s * 0.88, s * 0.72); ctx.stroke();
    ctx.fillStyle = '#7d8894';
    fit(ctx, 'EST. M.E. 736', s, 0.5, 0.052, s * 0.84, { weight: 500, track: 0.14 });
    grime(ctx, s, 21, 0.26);
  }));
}

/** The hunt board: cork, pinned bounty sheets, a hunter-rank ladder. */
export function huntBoardTexture() {
  return memo('sign_hunts', () => canvasTexture(512, (ctx: any, s: number) => {
    // cork
    const n = new Noise(5150);
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const g = n.fbm2(x / s * 40, y / s * 40, 4) * 0.5 + 0.5;
        const b = n.worley2(x / s * 22, y / s * 22).f1;
        const k = 0.55 + g * 0.4 + b * 0.2;
        const i = (y * s + x) * 4;
        img.data[i] = 150 * k; img.data[i + 1] = 112 * k; img.data[i + 2] = 66 * k; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // header plate
    ctx.fillStyle = '#1e2126'; ctx.fillRect(s * 0.04, s * 0.03, s * 0.92, s * 0.15);
    ctx.fillStyle = '#e2d8bc'; ctx.textAlign = 'center';
    fit(ctx, 'BOUNTY  BOARD', s, 0.82, 0.088, s * 0.128, { weight: 700, track: 0.10 });
    // pinned sheets at slight angles
    const sheets = [
      [0.07, 0.24, 0.40, 0.30, -0.05], [0.53, 0.22, 0.40, 0.33, 0.04],
      [0.10, 0.60, 0.36, 0.30, 0.03], [0.55, 0.60, 0.36, 0.28, -0.06],
    ];
    for (let i = 0; i < sheets.length; i++) {
      const [x, y, w, h, rot] = sheets[i];
      ctx.save();
      ctx.translate(s * (x + w / 2), s * (y + h / 2));
      ctx.rotate(rot);
      ctx.fillStyle = 'rgba(0,0,0,.30)';
      ctx.fillRect(-s * w / 2 + s * 0.008, -s * h / 2 + s * 0.010, s * w, s * h);
      ctx.fillStyle = i % 2 ? '#ddd2b4' : '#e7dcc0';
      ctx.fillRect(-s * w / 2, -s * h / 2, s * w, s * h);
      // headline block + ruled body + star row
      ctx.fillStyle = '#2a2118';
      ctx.fillRect(-s * w / 2 + s * 0.02, -s * h / 2 + s * 0.025, s * w - s * 0.04, s * 0.022);
      ctx.fillStyle = 'rgba(42,33,24,.55)';
      for (let r = 0; r < 5; r++) {
        ctx.fillRect(-s * w / 2 + s * 0.03, -s * h / 2 + s * (0.075 + r * 0.028), s * (w - 0.06) * (0.9 - r * 0.09), s * 0.007);
      }
      ctx.fillStyle = '#b8892c';
      const stars = 1 + (i % 3);
      for (let k = 0; k < stars; k++) {
        ctx.beginPath();
        const cx = -s * w / 2 + s * 0.035 + k * s * 0.036, cy = s * h / 2 - s * 0.045;
        for (let p = 0; p < 10; p++) {
          const a = (p / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = p % 2 ? s * 0.007 : s * 0.016;
          const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
          p === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
      }
      // pin
      ctx.fillStyle = '#9c2f22';
      ctx.beginPath(); ctx.arc(0, -s * h / 2 + s * 0.012, s * 0.012, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    grime(ctx, s, 33, 0.14);
  }));
}

/** Diner menu board hung behind the counter. */
export function menuBoardTexture() {
  return memo('sign_menu', () => canvasTexture(512, (ctx: any, s: number) => {
    ctx.fillStyle = '#161a1d'; ctx.fillRect(0, 0, s, s);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e6dcc0';
    ctx.font = `700 ${Math.round(s * 0.08)}px sans-serif`;
    ctx.fillText("TAKKA'S", s * 0.08, s * 0.14);
    ctx.font = `400 ${Math.round(s * 0.048)}px sans-serif`;
    ctx.fillStyle = '#c9b98e';
    const rows = [
      ['LEIDEN PEPPER STEAK', '380'], ['ANAK RIBS, HOUSE RUB', '420'],
      ['LUCIAN TOMATO STEW', '260'], ['DUALHORN BURGER', '340'],
      ['SAXHAM RICE BOWL', '180'], ['CUP NOODLES', '200'],
      ['BLACK COFFEE', '60'],
    ];
    rows.forEach((r, i) => {
      const y = s * (0.26 + i * 0.098);
      ctx.fillStyle = '#cfc09a';
      ctx.fillText(r[0], s * 0.08, y);
      ctx.fillStyle = '#e0a94a';
      ctx.textAlign = 'right';
      ctx.fillText(r[1], s * 0.92, y);
      ctx.textAlign = 'left';
      ctx.strokeStyle = 'rgba(200,186,150,.16)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(s * 0.08, y + s * 0.022); ctx.lineTo(s * 0.92, y + s * 0.022); ctx.stroke();
    });
    grime(ctx, s, 44, 0.12);
  }));
}

/** Rent-a-Bird chocobo stand — named, never built, exactly the point. */
export function rentABirdTexture() {
  return memo('sign_bird', () => canvasTexture(256, (ctx: any, s: number) => {
    ctx.fillStyle = '#f2c93a'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#2a2418';
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.36, s * 0.20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c93a';
    ctx.beginPath();
    ctx.moveTo(s * 0.42, s * 0.24); ctx.lineTo(s * 0.50, s * 0.10); ctx.lineTo(s * 0.58, s * 0.24);
    ctx.closePath(); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = '#2a2418';
    fit(ctx, 'RENT-A-BIRD', s, 0.9, 0.13, s * 0.72, { weight: 800, track: 0.02 });
    fit(ctx, 'CHOCOBO POST', s, 0.8, 0.062, s * 0.86, { weight: 600, track: 0.10 });
    grime(ctx, s, 55, 0.2);
  }));
}

/** Culless Munitions van livery. */
export function cullessTexture() {
  return memo('sign_culless', () => canvasTexture(256, (ctx: any, s: number) => {
    ctx.fillStyle = '#3b4148'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#c3462c'; ctx.fillRect(0, s * 0.36, s, s * 0.30);
    ctx.textAlign = 'center'; ctx.fillStyle = '#f0e8d6';
    fit(ctx, 'CULLESS', s, 0.86, 0.17, s * 0.56, { weight: 800, track: 0.04 });
    ctx.fillStyle = '#cfd6dc';
    fit(ctx, 'MUNITIONS', s, 0.80, 0.085, s * 0.79, { weight: 600, track: 0.14 });
    grime(ctx, s, 66, 0.24);
  }));
}

/** Chain-link mesh, drawn as an alpha-tested diamond weave. */
export function chainlinkMaterial() {
  return memo('town_chainlink', () => {
    const tex = canvasTexture(256, (ctx: any, s: number) => {
      ctx.clearRect(0, 0, s, s);
      ctx.strokeStyle = '#7c8085';
      ctx.lineWidth = s * 0.030;
      ctx.lineCap = 'round';
      const step = s / 8;
      for (let i = -8; i <= 16; i++) {
        ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step + s, s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i * step, s); ctx.lineTo(i * step + s, 0); ctx.stroke();
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const m = new THREE.MeshStandardMaterial({
      map: tex, transparent: false, alphaTest: 0.14, side: THREE.DoubleSide,
      roughness: 0.78, metalness: 0.30, color: 0x8e8c86,
    });
    m.name = 'town_chainlink';
    return m;
  });
}

/** Wrap a canvas texture into a flat sign material. */
export function signMaterial(key: string, tex: any, { emissive = 0, rough = 0.62, metal = 0.06 } = {}) {
  return memo(`signmat_${key}`, () => {
    const m = new THREE.MeshStandardMaterial({
      map: tex, roughness: rough, metalness: metal, side: THREE.DoubleSide,
      emissive: emissive ? new THREE.Color(0xffffff) : new THREE.Color(0x000000),
      emissiveMap: emissive ? tex : null,
      emissiveIntensity: 0,
    });
    m.name = `sign_${key}`;
    return m;
  });
}
