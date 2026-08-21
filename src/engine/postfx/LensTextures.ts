import * as THREE from 'three';
import { Rng } from '../../util/Rng.ts';

/**
 * Procedural lens imperfections. No binary assets ship with this project, so
 * the dirt/dust layer that modulates the bloom is splatted here at boot from a
 * seeded RNG — smudges, dust specks and a couple of hairline scratches.
 *
 * @returns single-channel (packed RGB) dirt mask
 */
export function lensDirtTexture(size: number = 256, seed: number = 90210): THREE.DataTexture {
  const rng = new Rng(seed);
  const buf = new Float32Array(size * size);

  const splat = (cx: any, cy: any, rx: any, ry: any, ang: any, amp: any, power: any) => {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const rad = Math.ceil(Math.max(rx, ry)) + 2;
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++) {
      if (y < 0 || y >= size) continue;
      for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        if (x < 0 || x >= size) continue;
        const dx = x - cx, dy = y - cy;
        const u = (dx * ca + dy * sa) / rx;
        const v = (-dx * sa + dy * ca) / ry;
        const d = Math.sqrt(u * u + v * v);
        if (d >= 1) continue;
        buf[y * size + x] += amp * Math.pow(1 - d, power);
      }
    }
  };

  // greasy smudges, densest toward the frame edges
  for (let i = 0; i < 70; i++) {
    const cx = rng.range(0, size), cy = rng.range(0, size);
    const r = rng.range(6, 34);
    splat(cx, cy, r, r * rng.range(0.35, 1.0), rng.range(0, Math.PI), rng.range(0.10, 0.45), rng.range(1.4, 3.0));
  }
  // dust
  for (let i = 0; i < 520; i++) {
    const cx = rng.range(0, size), cy = rng.range(0, size);
    const r = rng.range(0.8, 3.4);
    splat(cx, cy, r, r * rng.range(0.6, 1.0), 0, rng.range(0.25, 0.9), rng.range(0.8, 2.0));
  }
  // hairline scratches
  for (let i = 0; i < 5; i++) {
    let x = rng.range(0, size), y = rng.range(0, size);
    const ang = rng.range(0, Math.PI * 2);
    const len = rng.range(30, 140);
    const amp = rng.range(0.15, 0.4);
    for (let t = 0; t < len; t++) {
      x += Math.cos(ang) + rng.range(-0.35, 0.35);
      y += Math.sin(ang) + rng.range(-0.35, 0.35);
      splat(x, y, 1.6, 1.1, ang, amp, 1.2);
    }
  }

  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.min(1, buf[i]);
    const b = Math.round(v * 255);
    data[i * 4] = b; data[i * 4 + 1] = b; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
