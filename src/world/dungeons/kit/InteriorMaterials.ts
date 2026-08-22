import * as THREE from 'three';
import { Noise } from '../../../util/Noise.ts';
import { makeTexture, makeDataMap, normalFromHeight, canvasTexture } from '../../../util/TextureGen.ts';

/**
 * Procedural PBR sets for interiors. Everything here is generated at first use
 * and memoised — a dungeon that is never entered costs nothing.
 *
 * Every material carries `vertexColors: true`: the shell builder bakes corner
 * and floor occlusion into the colour attribute, and that is what stops a
 * concrete room from photographing as a flat grey box.
 *
 * Interior materials are *not* excluded from the atmosphere patch. Instead the
 * Dungeons system drives the shared fog uniforms to an interior state on entry,
 * so props, characters and VFX all sit in the same haze as the walls.
 */

const cache = new Map();
function memo(k: any, f: any) {
  if (!cache.has(k)) {
    const m = f();
    m.name = k;
    cache.set(k, m);
  }
  return cache.get(k);
}

const lerp = THREE.MathUtils.lerp;
const ss = THREE.MathUtils.smoothstep;

/** Shared boilerplate: albedo + normal + roughness from one height function. */
function pbr(key: any, {
  tint, height, size = 512, normalStrength = 2.0, rough = [0.7, 0.3], metal = 0,
  metalMap = null, albedo = null, roughness = 0.9, sheen = 0, normalHeight = null,
}: any) {
  return memo(key, () => {
    const base = new THREE.Color().setHex(tint, THREE.NoColorSpace);
    const map = makeTexture(size, (u: any, v: any, c: any) => {
      if (albedo) { albedo(u, v, c, base); return; }
      const k = 0.55 + height(u, v) * 0.8;
      c[0] = base.r * k; c[1] = base.g * k; c[2] = base.b * k;
    }, { repeat: 1 });
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    // The relief and the staining are different fields: a big soft blotch
    // belongs in the albedo and nowhere near the normal, or concrete comes out
    // looking like polished marble.
    const normalMap = normalFromHeight(size, normalHeight || height, normalStrength);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    const roughnessMap = makeDataMap(Math.min(size, 256), (u: any, v: any) => rough[0] + height(u, v) * rough[1]);
    roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
    const opts: THREE.MeshStandardMaterialParameters = {
      color: 0xffffff, map, normalMap, roughnessMap,
      roughness: roughness, metalness: metal, vertexColors: true,
      normalScale: new THREE.Vector2(1.15, 1.15),
    };
    if (metalMap) {
      const mm = makeDataMap(256, metalMap);
      mm.wrapS = mm.wrapT = THREE.RepeatWrapping;
      opts.metalnessMap = mm;
    }
    const m = new THREE.MeshStandardMaterial(opts);
    if (sheen) { m.envMapIntensity = sheen; }
    return m;
  });
}

/* ------------------------------------------------------------------ Keycatrich
 * Imperial-occupied trench: poured concrete with form-board seams, blast
 * scoring, rust weep from the rebar and a cold blue-grey cast.                */

/** Board-marked poured concrete — the trench walls and bunker shells. */
export function trenchConcrete() {
  const n = new Noise(5501);
  const h = (u: any, v: any) => {
    // horizontal shuttering boards every ~0.6 m of a 3 m tile
    const board = Math.abs(((v * 5) % 1) - 0.5);
    const seam = 1 - ss(0.0, 0.055, board);
    const pit = Math.max(0, n.worley2(u * 13, v * 13).f1 - 0.42) * 1.1;
    const grain = n.fbm2(u * 22, v * 22, 3) * 0.5 + 0.5;
    const blotch = n.fbm2(u * 3.4, v * 3.4, 4) * 0.5 + 0.5;
    return grain * 0.14 + blotch * 0.62 - pit * 0.20 - seam * 0.34;
  };
  // relief: the shuttering seams, tie-holes and a fine aggregate grain only
  const hn = (u: any, v: any) => {
    const board = Math.abs(((v * 5) % 1) - 0.5);
    const seam = 1 - ss(0.0, 0.035, board);
    const tie = Math.max(0, 0.26 - n.worley2(u * 5 + 3, v * 5).f1) * 2.4;
    const grain = n.fbm2(u * 70, v * 70, 2) * 0.5 + 0.5;
    return 0.80 + grain * 0.05 - seam * 0.72 - tie * 0.40;
  };
  return pbr('trenchConcrete', {
    tint: 0x77797c, height: h, normalHeight: hn, size: 512, normalStrength: 1.5,
    rough: [0.74, 0.24], roughness: 0.95,
    albedo: (u: any, v: any, c: any, base: any) => {
      const k = 0.5 + h(u, v) * 0.85;
      // rust weep running down from the reinforcement, and soot at the base
      const weep = Math.max(0, n.fbm2(u * 20, v * 2.4 + 3, 3)) * ss(0.15, 0.85, v) * 0.75;
      const soot = ss(0.62, 1.0, v) * 0.45 * (0.4 + 0.6 * (n.fbm2(u * 6, v * 6, 3) * 0.5 + 0.5));
      c[0] = (base.r * k + weep * 0.20) * (1 - soot * 0.72);
      c[1] = (base.g * k + weep * 0.075) * (1 - soot * 0.74);
      c[2] = (base.b * k + weep * 0.02) * (1 - soot * 0.70);
    },
  });
}

/** Trench floor: cracked screed under grit, dust and spall. */
export function trenchFloor() {
  const n = new Noise(7714);
  const h = (u: any, v: any) => {
    const w = n.worley2(u * 3.2, v * 3.2);
    // hairline cracks, not crazy paving: only the thinnest part of the cell
    // boundary counts
    const crack = Math.max(0, 1 - (w.f2 - w.f1) * 34);
    const grit = n.fbm2(u * 70, v * 70, 3) * 0.5 + 0.5;
    return grit * 0.30 + (n.fbm2(u * 5, v * 5, 3) * 0.5 + 0.5) * 0.60 - crack * 0.13;
  };
  const hn = (u: any, v: any) => {
    const w = n.worley2(u * 3.2, v * 3.2);
    const crack = Math.max(0, 1 - (w.f2 - w.f1) * 34);
    return 0.80 + (n.fbm2(u * 60, v * 60, 2) * 0.5 + 0.5) * 0.14 - crack * 0.24;
  };
  return pbr('trenchFloor', {
    tint: 0x66655f, height: h, normalHeight: hn, size: 512, normalStrength: 1.7,
    rough: [0.78, 0.22], roughness: 0.97,
    albedo: (u: any, v: any, c: any, base: any) => {
      const k = 0.5 + h(u, v) * 0.85;
      const dust = ss(0.35, 0.8, n.fbm2(u * 3.4 + 11, v * 3.4 - 7, 4) * 0.5 + 0.5);
      c[0] = lerp(base.r, 0.30, dust) * k;
      c[1] = lerp(base.g, 0.27, dust) * k;
      c[2] = lerp(base.b, 0.22, dust) * k;
    },
  });
}

/** Corroded structural steel: rebar, blast doors, gantries, MT crates. */
export function corrodedSteel(tint = 0x4a4038) {
  const n = new Noise(2244);
  const h = (u: any, v: any) => (n.fbm2(u * 22, v * 22, 4) * 0.5 + 0.5) * 0.55
    + n.worley2(u * 13, v * 13).f1 * 0.45;
  return pbr(`corrodedSteel${tint}`, {
    tint, height: h, size: 256, normalStrength: 1.8, rough: [0.42, 0.5],
    roughness: 0.72, metal: 0.85,
    albedo: (u: any, v: any, c: any, base: any) => {
      const r = n.fbm2(u * 5.5, v * 5.5, 4) * 0.5 + 0.5;
      const rust = ss(0.34, 0.78, r);
      const k = 0.5 + h(u, v) * 0.8;
      c[0] = lerp(0.22, base.r * 2.0, rust) * k;
      c[1] = lerp(0.23, base.g * 1.35, rust) * k;
      c[2] = lerp(0.25, base.b * 0.95, rust) * k;
    },
    metalMap: (u: any, v: any) => 1 - ss(0.30, 0.72, n.fbm2(u * 5.5, v * 5.5, 4) * 0.5 + 0.5) * 0.9,
  });
}

/** Niflheim magitek plate: cold blue-black iron, machined seams. */
export function magitekPlate() {
  const n = new Noise(6021);
  const h = (u: any, v: any) => {
    const panelU = Math.abs(((u * 4) % 1) - 0.5), panelV = Math.abs(((v * 3) % 1) - 0.5);
    const seam = Math.max(1 - ss(0, 0.04, panelU), 1 - ss(0, 0.045, panelV));
    const rivet = Math.max(0, 0.42 - n.worley2(u * 16, v * 12).f1) * 1.6;
    return 0.55 + (n.fbm2(u * 24, v * 24, 3) * 0.5 + 0.5) * 0.2 - seam * 0.5 + rivet * 0.35;
  };
  return pbr('magitekPlate', {
    tint: 0x2d323a, height: h, size: 256, normalStrength: 1.3,
    rough: [0.40, 0.28], roughness: 0.58, metal: 0.66,
  });
}

/* -------------------------------------------------------------------- Balouve
 * Abandoned mine: dry hewn sandstone-and-shale rock with ore seams, blasted
 * faces, drill scars, coal dust. Warmer and browner than the trench.         */

/** Hewn mine rock, drill-scarred with a faint mineral glitter. */
export function mineRock() {
  const n = new Noise(3390);
  const h = (u: any, v: any) => {
    const w = n.worley2(u * 6.5, v * 6.5);
    const blast = Math.min(1, (w.f2 - w.f1) * 2.2);
    const strata = Math.sin(v * 26 + n.fbm2(u * 2.4, v * 2.4, 3) * 5) * 0.5 + 0.5;
    const grain = n.fbm2(u * 30, v * 30, 4) * 0.5 + 0.5;
    return blast * 0.40 + strata * 0.22 + grain * 0.38;
  };
  return pbr('mineRock', {
    tint: 0x6b5844, height: h, size: 512, normalStrength: 2.1,
    rough: [0.72, 0.28], roughness: 0.96,
    albedo: (u: any, v: any, c: any, base: any) => {
      const k = 0.42 + h(u, v) * 0.9;
      // iron oxide in the strata, coal dust in the low spots
      const iron = Math.max(0, n.fbm2(u * 3.6 + 5, v * 3.6, 3)) * 0.85;
      const dust = ss(0.55, 0.15, h(u, v)) * 0.55;
      c[0] = base.r * k * (1 + iron * 0.55) * (1 - dust * 0.62);
      c[1] = base.g * k * (1 + iron * 0.16) * (1 - dust * 0.64);
      c[2] = base.b * k * (1 - iron * 0.22) * (1 - dust * 0.60);
    },
  });
}

/** Ore seam: dark matrix threaded with metallic veins that catch a lamp. */
export function oreSeam() {
  const n = new Noise(8812);
  const h = (u: any, v: any) => {
    const vein = Math.abs(n.fbm2(u * 5, v * 12, 4));
    return 0.35 + (1 - ss(0.0, 0.18, vein)) * 0.65;
  };
  return pbr('oreSeam', {
    tint: 0x3a3630, height: h, size: 256, normalStrength: 1.2,
    rough: [0.50, 0.34], roughness: 0.78, metal: 0.38,
    albedo: (u: any, v: any, c: any, base: any) => {
      const vein = 1 - ss(0.0, 0.16, Math.abs(n.fbm2(u * 5, v * 12, 4)));
      const k = 0.34 + h(u, v) * 0.38;
      c[0] = lerp(base.r * k, 0.26, vein);
      c[1] = lerp(base.g * k, 0.22, vein);
      c[2] = lerp(base.b * k, 0.16, vein);
    },
    metalMap: (u: any, v: any) => 0.15 + (1 - ss(0.0, 0.16, Math.abs(n.fbm2(u * 5, v * 12, 4)))) * 0.85,
  });
}

/** Pit-prop timber: rough-sawn, split, black with age and damp. */
export function pitTimber() {
  const n = new Noise(1717);
  const h = (u: any, v: any) => {
    const grain = Math.sin(v * 150 + n.fbm2(u * 2.5, v * 8, 3) * 11) * 0.5 + 0.5;
    const split = 1 - ss(0.0, 0.06, Math.abs(((u * 3.1) % 1) - 0.5));
    return grain * 0.5 + (n.fbm2(u * 9, v * 34, 3) * 0.5 + 0.5) * 0.42 - split * 0.35;
  };
  return pbr('pitTimber', {
    tint: 0x4a3b2a, height: h, size: 256, normalStrength: 2.2,
    rough: [0.8, 0.2], roughness: 0.98,
    albedo: (u: any, v: any, c: any, base: any) => {
      const k = 0.48 + h(u, v) * 0.85;
      const rot = ss(0.4, 0.85, n.fbm2(u * 4, v * 4, 3) * 0.5 + 0.5) * 0.6;
      c[0] = lerp(base.r, 0.10, rot) * k;
      c[1] = lerp(base.g, 0.10, rot) * k;
      c[2] = lerp(base.b, 0.09, rot) * k;
    },
  });
}

/** Polished-topped rail steel and cart ironwork. */
export function railSteel() {
  const n = new Noise(4141);
  const h = (u: any, v: any) => (n.fbm2(u * 30, v * 8, 3) * 0.5 + 0.5) * 0.6 + n.worley2(u * 20, v * 6).f1 * 0.4;
  return pbr('railSteel', {
    tint: 0x5a4a3c, height: h, size: 256, normalStrength: 1.2,
    rough: [0.3, 0.42], roughness: 0.5, metal: 0.92,
    albedo: (u: any, v: any, c: any, base: any) => {
      // the running surface is worn bright; the web and foot are scale-brown
      const worn = 1 - ss(0.30, 0.46, Math.abs(v - 0.5));
      const k = 0.5 + h(u, v) * 0.7;
      c[0] = lerp(base.r * k, 0.60, worn * 0.8);
      c[1] = lerp(base.g * k, 0.61, worn * 0.8);
      c[2] = lerp(base.b * k, 0.63, worn * 0.8);
    },
  });
}

/* ------------------------------------------------------------------- Fociaugh
 * Natural limestone cave: wet, flowstone-banded, cool grey with algal green
 * where the bioluminescence touches it.                                      */

/** Wet flowstone — the cave shell. Dark, banded and glossy where water runs. */
export function wetLimestone() {
  const n = new Noise(9003);
  const h = (u: any, v: any) => {
    const w = n.worley2(u * 4.5, v * 4.5);
    const cell = Math.min(1, (w.f2 - w.f1) * 1.9);
    const flow = Math.sin(v * 14 + n.fbm2(u * 2, v * 2, 4) * 7) * 0.5 + 0.5;
    const grain = n.fbm2(u * 26, v * 26, 4) * 0.5 + 0.5;
    return cell * 0.34 + flow * 0.3 + grain * 0.36;
  };
  return pbr('wetLimestone', {
    tint: 0x5c6062, height: h, size: 512, normalStrength: 2.0,
    rough: [0.46, 0.32], roughness: 0.80, sheen: 0.6,
    albedo: (u: any, v: any, c: any, base: any) => {
      const k = 0.36 + h(u, v) * 0.82;
      const wet = ss(0.35, 0.85, n.fbm2(u * 3, v * 5.5, 4) * 0.5 + 0.5);
      const algae = Math.max(0, n.fbm2(u * 7 + 21, v * 7 - 4, 3)) * 0.5;
      c[0] = base.r * k * (1 - wet * 0.42) * (1 - algae * 0.30);
      c[1] = base.g * k * (1 - wet * 0.34) * (1 + algae * 0.22);
      c[2] = base.b * k * (1 - wet * 0.24) * (1 - algae * 0.10);
    },
  });
}

/** Silt and gravel floor of a cave, damp and dark. */
export function caveSilt() {
  const n = new Noise(5533);
  const h = (u: any, v: any) => {
    const peb = Math.max(0, 0.36 - n.worley2(u * 9, v * 9).f1) * 2.2;
    const drift = n.fbm2(u * 2.6, v * 2.6, 4) * 0.5 + 0.5;
    return drift * 0.52 + (n.fbm2(u * 26, v * 26, 3) * 0.5 + 0.5) * 0.20 + peb * 0.28;
  };
  return pbr('caveSilt', {
    tint: 0x494339, height: h, size: 512, normalStrength: 1.3,
    rough: [0.60, 0.3], roughness: 0.88, sheen: 0.5,
  });
}

/** Dripstone: stalactites, columns and rimstone. Paler, chalky, banded. */
export function dripstone() {
  const n = new Noise(6677);
  const h = (u: any, v: any) => {
    const band = Math.sin(v * 40 + n.fbm2(u * 3, v * 3, 3) * 4) * 0.5 + 0.5;
    return band * 0.4 + (n.fbm2(u * 18, v * 18, 3) * 0.5 + 0.5) * 0.6;
  };
  return pbr('dripstone', {
    tint: 0x7d7568, height: h, size: 256, normalStrength: 2.0,
    rough: [0.3, 0.42], roughness: 0.66, sheen: 1.4,
  });
}

/* ------------------------------------------------------------------- shared */

/** Self-lit accent. Emissive is left on so the light rig can ramp it. */
export function emissiveMaterial(color = 0xffb066, intensity = 3.0, base = 0x090b0d) {
  return memo(`emis${color}${intensity}`, () => new THREE.MeshStandardMaterial({
    color: base, emissive: color, emissiveIntensity: intensity,
    roughness: 0.45, metalness: 0, vertexColors: false,
  }));
}

/**
 * Additive, camera-facing glow card. One draw call covers every lamp halo in a
 * dungeon; this is what actually reads as "there is air in here".
 */
export function glowCardMaterial(texture: any) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uFade: { value: 1.0 },
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aCentre;
      attribute vec3 aColor;
      attribute vec2 aParams;   // x = radius, y = flicker phase
      varying vec2 vUv;
      varying vec3 vCol;
      uniform float uTime;
      void main() {
        vUv = uv;
        float flick = 0.80 + 0.20 * sin(uTime * (5.5 + aParams.y * 4.0) + aParams.y * 31.0)
                            * sin(uTime * 2.3 + aParams.y * 11.0);
        vCol = aColor * flick;
        vec4 mv = modelViewMatrix * vec4(aCentre, 1.0);
        mv.xy += position.xy * aParams.x;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uMap;
      uniform float uFade;
      varying vec2 vUv;
      varying vec3 vCol;
      void main() {
        float a = texture2D(uMap, vUv).a;
        gl_FragColor = vec4(vCol * a * uFade, a);
      }
    `,
  });
}

/**
 * A light shaft / lamp cone. Renders as a soft additive volume that fades at
 * grazing angles, so it reads as air rather than as a cone of plastic.
 */
export function shaftMaterial(color = 0xffc27a, strength = 0.5) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vT;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vT = uv.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec3 uColor;
      uniform float uStrength;
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vT;
      void main() {
        vec3 v = normalize(cameraPosition - vWorld);
        // brightest edge-on: a real shaft is thickest where you look along it
        float graze = 1.0 - abs(dot(v, normalize(vNormalW)));
        float a = pow(graze, 2.2) * smoothstep(1.0, 0.05, vT) * uStrength;
        a *= 0.86 + 0.14 * sin(uTime * 0.7 + vWorld.x * 0.3);
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
  });
}

/**
 * Absolute black. Unlit on purpose: this is the plate that sits behind a cave
 * mouth or an adit so the opening reads as a hole rather than as a dark wall,
 * and any amount of sun on it destroys that.
 */
export function voidMaterial() {
  return memo('void', () => new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
}

/** Still, black interior water — mine sumps and cave pools. */
export function poolMaterial(tint = 0x0a1416) {
  return memo(`pool${tint}`, () => {
    const n = new Noise(4321);
    const h = (u: any, v: any) => n.fbm2(u * 8, v * 8, 4) * 0.5 + 0.5;
    const normalMap = normalFromHeight(256, h, 0.35);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({
      color: tint, normalMap, roughness: 0.06, metalness: 0.1,
      envMapIntensity: 2.0, vertexColors: false,
      normalScale: new THREE.Vector2(0.5, 0.5),
    });
  });
}

/** Painted hazard plate — imperial signage and stencilled bay numbers. */
export function stencilTexture(text = '04', bg = '#20242a', fg = '#c8b23a') {
  return memo(`stencil${text}`, () => canvasTexture(128, (ctx: any, s: any) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = fg; ctx.lineWidth = s * 0.03;
    ctx.strokeRect(s * 0.1, s * 0.1, s * 0.8, s * 0.8);
    ctx.fillStyle = fg;
    ctx.font = `bold ${Math.round(s * 0.4)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(text, s * 0.5, s * 0.62);
  }));
}

/** Soft round falloff used for glow cards, motes and haze. */
export function glowSprite(size = 128, power = 2.2) {
  return memo(`glowsprite${size}${power}`, () => {
    const data = new Uint8Array(size * size * 4);
    const half = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - half + 0.5, y - half + 0.5) / half;
        const a = Math.pow(Math.max(0, 1 - d), power);
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 255;
        data[i + 3] = Math.max(0, Math.min(255, a * 255)) | 0;
      }
    }
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    // memo() stamps .name, which a texture also accepts
    return t;
  });
}

/** Free every generated texture. Only used when a dungeon is torn down. */
export function disposeInteriorMaterials() {
  for (const m of cache.values()) {
    if (m.dispose) m.dispose();
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
      if (m[k] && m[k].dispose) m[k].dispose();
    }
  }
  cache.clear();
}
