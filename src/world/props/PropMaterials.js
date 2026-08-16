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

/** Cracked, weather-bitten stone. */
export function rockMaterial(tint = 0x8a7461, rough = 0.94) {
  return memo(`rock${tint}${rough}`, () => {
    const n = new Noise(6161);
    const h = (u, v) => {
      const w = n.worley2(u * 7, v * 7);
      const crack = Math.min(1, (w.f2 - w.f1) * 2.6);
      const grain = n.fbm2(u * 22, v * 22, 4) * 0.5 + 0.5;
      const big = n.fbm2(u * 4, v * 4, 3) * 0.5 + 0.5;
      return crack * 0.42 + grain * 0.25 + big * 0.33;
    };
    const base = new THREE.Color().setHex(tint, THREE.SRGBColorSpace);
    const map = makeTexture(512, (u, v, c) => {
      const k = 0.5 + h(u, v) * 0.85;
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
      normalScale: new THREE.Vector2(1.1, 1.1), vertexColors: true,
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
    const base = new THREE.Color().setHex(tint, THREE.SRGBColorSpace);
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
    const base = new THREE.Color().setHex(tint, THREE.SRGBColorSpace);
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
    const base = new THREE.Color().setHex(tint, THREE.SRGBColorSpace);
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
    ctx.font = `${Math.round(s * 0.15)}px sans-serif`;
    ctx.textAlign = 'center';
    if (kind === 0) {
      ctx.fillText('HAMMERHEAD', s * 0.5, s * 0.34);
      ctx.font = `${Math.round(s * 0.11)}px sans-serif`;
      ctx.fillText('42 km', s * 0.5, s * 0.52);
      ctx.fillText('LEIDE  ROUTE 1', s * 0.5, s * 0.74);
    } else {
      ctx.fillText('CAUTION', s * 0.5, s * 0.4);
      ctx.font = `${Math.round(s * 0.1)}px sans-serif`;
      ctx.fillText('DAEMONS AFTER DARK', s * 0.5, s * 0.6);
    }
  }));
}

export const PAINT = {
  regaliaBlack: srgb(0x090a0c),
  chrome: srgb(0xd8dde3),
  glass: srgb(0x10161c),
};
