import * as THREE from 'three';
import { Rng } from '../../util/Rng.ts';
import { Noise } from '../../util/Noise.ts';
import { PartBuilder } from './PartBuilder.ts';
import {
  rockMaterial, woodMaterial, rustMaterial, canvasClothMaterial,
  runeTexture, signTexture, glowMaterial, flameTexture,
} from './PropMaterials.ts';

/**
 * FFXV-flavoured structures: a haven, ruined pylons, an abandoned outpost,
 * telegraph poles carrying sagging wire along the road, signage, a dead truck
 * and fence runs. Everything is baked into world space and merged per material
 * so the whole set of landmarks costs under a dozen draw calls.
 */

const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

function mat4(pos, rot = [0, 0, 0], scale = [1, 1, 1]) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]), _q,
    new THREE.Vector3(scale[0], scale[1], scale[2])
  );
}

/** Corrugated sheet: a plane rippled along its width. */
function corrugated(w, h, pitch = 0.16, amp = 0.028) {
  const segs = Math.max(8, Math.round(w / pitch) * 2);
  const g = new THREE.PlaneGeometry(w, h, segs, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setZ(i, Math.sin((p.getX(i) / pitch) * Math.PI) * amp);
  }
  g.computeVertexNormals();
  return g;
}

/** Lumpy stone block, used for rubble, camp rocks and pylon debris. */
function block(seed, w, h, d, rough = 0.16) {
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const n = new Noise(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = n.fbm3(x * 1.3, y * 1.3, z * 1.3, 3) * rough;
    p.setXYZ(i, x * (1 + k), y * (1 + k * 0.7), z * (1 + k));
  }
  g.computeVertexNormals();
  return g;
}

export class Landmarks {
  constructor(eco, scene) {
    this.eco = eco;
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'landmarks';
    this.lights = [];
  }

  build() {
    const eco = this.eco;
    this.mats = {
      rock: rockMaterial(0x8d7663, 0.93, false),
      pale: rockMaterial(0x9c8d78, 0.9, false),
      wood: woodMaterial(0x7d674c),
      dark: woodMaterial(0x4a3d30),
      rust: Object.assign(rustMaterial(0x8f5c39, 0.5), { side: THREE.DoubleSide }),
      steel: new THREE.MeshStandardMaterial({ color: 0x6a6d72, roughness: 0.55, metalness: 0.85 }),
      cloth: canvasClothMaterial(0x36414c),
      ceramic: new THREE.MeshStandardMaterial({ color: 0xd8d4c6, roughness: 0.35, metalness: 0 }),
      wire: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.7, metalness: 0.4 }),
      ember: new THREE.MeshStandardMaterial({
        color: 0x2a1208, emissive: 0xff5a12, emissiveIntensity: 3.2, roughness: 0.85,
      }),
      rune: new THREE.MeshBasicMaterial({
        map: runeTexture(), transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0.85, side: THREE.DoubleSide,
      }),
      glyph: glowMaterial(0x86cfff, 1.6, 0x243038),
      lantern: glowMaterial(0xffbe72, 2.0, 0x271a0c),
      flame: new THREE.MeshBasicMaterial({
        map: flameTexture(), transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, opacity: 0.95, toneMapped: true,
      }),
      signA: new THREE.MeshStandardMaterial({ map: signTexture(0), roughness: 0.62, metalness: 0.1, side: THREE.DoubleSide }),
      signB: new THREE.MeshStandardMaterial({ map: signTexture(1), roughness: 0.62, metalness: 0.1, side: THREE.DoubleSide }),
    };
    this.mats.rock.name = 'rock';
    this.mats.wood.name = 'wood';

    const B = new PartBuilder();
    this.B = B;

    for (const s of eco.sites) {
      if (s.type === 'haven') this._haven(B, s);
      else if (s.type === 'obelisk') this._obelisk(B, s);
      else if (s.type === 'shack') this._shack(B, s);
      else if (s.type === 'truck') this._truck(B, s);
      else if (s.type === 'sign') this._sign(B, s);
    }
    this._telegraph(B);
    this._fences(B);

    B.build(this.root, { cast: true, receive: true, name: 'landmark' });
    this.scene.add(this.root);
  }

  // ------------------------------------------------------------------ haven

  _haven(B, site) {
    const eco = this.eco, M = this.mats;
    const rng = new Rng(9182);
    const cx = site.x, cz = site.z;
    // level the camp on the lowest ground it touches
    let base = Infinity;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      base = Math.min(base, eco.height(cx + Math.cos(a) * 9.2, cz + Math.sin(a) * 9.2));
    }
    base = Math.min(base, eco.height(cx, cz));
    // A haven is a rock, not a paving slab: it stands proud of the scrub so it
    // reads as a place at a hundred metres and in silhouette at dusk.
    //
    // Scale is against a 1.8 m character. Four of them plus a tent, an awning,
    // a kitchen and a fire need something like a twenty-metre shelf; at the
    // old 13 m it read as a tabletop diorama with toys on it.
    const top = base + 2.35;

    // the haven rock: a stepped, canted plinth
    B.add(M.pale, block(5511, 19.6, 2.6, 16.6, 0.09), mat4([cx, base + 0.25, cz], [0, 0.22, 0]));
    B.add(M.pale, block(5512, 17.8, 2.1, 14.8, 0.07), mat4([cx + 0.3, base + 1.65, cz - 0.2], [0, 0.30, 0]));
    // skirt of broken rock so it isn't a table floating on grass
    for (let i = 0; i < 26; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = 8.2 + rng.range(0, 3.4);
      const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d;
      const s = rng.range(0.7, 2.6);
      B.add(M.rock, block(600 + i, s * 1.6, s, s * 1.4, 0.3),
        mat4([px, eco.height(px, pz) - s * 0.24, pz], [rng.gauss(0, 0.3), rng.next() * 3, rng.gauss(0, 0.3)]));
    }
    // a flight of steps up onto the rock
    for (let i = 0; i < 4; i++) {
      B.add(M.pale, block(5520 + i, 3.2 - i * 0.22, 0.5, 2.0, 0.12),
        mat4([cx + 7.9 + i * 1.15, base + 1.8 - i * 0.52, cz + 4.8], [0, 0.22, 0]));
    }

    // Runes: the flat sigil on the deck plus glyph bands cut into the rock
    // face, which is what actually reads from a distance at dusk.
    const rune = new THREE.PlaneGeometry(15.2, 13.4);
    rune.rotateX(-Math.PI / 2);
    const runeMesh = new THREE.Mesh(rune, M.rune);
    runeMesh.position.set(cx + 0.2, top + 0.03, cz - 0.15);
    runeMesh.rotation.y = 0.30;
    runeMesh.castShadow = false;
    runeMesh.receiveShadow = false;
    runeMesh.renderOrder = 3;
    this.root.add(runeMesh);
    this.runeMesh = runeMesh;

    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const rx = 9.3, rz = 7.9;
      const px = cx + Math.cos(a + 0.3) * rx, pz = cz + Math.sin(a + 0.3) * rz;
      B.add(M.glyph, new THREE.BoxGeometry(0.14, 0.62 + (i % 3) * 0.4, 0.14),
        mat4([px, base + 1.25 + (i % 2) * 0.42, pz], [0, a, 0]));
    }
    // dashed sill line: broken into glyph groups so it reads as carving rather
    // than as a strip light glued to the rock
    for (let i = 0; i < 11; i++) {
      const t = (i / 10 - 0.5) * 17.4;
      const w = i % 3 === 0 ? 1.4 : 0.7;
      for (const sz of [-7.6, 7.2]) {
        B.add(M.glyph, new THREE.BoxGeometry(w, 0.1, 0.1),
          mat4([cx + 0.3 + Math.cos(0.30) * t, base + 2.66, cz + sz - Math.sin(0.30) * t], [0, 0.30, 0]));
      }
    }

    // ------------------------------------------------------------ firepit
    const fx = cx + 3.0, fz = cz - 1.9;
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2 + rng.gauss(0, 0.1);
      const r = 1.25 + rng.gauss(0, 0.07);
      B.add(M.rock, block(300 + i, 0.56, 0.5, 0.46, 0.35),
        mat4([fx + Math.cos(a) * r, top + 0.16, fz + Math.sin(a) * r],
          [rng.gauss(0, 0.2), rng.next() * 3, rng.gauss(0, 0.2)]));
    }
    const log = new THREE.CylinderGeometry(0.13, 0.17, 1.8, 7);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      B.add(M.dark, log, mat4([fx + Math.cos(a) * 0.26, top + 0.5, fz + Math.sin(a) * 0.26],
        [Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95]));
    }
    B.add(M.ember, new THREE.SphereGeometry(0.56, 12, 8),
      mat4([fx, top + 0.16, fz], [0, 0, 0], [1, 0.45, 1]));

    // flame: three crossed cards, scaled and swayed per frame
    const flames = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const q = new THREE.PlaneGeometry(1.65, 2.5);
      q.translate(0, 1.25, 0);
      const m = new THREE.Mesh(q, M.flame);
      m.rotation.y = (i / 3) * Math.PI;
      m.renderOrder = 5;
      flames.add(m);
    }
    flames.position.set(fx, top + 0.18, fz);
    this.root.add(flames);
    this.flames = flames;

    // an awning over the fire on two poles, so the camp has a roofline in
    // silhouette and the firelight has something to bounce off
    // A person has to be able to stand under this: 3.5 m poles, 8 m of cloth.
    for (const [px, pz] of [[fx - 3.8, fz - 3.2], [fx + 3.5, fz - 3.4], [fx - 3.8, fz + 2.9], [fx + 3.5, fz + 2.7]]) {
      B.add(M.steel, new THREE.CylinderGeometry(0.055, 0.07, 3.5, 6), mat4([px, top + 1.75, pz]));
      // guy line out to a peg on the deck
      const dx = Math.sign(px - fx), dz = Math.sign(pz - fz);
      B.add(M.wire, new THREE.CylinderGeometry(0.012, 0.012, 2.4, 4),
        mat4([px + dx * 0.7, top + 1.9, pz + dz * 0.6], [dz * 0.5, 0, -dx * 0.62]));
    }
    // Canopy as a shallow hip, not a flat sheet: four panels falling away from
    // a ridge, so it catches the firelight differently on each face and reads
    // as fabric under tension rather than a floating blue rectangle.
    {
      const AW = 4.0, AD = 3.3, RISE = 0.55, EAVE = 3.45;
      const cxx = fx - 0.15, czz = fz - 0.3, cy = top + EAVE;
      const corner = [[-AW, -AD], [AW, -AD], [AW, AD], [-AW, AD]];
      const pos = [], uv = [], idx = [];
      pos.push(cxx, cy + RISE, czz); uv.push(0.5, 0.5);
      for (const [dx, dz] of corner) {
        pos.push(cxx + dx, cy - 0.12, czz + dz);
        uv.push(dx > 0 ? 1 : 0, dz > 0 ? 1 : 0);
      }
      for (let i = 0; i < 4; i++) idx.push(0, 1 + i, 1 + ((i + 1) % 4));
      const cn = new THREE.BufferGeometry();
      cn.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      cn.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      cn.setIndex(idx);
      cn.computeVertexNormals();
      B.add(M.cloth, cn);
      // valance hanging off the two long eaves
      for (const sz of [-1, 1]) {
        B.add(M.cloth, new THREE.PlaneGeometry(AW * 2, 0.34),
          mat4([cxx, cy - 0.28, czz + sz * AD], [0, sz > 0 ? 0 : Math.PI, 0]));
      }
    }

    // a spit and a hanging pot over the coals — Ignis is cooking
    for (const s of [-1, 1]) {
      B.add(M.steel, new THREE.CylinderGeometry(0.035, 0.04, 2.5, 5),
        mat4([fx + s * 1.25, top + 1.1, fz], [0, 0, s * 0.22]));
    }
    B.add(M.steel, new THREE.CylinderGeometry(0.03, 0.03, 2.7, 5),
      mat4([fx, top + 2.25, fz], [0, 0, Math.PI / 2]));
    B.add(M.steel, new THREE.CylinderGeometry(0.42, 0.34, 0.52, 12), mat4([fx, top + 1.55, fz]));
    B.add(M.steel, new THREE.TorusGeometry(0.37, 0.024, 4, 12), mat4([fx, top + 1.85, fz], [Math.PI / 2, 0, 0]));

    const fire = new THREE.PointLight(0xff7a26, 9, 46, 2);
    fire.position.set(fx, top + 0.9, fz);
    fire.castShadow = false;
    this.root.add(fire);
    this.lights.push({ light: fire, kind: 'fire', base: 130 });
    // a wide, soft bounce so the whole rock reads as lit, not just the ring
    const glow = new THREE.PointLight(0xff9a4a, 0, 22, 1.4);
    glow.position.set(cx, top + 2.6, cz);
    glow.castShadow = false;
    this.root.add(glow);
    this.lights.push({ light: glow, kind: 'fire', base: 34 });

    // ---------------------------------------------------- Ignis's kitchen
    const kx = cx - 1.2, kz = cz - 5.4;
    B.add(M.steel, new THREE.BoxGeometry(2.0, 0.07, 0.9), mat4([kx, top + 0.78, kz], [0, 0.18, 0]));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        B.add(M.steel, new THREE.CylinderGeometry(0.022, 0.022, 0.78, 5),
          mat4([kx + sx * 0.85, top + 0.39, kz + sz * 0.34], [sx * 0.1, 0, sz * 0.08]));
      }
    }
    B.add(M.dark, new THREE.BoxGeometry(0.6, 0.22, 0.42), mat4([kx - 0.5, top + 0.92, kz], [0, 0.18, 0]));
    B.add(M.steel, new THREE.CylinderGeometry(0.16, 0.14, 0.2, 10), mat4([kx - 0.5, top + 1.12, kz]));
    B.add(M.wood, new THREE.BoxGeometry(0.5, 0.04, 0.34), mat4([kx + 0.5, top + 0.84, kz], [0, 0.4, 0]));
    B.add(M.steel, new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), mat4([kx + 0.9, top + 0.9, kz - 0.2], [0.2, 0, 0.5]));
    B.add(M.wood, new THREE.BoxGeometry(0.72, 0.52, 0.6), mat4([kx - 1.5, top + 0.26, kz - 0.3], [0, -0.2, 0]));
    B.add(M.wood, new THREE.BoxGeometry(0.64, 0.46, 0.54), mat4([kx - 1.4, top + 0.74, kz - 0.25], [0, 0.35, 0]));

    // ------------------------------------------------------------ lanterns
    const lanternAt = (lx, lz, poleH) => {
      if (poleH > 0) {
        B.add(M.steel, new THREE.CylinderGeometry(0.03, 0.04, poleH, 6), mat4([lx, top + poleH / 2, lz]));
        B.add(M.steel, new THREE.BoxGeometry(0.34, 0.03, 0.03), mat4([lx + 0.15, top + poleH, lz]));
      }
      const y = top + (poleH > 0 ? poleH - 0.28 : 0.2);
      const gx = poleH > 0 ? lx + 0.3 : lx;
      B.add(M.steel, new THREE.CylinderGeometry(0.11, 0.13, 0.08, 8), mat4([gx, y + 0.2, lz]));
      B.add(M.lantern, new THREE.CylinderGeometry(0.1, 0.12, 0.26, 8), mat4([gx, y + 0.04, lz]));
      B.add(M.steel, new THREE.CylinderGeometry(0.12, 0.09, 0.07, 8), mat4([gx, y - 0.13, lz]));
      const l = new THREE.PointLight(0xffca7a, 0, 16, 2);
      l.position.set(gx, y + 0.04, lz);
      this.root.add(l);
      this.lights.push({ light: l, kind: 'lantern', base: 14 });
    };
    lanternAt(cx + 7.4, cz + 3.6, 3.1);
    lanternAt(cx - 6.6, cz - 4.4, 3.1);
    lanternAt(cx + 1.4, cz + 5.0, 0);

    // packs and bedrolls
    for (let i = 0; i < 5; i++) {
      const a = 1.3 + i * 0.7;
      B.add(M.cloth, new THREE.CapsuleGeometry(0.26, 0.56, 4, 8),
        mat4([cx - 1.2 + Math.cos(a) * 1.6, top + 0.28, cz + 4.4 + Math.sin(a) * 1.2],
          [Math.PI / 2, a, 0]));
    }

    // Tent: a four-man expedition A-frame, 5.4 m long and 2.35 m to the ridge,
    // so a 1.8 m character can stand up inside the door.
    const tx = cx - 4.8, tz = cz + 1.6;
    const TL = 5.4, TH = 2.35, TW = 1.32;
    const panel = new THREE.PlaneGeometry(TL, Math.hypot(TH, TW) + 0.1);
    const slope = Math.atan2(TW, TH);
    B.add(M.cloth, panel, mat4([tx, top + TH * 0.5, tz + TW * 0.5], [0, 0, 0])
      .multiply(new THREE.Matrix4().makeRotationX(-(Math.PI / 2 - slope))));
    B.add(M.cloth, panel, mat4([tx, top + TH * 0.5, tz - TW * 0.5], [0, 0, 0])
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 - slope)));
    const gable = new THREE.BufferGeometry();
    gable.setAttribute('position', new THREE.Float32BufferAttribute(
      [-TW, 0, 0, TW, 0, 0, 0, TH, 0], 3));
    gable.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    gable.computeVertexNormals();
    B.add(M.cloth, gable, mat4([tx + TL / 2, top, tz], [0, Math.PI / 2, 0]));
    B.add(M.cloth, gable, mat4([tx - TL / 2, top, tz], [0, Math.PI / 2, 0]));
    // ridge pole plus the two uprights holding it
    B.add(M.steel, new THREE.CylinderGeometry(0.035, 0.035, TL + 0.5, 6),
      mat4([tx, top + TH, tz], [0, 0, Math.PI / 2]));
    const pole = new THREE.CylinderGeometry(0.04, 0.04, TH, 6);
    B.add(M.steel, pole, mat4([tx + TL / 2, top + TH / 2, tz]));
    B.add(M.steel, pole, mat4([tx - TL / 2, top + TH / 2, tz]));
    const guy = new THREE.CylinderGeometry(0.01, 0.01, 2.4, 4);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        B.add(M.wire, guy, mat4([tx + sx * (TL / 2 + 0.85), top + 0.65, tz + sz * 0.85],
          [sz * 0.55, 0, -sx * 0.72]));
      }
    }
    // Door flap rolled back at one gable, a ground sheet under it and a sill
    // pole along each eave — without these the tent is a blank white wedge.
    B.add(M.dark, gable, mat4([tx - TL / 2 + 0.02, top, tz], [0, Math.PI / 2, 0], [0.72, 0.86, 1]));
    B.add(M.cloth, new THREE.CylinderGeometry(0.14, 0.11, 1.5, 6),
      mat4([tx - TL / 2 + 0.06, top + 1.5, tz + 0.5], [0, 0, 0.3]));
    B.add(M.dark, new THREE.BoxGeometry(TL + 0.2, 0.06, TW * 2 + 0.3), mat4([tx, top + 0.05, tz]));
    for (const sz of [-1, 1]) {
      B.add(M.steel, new THREE.CylinderGeometry(0.03, 0.03, TL + 0.2, 5),
        mat4([tx, top + 0.09, tz + sz * TW], [0, 0, Math.PI / 2]));
    }

    // two camp chairs + a cooler, angled at the fire
    for (let i = 0; i < 3; i++) {
      const a = -1.1 + i * 1.15;
      const px = fx + Math.cos(a) * 2.7, pz = fz + Math.sin(a) * 2.7;
      const yaw = Math.atan2(fx - px, fz - pz);
      B.add(M.cloth, new THREE.BoxGeometry(0.6, 0.06, 0.58), mat4([px, top + 0.44, pz], [0, yaw, 0]));
      B.add(M.cloth, new THREE.BoxGeometry(0.6, 0.6, 0.06), mat4([px, top + 0.72, pz], [0.28, yaw, 0])
        .multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.28)));
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          B.add(M.steel, new THREE.CylinderGeometry(0.018, 0.018, 0.46, 5),
            mat4([px + sx * 0.26, top + 0.22, pz + sz * 0.24], [0, yaw, 0]));
        }
      }
    }
    B.add(M.steel, new THREE.BoxGeometry(0.86, 0.5, 0.56), mat4([cx - 0.8, top + 0.25, cz - 3.4], [0, 0.4, 0]));
    B.add(M.wood, new THREE.BoxGeometry(0.68, 0.55, 0.68), mat4([cx + 4.4, top + 0.28, cz + 2.8], [0, -0.3, 0]));
    this.havenTop = top;
  }

  // ---------------------------------------------------------------- obelisk

  _obelisk(B, site) {
    const M = this.mats, eco = this.eco;
    const rng = new Rng(1300 + Math.round(site.x));
    const h = site.tall || 20;
    const y = eco.height(site.x, site.z);
    // stepped plinth
    B.add(M.pale, block(880, 7.4, 1.1, 7.4, 0.06), mat4([site.x, y + 0.2, site.z], [0, 0.3, 0]));
    B.add(M.pale, block(881, 5.4, 0.9, 5.4, 0.06), mat4([site.x, y + 1.1, site.z], [0, 0.1, 0]));
    // tapered shaft, snapped off at the top
    const segs = 7;
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const sh = h / segs;
      const w = 2.6 * (1 - t * 0.55);
      const lean = t * t * 0.06;
      B.add(M.pale, block(890 + i, w, sh * 1.02, w, 0.05),
        mat4([site.x + lean * h * 0.2, y + 1.55 + sh * (i + 0.5), site.z],
          [0, 0.14 * i, lean]));
    }
    // broken crown
    B.add(M.pale, block(899, 1.9, 1.3, 1.6, 0.35),
      mat4([site.x + 0.28, y + 1.55 + h + 0.4, site.z + 0.1], [0.14, 0.7, -0.2]));
    // fallen debris
    for (let i = 0; i < 9; i++) {
      const a = rng.next() * Math.PI * 2, d = 4 + rng.range(0, 7);
      const px = site.x + Math.cos(a) * d, pz = site.z + Math.sin(a) * d;
      const s = rng.range(0.6, 2.2);
      B.add(M.pale, block(910 + i, s * 1.5, s * 0.8, s, 0.2),
        mat4([px, eco.height(px, pz) - s * 0.2, pz],
          [rng.gauss(0, 0.4), rng.next() * 3, rng.gauss(0, 0.4)]));
    }
  }

  // ------------------------------------------------------------------ shack

  _shack(B, site) {
    const M = this.mats, eco = this.eco;
    const rng = new Rng(2077);
    const cx = site.x, cz = site.z;
    let base = Infinity;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      base = Math.min(base, eco.height(cx + Math.cos(a) * 3.4, cz + Math.sin(a) * 3.4));
    }
    const yaw = -0.35;
    const W = 5.4, D = 4.2, H = 2.9;
    const T = (p, r = [0, 0, 0], s) => {
      const m = mat4([0, 0, 0], [0, yaw, 0]);
      return m.multiply(mat4(p, r, s));
    };
    const world = mat4([cx, base, cz]);
    const put = (mat, geo, p, r, s) => B.add(mat, geo, world.clone().multiply(T(p, r, s)));

    // stumpy foundation piers
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      put(M.rock, block(1200, 0.5, 0.5, 0.5, 0.3), [sx * (W / 2 - 0.3), 0.12, sz * (D / 2 - 0.3)]);
    }
    // floor + frame
    put(M.wood, new THREE.BoxGeometry(W, 0.16, D), [0, 0.3, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      put(M.wood, new THREE.BoxGeometry(0.14, H, 0.14), [sx * (W / 2 - 0.1), 0.38 + H / 2, sz * (D / 2 - 0.1)]);
    }
    // corrugated walls
    const wallL = corrugated(W, H);
    const wallS = corrugated(D, H);
    put(M.rust, wallL, [0, 0.38 + H / 2, -D / 2], [0, 0, 0]);
    put(M.rust, wallS, [-W / 2, 0.38 + H / 2, 0], [0, Math.PI / 2, 0]);
    put(M.rust, wallS, [W / 2, 0.38 + H / 2, 0], [0, -Math.PI / 2, 0]);
    // front wall with a doorway gap: two narrow panels
    put(M.rust, corrugated(1.8, H), [-1.7, 0.38 + H / 2, D / 2], [0, Math.PI, 0]);
    put(M.rust, corrugated(2.2, H), [1.5, 0.38 + H / 2, D / 2], [0, Math.PI, 0]);
    put(M.rust, corrugated(1.6, 0.8), [-0.3, 0.38 + H - 0.4, D / 2], [0, Math.PI, 0]);
    put(M.wood, new THREE.BoxGeometry(0.12, 2.2, 0.14), [-1.1, 0.38 + 1.1, D / 2]);
    put(M.wood, new THREE.BoxGeometry(0.12, 2.2, 0.14), [0.5, 0.38 + 1.1, D / 2]);
    // pitched roof
    const roof = corrugated(W + 0.6, D * 0.62, 0.2, 0.035);
    put(M.rust, roof, [0, 0.38 + H + 0.5, -D * 0.28], [-Math.PI / 2 + 0.42, 0, 0]);
    put(M.rust, roof, [0, 0.38 + H + 0.5, D * 0.28], [-Math.PI / 2 - 0.42, 0, 0]);
    put(M.wood, new THREE.BoxGeometry(W + 0.7, 0.1, 0.12), [0, 0.38 + H + 1.03, 0]);
    // lean-to porch
    for (const sx of [-1, 1]) {
      put(M.wood, new THREE.BoxGeometry(0.12, 2.4, 0.12), [sx * 2.2, 0.38 + 1.2, D / 2 + 1.7]);
    }
    put(M.rust, corrugated(W, 2.0, 0.2, 0.03), [0, 0.38 + 2.62, D / 2 + 0.95], [-Math.PI / 2 + 0.16, 0, 0]);

    // clutter: barrels, crates, a leaning plank
    for (let i = 0; i < 4; i++) {
      const a = rng.next() * Math.PI * 2, d = 3.6 + rng.range(0, 2.4);
      const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d;
      const gy = eco.height(px, pz);
      if (i % 2 === 0) {
        B.add(M.rust, new THREE.CylinderGeometry(0.31, 0.31, 0.9, 14),
          mat4([px, gy + 0.44, pz], [rng.gauss(0, 0.05), rng.next() * 3, rng.gauss(0, 0.05)]));
      } else {
        B.add(M.wood, new THREE.BoxGeometry(0.7, 0.55, 0.62),
          mat4([px, gy + 0.28, pz], [0, rng.next() * 3, 0]));
      }
    }
    B.add(M.wood, new THREE.BoxGeometry(0.25, 2.6, 0.05),
      mat4([cx + 2.9, base + 1.1, cz + 1.2], [0.25, 0.6, 0.45]));
  }

  // ------------------------------------------------------------------ truck

  _truck(B, site) {
    const M = this.mats, eco = this.eco;
    const y = eco.height(site.x, site.z);
    const world = mat4([site.x, y, site.z], [0, site.yaw || 0, 0.03]);
    const put = (mat, geo, p, r, s) => B.add(mat, geo, world.clone().multiply(mat4(p, r, s)));

    // chassis + flatbed
    put(M.rust, new THREE.BoxGeometry(5.4, 0.22, 2.0), [0, 0.72, 0]);
    put(M.rust, new THREE.BoxGeometry(2.9, 0.5, 2.06), [-1.2, 1.05, 0]);
    for (const sz of [-1, 1]) {
      put(M.wood, new THREE.BoxGeometry(2.9, 0.6, 0.08), [-1.2, 1.4, sz * 1.0]);
    }
    put(M.wood, new THREE.BoxGeometry(0.08, 0.6, 2.0), [-2.62, 1.4, 0]);
    // cab
    put(M.rust, new THREE.BoxGeometry(1.9, 1.35, 1.95), [1.35, 1.42, 0]);
    put(M.steel, new THREE.BoxGeometry(0.06, 0.72, 1.7), [2.28, 1.72, 0], [0, 0, -0.22]);
    for (const sz of [-1, 1]) {
      put(M.steel, new THREE.BoxGeometry(1.2, 0.62, 0.05), [1.3, 1.75, sz * 0.98]);
    }
    // bonnet, grille, one light smashed
    put(M.rust, new THREE.BoxGeometry(1.35, 0.62, 1.75), [2.85, 1.2, 0]);
    put(M.steel, new THREE.BoxGeometry(0.1, 0.5, 1.5), [3.5, 1.1, 0]);
    put(M.steel, new THREE.CylinderGeometry(0.08, 0.08, 2.0, 10), [3.5, 0.75, 0], [Math.PI / 2, 0, 0]);
    // wheels — one is off and lying flat
    const tyre = new THREE.CylinderGeometry(0.52, 0.52, 0.34, 16);
    tyre.rotateX(Math.PI / 2);
    const wheels = [[1.7, 1], [1.7, -1], [-1.5, 1]];
    for (const [ax, sz] of wheels) {
      put(M.dark, tyre, [ax, 0.55, sz * 0.98]);
      put(M.steel, new THREE.CylinderGeometry(0.24, 0.24, 0.36, 12), [ax, 0.55, sz * 0.98], [Math.PI / 2, 0, 0]);
    }
    put(M.dark, tyre, [-1.9, 0.19, -2.1], [Math.PI / 2, 0.4, 0]);
    // axle stub where the wheel came off
    put(M.steel, new THREE.CylinderGeometry(0.09, 0.09, 0.4, 8), [-1.5, 0.5, -0.98], [Math.PI / 2, 0, 0]);
  }

  // ------------------------------------------------------------------- sign

  _sign(B, site) {
    const M = this.mats, eco = this.eco;
    const z = site.roadZ, side = site.side;
    const p = eco.roadPoint(z, side, 6.2, _v.clone());
    const t = eco.roadTangent(z);
    const yaw = Math.atan2(t.x, t.y) + (side > 0 ? Math.PI : 0);
    const world = mat4([p.x, p.y, p.z], [0, yaw, 0]);
    const put = (mat, geo, pp, r, s) => B.add(mat, geo, world.clone().multiply(mat4(pp, r, s)));
    const kind = z > 0 ? M.signA : M.signB;
    put(M.steel, new THREE.CylinderGeometry(0.065, 0.075, 3.5, 8), [-0.9, 1.75, 0]);
    put(M.steel, new THREE.CylinderGeometry(0.065, 0.075, 3.5, 8), [0.9, 1.75, 0]);
    put(M.steel, new THREE.BoxGeometry(2.5, 1.7, 0.06), [0, 2.7, 0]);
    // faced both ways: a highway sign is read by traffic in both directions,
    // and the camera does not always stand on the side we guessed
    put(kind, new THREE.PlaneGeometry(2.4, 1.6), [0, 2.7, 0.045]);
    put(kind, new THREE.PlaneGeometry(2.4, 1.6), [0, 2.7, -0.045], [0, Math.PI, 0]);
  }

  // -------------------------------------------------------------- telegraph

  _telegraph(B) {
    const M = this.mats, eco = this.eco;
    const rng = new Rng(4004);
    const step = 34;
    const from = -430, to = 430;
    const tops = [];
    for (let z = from; z <= to; z += step) {
      // Stand them further off the shoulder than before: at 9.5 m the run sat
      // right behind the roadside tree in the highway framing and the whole
      // line read as wire with nothing holding it up.
      const p = eco.roadPoint(z, 1, 13.5, new THREE.Vector3());
      const lean = rng.gauss(0, 0.035);
      // Taller and heavier than before: these are the only vertical elements
      // between the road and the mesa, and at 7 m in a dark silhouette against
      // dark rock they simply vanished. At 9 m they carry the perspective.
      const h = 9.0 + rng.range(0, 1.3);
      const yaw = rng.gauss(0, 0.25);
      const world = mat4([p.x, p.y - 0.4, p.z], [lean, yaw, rng.gauss(0, 0.03)]);
      B.add(M.wood, new THREE.CylinderGeometry(0.15, 0.23, h, 8),
        world.clone().multiply(mat4([0, h / 2, 0])));
      B.add(M.wood, new THREE.BoxGeometry(2.5, 0.16, 0.18),
        world.clone().multiply(mat4([0, h - 0.5, 0])));
      B.add(M.wood, new THREE.BoxGeometry(1.8, 0.15, 0.16),
        world.clone().multiply(mat4([0, h - 1.5, 0])));
      // knee braces under the top crossarm — the detail that says "pole"
      for (const s of [-1, 1]) {
        B.add(M.wood, new THREE.BoxGeometry(0.09, 1.1, 0.09),
          world.clone().multiply(mat4([s * 0.5, h - 1.05, 0], [0, 0, s * 0.72])));
      }
      const anchors = [];
      for (const [dx, dy] of [[-1.12, h - 0.38], [0, h - 0.38], [1.12, h - 0.38], [-0.78, h - 1.38], [0.78, h - 1.38]]) {
        B.add(M.ceramic, new THREE.CylinderGeometry(0.06, 0.075, 0.18, 8),
          world.clone().multiply(mat4([dx, dy + 0.09, 0])));
        const a = new THREE.Vector3(dx, dy + 0.18, 0).applyMatrix4(world);
        anchors.push(a);
      }
      tops.push(anchors);
    }
    // Sagging catenary wire between consecutive poles.
    //
    // A true hyperbolic cosine, not a sine arc, and with real depth: a 38 m
    // span of old copper hangs the better part of three metres. The previous
    // 1.35 m over a sine looked dead straight the moment the camera lined up
    // anywhere near along the run, which is exactly how the road shots frame it.
    const wireGeo = [];
    const SAG = 3.1;
    // cosh-based drop, normalised to 1 at the midspan
    const A = 2.6;
    const cosh = (t) => (Math.exp(t) + Math.exp(-t)) * 0.5;
    const drop = (t) => (cosh(A * (t - 0.5) * 2) - cosh(A)) / (1 - cosh(A));
    for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i], b = tops[i + 1];
      const near = Math.min(Math.hypot(a[0].x, a[0].z), Math.hypot(b[0].x, b[0].z));
      const segs = near < 260 ? 12 : 5;
      const r = near < 260 ? 0.026 : 0.04;
      for (let w = 0; w < a.length; w++) {
        const pts = [];
        // lower wires hang slacker than the top pair, so the bundle separates
        const sag = SAG * (w < 3 ? 1 : 1.22);
        for (let s = 0; s <= segs; s++) {
          const t = s / segs;
          const x = a[w].x + (b[w].x - a[w].x) * t;
          const z = a[w].z + (b[w].z - a[w].z) * t;
          const y = a[w].y + (b[w].y - a[w].y) * t - drop(t) * sag;
          pts.push(new THREE.Vector3(x, y, z));
        }
        wireGeo.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, r, 3, false));
      }
    }
    for (const g of wireGeo) B.add(M.wire, g);
  }

  // ------------------------------------------------------------------ fence

  _fences(B) {
    const M = this.mats, eco = this.eco;
    const rng = new Rng(6006);
    const runs = [
      { z0: 60, z1: 132, side: 1, off: 22 },
      { z0: -180, z1: -108, side: -1, off: 17 },
    ];
    for (const run of runs) {
      const n = Math.round((run.z1 - run.z0) / 3.1);
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const z = run.z0 + (run.z1 - run.z0) * (i / n);
        const p = eco.roadPoint(z, run.side, run.off, new THREE.Vector3());
        const h = 1.25 + rng.range(0, 0.2);
        const lean = rng.gauss(0, 0.09);
        const broken = rng.next() < 0.1;
        if (!broken) {
          B.add(M.dark, new THREE.CylinderGeometry(0.055, 0.075, h, 6),
            mat4([p.x, p.y + h / 2 - 0.15, p.z], [lean, rng.next() * 3, rng.gauss(0, 0.06)]));
        }
        if (prev && !broken) {
          for (const dy of [0.45, 0.85, 1.15]) {
            const a = new THREE.Vector3(prev.x, prev.y + dy, prev.z);
            const b = new THREE.Vector3(p.x, p.y + dy, p.z);
            const mid = a.clone().lerp(b, 0.5); mid.y -= 0.07;
            const curve = new THREE.CatmullRomCurve3([a, mid, b]);
            B.add(M.wire, new THREE.TubeGeometry(curve, 3, 0.016, 3, false));
          }
        }
        prev = broken ? null : p;
      }
    }
  }

  /**
   * @param time seconds
   * @param [night] 0 in daylight, 1 after dark
   */
  update(dt: number, time: number, night: number = 0) {
    const flicker = 0.78 + 0.34 * Math.sin(time * 11.3) * Math.sin(time * 4.1)
      + 0.1 * Math.sin(time * 23.7);
    for (const l of this.lights) {
      if (l.kind === 'fire') {
        // the fire is always lit, but it only *matters* once the sun is gone
        l.light.intensity = l.base * flicker * (0.25 + 0.75 * night);
      } else if (l.kind === 'lantern') {
        l.light.intensity = l.base * night * (0.94 + 0.06 * Math.sin(time * 3.1 + l.light.position.x));
      }
    }
    if (this.mats) {
      this.mats.ember.emissiveIntensity = (2.0 + 2.6 * night) * flicker;
      this.mats.glyph.emissiveIntensity = 0.35 + 1.15 * night
        + 0.12 * Math.sin(time * 0.9);
      this.mats.lantern.emissiveIntensity = 0.3 + 4.5 * night;
      this.mats.rune.opacity = 0.35 + 0.75 * night;
    }
    if (this.flames) {
      const s = 0.86 + 0.2 * Math.sin(time * 7.3) + 0.08 * Math.sin(time * 17.1);
      this.flames.scale.set(s * 0.95, s, s * 0.95);
      this.flames.rotation.y = Math.sin(time * 1.7) * 0.16;
      for (const m of this.flames.children) {
        m.material.opacity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 9.1));
      }
    }
  }
}
