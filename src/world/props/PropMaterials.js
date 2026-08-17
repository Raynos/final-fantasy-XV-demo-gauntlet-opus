import * as THREE from 'three';
import { Noise } from '../../util/Noise.js';
import { makeTexture, makeDataMap, normalFromHeight, canvasTexture, srgb } from '../../util/TextureGen.js';
import { alphaTex } from '../veg/VegTextures.js';

/**
 * Procedural PBR sets shared by every prop, so a shack, an obelisk and a
 * boulder all agree on what stone, rust and painted metal look like.
 */

const cache = new Map();
function memo(k, f) { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); }

/**
 * Cracked, weather-bitten stone.
 *
 * @param {number} tint base albedo
 * @param {number} rough roughness
 * @param {boolean} [instanceTint] whether the mesh supplies a per-vertex or
 *   per-instance colour. `Rocks` bakes AO-ish shading into vertex colours and
 *   needs this on; anything merged through `PartBuilder` must have it off —
 *   the builder strips every attribute but position/normal/uv, and a material
 *   asking for a colour attribute that is not there renders solid black.
 */
export function rockMaterial(tint = 0x8a7461, rough = 0.94, instanceTint = true) {
  return memo(`rock${tint}${rough}${instanceTint}`, () => {
    const n = new Noise(6161);
    const h = (u, v) => {
      const w = n.worley2(u * 7, v * 7);
      const crack = Math.min(1, (w.f2 - w.f1) * 2.6);
      const grain = n.fbm2(u * 22, v * 22, 4) * 0.5 + 0.5;
      const big = n.fbm2(u * 4, v * 4, 3) * 0.5 + 0.5;
      return crack * 0.42 + grain * 0.25 + big * 0.33;
    };
    const base = new THREE.Color().setHex(tint, THREE.NoColorSpace);
    const map = makeTexture(512, (u, v, c) => {
      // Keep the contrast but pull the mean down: sunlit stone at 0.5+ albedo
      // burns out to white paper under the tone map, which is what made the
      // scree runs read as popcorn instead of rock.
      const k = 0.42 + h(u, v) * 0.72;
      const iron = Math.max(0, n.fbm2(u * 3 + 17, v * 3 - 5, 3)) * 0.5;
      c[0] = base.r * k * (1 + iron * 0.5);
      c[1] = base.g * k * (1 + iron * 0.12);
      c[2] = base.b * k * (1 - iron * 0.25);
    }, { repeat: 1 });
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const normalMap = normalFromHeight(512, h, 3.2);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    const roughnessMap = makeDataMap(256, (u, v) => 0.72 + h(u, v) * 0.28);
    roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({
      color: 0xffffff, map, normalMap, roughnessMap, roughness: rough, metalness: 0,
      normalScale: new THREE.Vector2(1.1, 1.1), vertexColors: instanceTint,
    });
  });
}

/** Sun-bleached, splintered timber. */
export function woodMaterial(tint = 0x7a6449) {
  return memo(`wood${tint}`, () => {
    const n = new Noise(3131);
    const h = (u, v) => {
      const grain = Math.sin(v * 130 + n.fbm2(u * 3, v * 9, 3) * 9) * 0.5 + 0.5;
      return grain * 0.55 + (n.fbm2(u * 12, v * 40, 3) * 0.5 + 0.5) * 0.45;
    };
    const base = new THREE.Color().setHex(tint, THREE.NoColorSpace);
    const map = makeTexture(256, (u, v, c) => {
      const k = 0.62 + h(u, v) * 0.62;
      c[0] = base.r * k; c[1] = base.g * k; c[2] = base.b * k;
    });
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const normalMap = normalFromHeight(256, h, 1.6);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({
      color: 0xffffff, map, normalMap, roughness: 0.93, metalness: 0,
    });
  });
}

/** Rusted, dented corrugated steel. */
export function rustMaterial(tint = 0x8a5b3c, metal = 0.55) {
  return memo(`rust${tint}${metal}`, () => {
    const n = new Noise(9090);
    const h = (u, v) => (n.fbm2(u * 16, v * 16, 4) * 0.5 + 0.5) * 0.6
      + (n.worley2(u * 9, v * 9).f1) * 0.4;
    const base = new THREE.Color().setHex(tint, THREE.NoColorSpace);
    const map = makeTexture(256, (u, v, c) => {
      const r = n.fbm2(u * 5, v * 5, 4) * 0.5 + 0.5;
      const k = 0.55 + h(u, v) * 0.7;
      const rust = THREE.MathUtils.smoothstep(r, 0.35, 0.75);
      c[0] = THREE.MathUtils.lerp(0.30, base.r * 1.35, rust) * k;
      c[1] = THREE.MathUtils.lerp(0.31, base.g, rust) * k;
      c[2] = THREE.MathUtils.lerp(0.32, base.b * 0.8, rust) * k;
    });
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const normalMap = normalFromHeight(256, h, 1.5);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    const roughnessMap = makeDataMap(256, (u, v) => {
      const r = n.fbm2(u * 5, v * 5, 4) * 0.5 + 0.5;
      return 0.45 + THREE.MathUtils.smoothstep(r, 0.35, 0.75) * 0.5;
    });
    roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
    const metalnessMap = makeDataMap(256, (u, v) => {
      const r = n.fbm2(u * 5, v * 5, 4) * 0.5 + 0.5;
      return 1 - THREE.MathUtils.smoothstep(r, 0.3, 0.7) * 0.85;
    });
    metalnessMap.wrapS = metalnessMap.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({
      color: 0xffffff, map, normalMap, roughnessMap, metalnessMap,
      roughness: 0.8, metalness: metal,
    });
  });
}

/** Weathered canvas for the haven tent. */
export function canvasClothMaterial(tint = 0x2f3a44) {
  return memo(`cloth${tint}`, () => {
    const n = new Noise(1212);
    const h = (u, v) => (Math.sin(u * 420) * 0.5 + 0.5) * 0.35 + (Math.sin(v * 420) * 0.5 + 0.5) * 0.35
      + (n.fbm2(u * 8, v * 8, 3) * 0.5 + 0.5) * 0.3;
    const base = new THREE.Color().setHex(tint, THREE.NoColorSpace);
    const map = makeTexture(256, (u, v, c) => {
      const k = 0.72 + h(u, v) * 0.5;
      c[0] = base.r * k; c[1] = base.g * k; c[2] = base.b * k;
    });
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const normalMap = normalFromHeight(256, h, 0.9);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({
      color: 0xffffff, map, normalMap, roughness: 0.86, metalness: 0,
      side: THREE.DoubleSide,
    });
  });
}

/** Glowing haven runes — additive blue sigils on the camp rock. */
export function runeTexture() {
  return memo('runes', () => alphaTex(512, (ctx, s) => {
    ctx.strokeStyle = '#9fdcff';
    ctx.lineWidth = s * 0.008;
    ctx.globalAlpha = 0.95;
    const cx = s * 0.5, cy = s * 0.5;
    const ring = (r, dash) => {
      ctx.save();
      ctx.setLineDash(dash);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    };
    ring(s * 0.42, []);
    ring(s * 0.395, [s * 0.05, s * 0.03]);
    ring(s * 0.3, [s * 0.02, s * 0.06]);
    ring(s * 0.14, []);
    // radiating glyph spokes
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * s * 0.16, cy + Math.sin(a) * s * 0.16);
      ctx.lineTo(cx + Math.cos(a) * s * 0.29, cy + Math.sin(a) * s * 0.29);
      ctx.stroke();
      if (i % 3 === 0) {
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * s * 0.31, cy + Math.sin(a) * s * 0.31);
        ctx.lineTo(cx + Math.cos(a + 0.11) * s * 0.39, cy + Math.sin(a + 0.11) * s * 0.39);
        ctx.lineTo(cx + Math.cos(a - 0.11) * s * 0.39, cy + Math.sin(a - 0.11) * s * 0.39);
        ctx.closePath(); ctx.stroke();
      }
    }
    // inner sigil
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * s * 0.11, y = cy + Math.sin(a) * s * 0.11;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
  }));
}

/** Highway sign face. */
export function signTexture(kind = 0) {
  return memo(`sign${kind}`, () => canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = kind === 0 ? '#25402c' : '#6d6a58';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#d8dcd2';
    ctx.lineWidth = s * 0.018;
    ctx.strokeRect(s * 0.06, s * 0.06, s * 0.88, s * 0.88);
    ctx.fillStyle = '#e6eae2';
    ctx.textAlign = 'center';
    // fitted rather than fixed: 'HAMMERHEAD' at 0.15em overruns the plate and
    // the sign ends up reading 'MMERHE'
    const fit = (text, size, y) => {
      let px = Math.round(s * size);
      ctx.font = `${px}px sans-serif`;
      while (px > 8 && ctx.measureText(text).width > s * 0.82) {
        px -= 1;
        ctx.font = `${px}px sans-serif`;
      }
      ctx.fillText(text, s * 0.5, y);
    };
    if (kind === 0) {
      fit('HAMMERHEAD', 0.15, s * 0.34);
      fit('42 km', 0.11, s * 0.52);
      fit('LEIDE  ROUTE 1', 0.11, s * 0.74);
    } else {
      fit('CAUTION', 0.15, s * 0.4);
      fit('DAEMONS AFTER DARK', 0.1, s * 0.6);
    }
  }));
}

/** Poured concrete: barriers, culverts, plinths, imperial blockades. */
export function concreteMaterial(tint = 0x9a968c, rough = 0.92) {
  return memo(`conc${tint}${rough}`, () => {
    const n = new Noise(4747);
    const h = (u, v) => {
      const pit = Math.max(0, n.worley2(u * 26, v * 26).f1 - 0.32) * 1.4;
      const grain = n.fbm2(u * 40, v * 40, 3) * 0.5 + 0.5;
      const stain = n.fbm2(u * 5, v * 5, 3) * 0.5 + 0.5;
      return grain * 0.34 + stain * 0.5 - pit * 0.3;
    };
    const base = new THREE.Color().setHex(tint, THREE.NoColorSpace);
    const map = makeTexture(256, (u, v, c) => {
      const k = 0.66 + h(u, v) * 0.7;
      // rust weep and grime running down from the top
      const weep = Math.max(0, n.fbm2(u * 14, v * 2.2, 3)) * (1 - v) * 0.5;
      c[0] = base.r * k * (1 + weep * 0.5);
      c[1] = base.g * k * (1 - weep * 0.1);
      c[2] = base.b * k * (1 - weep * 0.35);
    });
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const normalMap = normalFromHeight(256, h, 1.1);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({
      color: 0xffffff, map, normalMap, roughness: rough, metalness: 0,
    });
  });
}

/** Chipped enamel over steel — guardrail, signage backs, imperial plate. */
export function paintedMaterial(tint = 0xb9bcbd, rough = 0.5, metal = 0.55) {
  return memo(`paint${tint}${rough}${metal}`, () => {
    const n = new Noise(8123);
    const h = (u, v) => n.fbm2(u * 30, v * 30, 3) * 0.5 + 0.5;
    const base = new THREE.Color().setHex(tint, THREE.NoColorSpace);
    const map = makeTexture(256, (u, v, c) => {
      const chip = THREE.MathUtils.smoothstep(n.fbm2(u * 11 + 5, v * 11 - 3, 4) * 0.5 + 0.5, 0.62, 0.86);
      const k = 0.82 + h(u, v) * 0.24;
      c[0] = THREE.MathUtils.lerp(base.r, 0.20, chip) * k;
      c[1] = THREE.MathUtils.lerp(base.g, 0.13, chip) * k;
      c[2] = THREE.MathUtils.lerp(base.b, 0.10, chip) * k;
    });
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const normalMap = normalFromHeight(256, h, 0.5);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({
      color: 0xffffff, map, normalMap, roughness: rough, metalness: metal,
    });
  });
}

/** Niflheim magitek plate: cold blue-black iron with hot seams. */
export function magitekMaterial(tint = 0x2b2f36) {
  return memo(`magitek${tint}`, () => {
    const n = new Noise(3355);
    const h = (u, v) => {
      const panel = Math.min(1, Math.abs(Math.sin(u * 34)) * 0.5 + Math.abs(Math.sin(v * 21)) * 0.5);
      return panel * 0.55 + (n.fbm2(u * 20, v * 20, 3) * 0.5 + 0.5) * 0.45;
    };
    const base = new THREE.Color().setHex(tint, THREE.NoColorSpace);
    const map = makeTexture(256, (u, v, c) => {
      const k = 0.7 + h(u, v) * 0.5;
      const grime = n.fbm2(u * 6, v * 6, 3) * 0.5 + 0.5;
      c[0] = base.r * k * (0.86 + grime * 0.4);
      c[1] = base.g * k * (0.9 + grime * 0.3);
      c[2] = base.b * k * (0.94 + grime * 0.2);
    });
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const normalMap = normalFromHeight(256, h, 1.3);
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({
      color: 0xffffff, map, normalMap, roughness: 0.44, metalness: 0.8,
    });
  });
}

/**
 * Self-lit accent (running lights, rune glow, lantern glass). Emissive is left
 * on the material so callers can ramp it with time of day.
 */
export function glowMaterial(color = 0x9fdcff, intensity = 2.4, base = 0x0a0e12) {
  return new THREE.MeshStandardMaterial({
    color: base, emissive: color, emissiveIntensity: intensity,
    roughness: 0.4, metalness: 0,
  });
}

/**
 * Soft round puff, used for smoke columns, dust and midges.
 *
 * Deliberately a plain CanvasTexture rather than `alphaTex`: the alpha-mip
 * builder in VegTextures erodes coverage below its alphaTest reference, which
 * is right for foliage cards and fatal for a soft gradient — the puff simply
 * vanishes at the first mip.
 */
export function puffTexture() {
  return memo('puff', () => {
    const t = canvasTexture(128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.98)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.62)');
      g.addColorStop(0.75, 'rgba(255,255,255,0.18)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Tapered flame tongue for the campfire billboards. */
export function flameTexture() {
  return memo('flame', () => canvasTexture(128, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const n = new Noise(9931);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / s, v = y / s;
        // v=0 is the top of the canvas -> tip of the flame
        const t = 1 - v;
        const wid = 0.5 * Math.pow(t, 0.55) * (1 - t * 0.15);
        const d = Math.abs(u - 0.5) / Math.max(wid, 1e-3);
        let a = Math.max(0, 1 - d * d);
        a *= 0.55 + 0.45 * (n.fbm2(u * 6, v * 3, 3) * 0.5 + 0.5);
        a *= THREE.MathUtils.smoothstep(t, 0.02, 0.22);
        const heat = THREE.MathUtils.clamp(a * (0.35 + t * 1.5), 0, 1);
        const i = (y * s + x) * 4;
        img.data[i] = 255 * Math.min(1, 0.45 + heat * 1.4);
        img.data[i + 1] = 255 * Math.min(1, heat * 1.05);
        img.data[i + 2] = 255 * Math.min(1, heat * heat * 0.5);
        img.data[i + 3] = 255 * Math.min(1, a * 1.35);
      }
    }
    ctx.putImageData(img, 0, 0);
  }));
}

/** A bird in flight, wings swept — one card, seen as a silhouette. */
export function birdTexture() {
  return memo('bird', () => alphaTex(64, (ctx, s) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.46);
    ctx.quadraticCurveTo(s * 0.28, s * 0.30, s * 0.06, s * 0.40);
    ctx.quadraticCurveTo(s * 0.30, s * 0.46, s * 0.44, s * 0.58);
    ctx.lineTo(s * 0.56, s * 0.58);
    ctx.quadraticCurveTo(s * 0.70, s * 0.46, s * 0.94, s * 0.40);
    ctx.quadraticCurveTo(s * 0.72, s * 0.30, s * 0.5, s * 0.46);
    ctx.closePath();
    ctx.fill();
  }));
}

/** Roadside marker faces: distance plates and hazard chevrons. */
export function markerTexture(kind = 0) {
  return memo(`marker${kind}`, () => canvasTexture(128, (ctx, s) => {
    if (kind === 0) {
      ctx.fillStyle = '#d9d3c4'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#20242a';
      ctx.font = `bold ${Math.round(s * 0.42)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('7', s * 0.5, s * 0.62);
    } else {
      ctx.fillStyle = '#1d1f22'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#e0c33a';
      for (let i = -2; i < 5; i++) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(i * s * 0.3, 0);
        ctx.lineTo(i * s * 0.3 + s * 0.16, 0);
        ctx.lineTo(i * s * 0.3 + s * 0.16 - s * 0.4, s);
        ctx.lineTo(i * s * 0.3 - s * 0.4, s);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }));
}

/** Imperial banner / checkpoint plate. */
export function imperialTexture() {
  return memo('imperial', () => canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#1b1f27'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#a5261f'; ctx.lineWidth = s * 0.03;
    ctx.strokeRect(s * 0.1, s * 0.1, s * 0.8, s * 0.8);
    ctx.fillStyle = '#a5261f';
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.2);
    for (let i = 1; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? s * 0.12 : s * 0.3;
      ctx.lineTo(s * 0.5 + Math.cos(a) * r, s * 0.5 + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#cfd4da';
    ctx.font = `${Math.round(s * 0.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('NIFLHEIM', s * 0.5, s * 0.9);
  }));
}

export const PAINT = {
  regaliaBlack: srgb(0x090a0c),
  chrome: srgb(0xd8dde3),
  glass: srgb(0x10161c),
};
