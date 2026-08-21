import * as THREE from 'three';

/**
 * Elemancy — fire, ice and lightning spellcraft.
 *
 * Every spell is authored on the VFX effect clock (so it freezes correctly for
 * screenshots), lights the world with a real pooled PointLight, leaves a
 * ground decal, and registers an elemental *zone*. Overlapping zones of
 * different elements produce reactions: steam, conduction, firestorm.
 */

const V = new THREE.Vector3();

export const ELEMENTS = {
  fire: { color: 0xff7a1e, hot: 0xffd9a0, light: 0xff8a30, damage: 210, radius: 3.4 },
  ice: { color: 0x7fd6ff, hot: 0xeaffff, light: 0x8fd8ff, damage: 190, radius: 3.0 },
  lightning: { color: 0xa8c8ff, hot: 0xffffff, light: 0xbfd8ff, damage: 240, radius: 2.6 },
};

export class Elemancy {
  game!: any;
  vfx!: any;
  zones!: any[];
  constructor(vfx: any, game: any) {
    this.vfx = vfx;
    this.game = game;
    this.zones = [];   // {element, pos, radius, until}
  }

  /**
   * Where a spell lands when the caller did not say: a few metres in front of
   * the player, on the ground. `cast('fire')` is a legitimate call — a hotkey,
   * a script, an AI that only knows the element — and it used to throw.
   */
  defaultTarget(): THREE.Vector3 {
    const out = new THREE.Vector3();
    const player = this.game && this.game.get && this.game.get('Player');
    const cam = this.game && this.game.camera;
    if (player && player.position) out.copy(player.position);
    else if (cam) out.setFromMatrixPosition(cam.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1);
    if (cam) { cam.getWorldDirection(fwd); fwd.y = 0; }
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    out.addScaledVector(fwd.normalize(), 6);
    const terrain = this.game && this.game.get && this.game.get('Terrain');
    if (terrain && terrain.heightAt) out.y = terrain.heightAt(out.x, out.z);
    return out;
  }

  /**
   * Cast a spell at a point.
   * @param [o] {pos, t0, power, terrain, from}
   */
  cast(element: 'fire' | 'ice' | 'lightning', o: any = {}): {element:string, pos:THREE.Vector3, radius:number, damage:number, reaction:string|null} {
    const {
      t0 = this.vfx.clock, power = 1, terrain = null, from = null,
    } = o;
    const pos = o.pos || this.defaultTarget();
    const def = ELEMENTS[element] || ELEMENTS.fire;
    const radius = def.radius * power;
    const reaction = this._reactionAt(pos, element);

    if (from) this._throw(element, from, pos, t0 - 0.34, def);
    switch (element) {
      case 'ice': this._ice(pos, t0, power, def, terrain); break;
      case 'lightning': this._lightning(pos, t0, power, def, terrain, from); break;
      default: this._fire(pos, t0, power, def, terrain); break;
    }
    if (reaction) this._reaction(reaction, pos, t0 + 0.12, power, terrain);

    this.zones.push({ element, pos: pos.clone(), radius, until: this.vfx.clock + 5.5 });
    return { element, pos, radius, damage: def.damage * power, reaction };
  }

  /** Flask arcing in before the burst. */
  _throw(element: any, from: any, to: any, t0: any, def: any) {
    const vfx = this.vfx;
    const b = vfx.acquireBeam();
    b.uniforms.uHead.value.set(def.hot);
    b.uniforms.uTail.value.set(def.color);
    b.uniforms.uTaper.value = 1.4;
    b.uniforms.uFalloff.value = 1.2;
    b.uniforms.uIntensity.value = 2.0;
    b.width = 0.12;
    const mid = V.copy(from).lerp(to, 0.5).clone();
    mid.y += from.distanceTo(to) * 0.22;
    b.setPath([from.clone(), mid, to.clone()]);
    vfx.track(t0, 0.42, (n: any) => { b.strength = n < 0 || n > 1 ? 0 : Math.min(1, n * 3) * (1 - n); });
  }

  /* ------------------------------------------------------------- fire */

  _fire(pos: any, t0: any, power: any, def: any, terrain: any) {
    const vfx = this.vfx, rng = vfx.rng;
    const s = power;
    // core detonation
    vfx.moteBurst({
      pos, count: 70, speed: 7.5 * s, color: def.color, life: 0.95, t0,
      size: 0.85 * s, gravity: 2.6, intensity: 2.8, turbulence: 0.8, drag: 2.2,
      spread: Math.PI, jitter: 0.25 * s,
    });
    vfx.moteBurst({
      pos, count: 26, speed: 4.0 * s, color: def.hot, life: 0.5, t0,
      size: 1.2 * s, gravity: 3.4, intensity: 4.5, turbulence: 0.5, drag: 3.0,
      spread: Math.PI,
    });
    vfx.sparkBurst({
      pos, dir: new THREE.Vector3(0, 1, 0), count: 46, speed: 11 * s, spread: Math.PI * 0.8,
      color: 0xffb050, size: 0.09 * s, t0, life: 1.1, intensity: 4, gravity: -9,
    });
    vfx.smokePlume({
      pos, count: 26, speed: 2.4 * s, life: 3.4, t0: t0 + 0.06, color: 0x3a332c,
      size: 0.7 * s, grow: 3.0, rise: 2.6, radius: 0.7 * s, intensity: 0.42,
    });
    vfx.flare({ pos, color: def.hot, size: 2.0 * s, life: 0.32, t0, intensity: 3.2 });
    vfx.flash({ pos, color: def.light, intensity: 55 * s, distance: 20 * s, life: 0.8, t0, priority: 8 });
    if (terrain) {
      const g = pos.clone(); g.y = terrain.heightAt(g.x, g.z);
      vfx.shockwave({ pos: g, terrain, radius: def.radius * s, color: 0xff9a40, t0, intensity: 3.0 });
      vfx.ground.decal({
        pos: g, terrain, size: def.radius * 2.0 * s, map: vfx.tex.scorch,
        color: 0xffffff, opacity: 0.7, life: 36, rotate: rng.next() * 6.28,
        age: vfx.clock - t0,
      });
      vfx.ground.pool({
        pos: g, terrain, size: def.radius * 1.5 * s, color: 0xff6a1a,
        life: 3.0, intensity: 0.9, opacity: 0.55, age: vfx.clock - t0,
      });
    }
    // lingering flame column — dense, tall and clearly *fire*
    for (let i = 0; i < 150; i++) {
      const a = rng.next() * Math.PI * 2, r = Math.pow(rng.next(), 1.6) * def.radius * 0.5 * s;
      V.set(pos.x + Math.cos(a) * r, pos.y + rng.next() * 0.25, pos.z + Math.sin(a) * r);
      const hot = rng.next() < 0.35;
      vfx.motes.emit({
        pos: V, vel: { x: rng.gauss(0, 0.35), y: 2.6 + rng.next() * 3.0, z: rng.gauss(0, 0.35) },
        color: new THREE.Color(hot ? def.hot : (rng.next() < 0.5 ? 0xff4a08 : def.color)),
        t0: t0 + 0.05 + rng.next() * 2.6, life: 0.55 + rng.next() * 0.55,
        size0: (hot ? 0.34 : 0.55) * s, size1: 0.06, drag: 1.3, gravity: 2.2, turbulence: 0.9,
        intensity: hot ? 4.0 : 2.4, fade: 1.35,
      });
    }
    // ember sparks riding the column
    for (let i = 0; i < 40; i++) {
      const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * def.radius * 0.6 * s;
      V.set(pos.x + Math.cos(a) * r, pos.y + rng.range(0.1, 1.2), pos.z + Math.sin(a) * r);
      vfx.sparks.emit({
        pos: V, vel: { x: rng.gauss(0, 0.8), y: 3.2 + rng.next() * 3.5, z: rng.gauss(0, 0.8) },
        color: new THREE.Color(0xffa040), t0: t0 + rng.next() * 2.6,
        life: 0.9 + rng.next() * 0.8, size0: 0.06 * s, size1: 0.01,
        drag: 1.1, gravity: -1.2, turbulence: 0.6, stretch: 0.02,
        intensity: 4.0, fade: 1.2,
      });
    }
  }

  /* -------------------------------------------------------------- ice */

  _ice(pos: any, t0: any, power: any, def: any, terrain: any) {
    const vfx = this.vfx, rng = vfx.rng;
    const s = power;
    // a ring of crystal spikes erupting from the ground
    const n = 13;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const r = def.radius * s * (0.25 + rng.next() * 0.75);
      const y = terrain ? terrain.heightAt(pos.x + Math.cos(a) * r, pos.z + Math.sin(a) * r) : pos.y;
      const tilt = rng.range(0.15, 0.5);
      vfx.shards.emit({
        pos: { x: pos.x + Math.cos(a) * r, y: y + 0.25 * s, z: pos.z + Math.sin(a) * r },
        vel: { x: 0, y: 0.3, z: 0 },
        axis: { x: Math.cos(a + 1.57) * tilt, y: 1, z: Math.sin(a + 1.57) * tilt },
        color: new THREE.Color(0x2f8fd8),
        t0: t0 + i * 0.012, life: 4.2, size: (0.75 + rng.next() * 0.8) * s,
        spin: 0, drag: 4, gravity: 0, phase: rng.range(0.25, 0.6),
      });
    }
    vfx.shards.emit({
      pos: { x: pos.x, y: pos.y + 0.5 * s, z: pos.z }, vel: { x: 0, y: 0.6, z: 0 },
      axis: { x: 0.08, y: 1, z: 0.05 }, color: new THREE.Color(0x4fb0e8),
      t0, life: 4.4, size: 1.9 * s, spin: 0, drag: 4, gravity: 0, phase: 0.12,
    });
    vfx.moteBurst({
      pos, count: 54, speed: 5.5 * s, color: def.color, life: 1.5, t0,
      size: 0.55 * s, gravity: -1.4, intensity: 2.2, turbulence: 0.5, spread: Math.PI,
    });
    vfx.sparkBurst({
      pos, dir: new THREE.Vector3(0, 1, 0), count: 34, speed: 9 * s, spread: Math.PI * 0.7,
      color: 0xdff4ff, size: 0.08 * s, t0, life: 0.7, intensity: 4, gravity: -10,
    });
    // freezing mist crawling along the ground
    vfx.smokePlume({
      pos, count: 26, speed: 3.4 * s, life: 2.8, t0, color: 0xbfe2f2,
      size: 0.9 * s, grow: 3.2, rise: 0.35, radius: def.radius * 0.5 * s, intensity: 0.55,
    });
    vfx.flare({ pos, color: def.hot, size: 1.8 * s, life: 0.34, t0, intensity: 2.8 });
    vfx.flash({ pos, color: def.light, intensity: 38 * s, distance: 16 * s, life: 0.7, t0, priority: 7 });
    if (terrain) {
      const g = pos.clone(); g.y = terrain.heightAt(g.x, g.z);
      vfx.shockwave({ pos: g, terrain, radius: def.radius * s, color: 0xbfe8ff, t0, intensity: 3.2, dust: false });
      vfx.ground.decal({
        pos: g, terrain, size: def.radius * 2.2 * s, map: vfx.tex.frost,
        color: 0xcdeaff, opacity: 0.9, life: 24, rotate: rng.next() * 6.28, intensity: 1.7,
        age: vfx.clock - t0,
      });
    }
  }

  /* -------------------------------------------------------- lightning */

  _lightning(pos: any, t0: any, power: any, def: any, terrain: any, from: any) {
    const vfx = this.vfx, rng = vfx.rng;
    const s = power;
    const sky = pos.clone(); sky.y += 16 * s;
    vfx.lightningArc({ from: sky, to: pos, t0, life: 0.26, color: 0xd6e6ff, width: 0.14 * s, branches: 3 });
    if (from) vfx.lightningArc({ from, to: pos, t0: t0 + 0.02, life: 0.18, color: 0xbdd4ff, width: 0.08 * s, branches: 1 });
    // chain arcs to whatever is standing nearby
    const enemies = this.game.get('Enemies');
    if (enemies) {
      let chained = 0;
      for (const e of enemies.list) {
        if (e.dead || chained >= 3) continue;
        const d = e.root.position.distanceTo(pos);
        if (d > def.radius * s * 2.2 || d < 0.2) continue;
        vfx.lightningArc({
          from: pos, to: e.centre(), t0: t0 + 0.05 + chained * 0.04,
          life: 0.16, color: 0xc8dcff, width: 0.06 * s, branches: 0,
        });
        chained++;
      }
    }
    vfx.sparkBurst({
      pos, dir: new THREE.Vector3(0, 1, 0), count: 60, speed: 16 * s, spread: Math.PI,
      color: 0xdcecff, size: 0.09 * s, t0, life: 0.55, intensity: 5, gravity: -14, stretch: 0.10,
    });
    vfx.moteBurst({
      pos, count: 30, speed: 6 * s, color: def.color, life: 0.7, t0,
      size: 0.45 * s, gravity: 1.0, intensity: 3.4, spread: Math.PI,
    });
    vfx.flare({ pos, color: 0xffffff, size: 2.4 * s, life: 0.22, t0, intensity: 4.5 });
    vfx.flash({ pos, color: def.light, intensity: 90 * s, distance: 26 * s, life: 0.36, t0, priority: 9 });
    if (terrain) {
      const g = pos.clone(); g.y = terrain.heightAt(g.x, g.z);
      vfx.shockwave({ pos: g, terrain, radius: def.radius * 1.4 * s, color: 0xd0e4ff, t0, intensity: 4.0 });
      vfx.ground.decal({
        pos: g, terrain, size: def.radius * 1.9 * s, map: vfx.tex.crack,
        color: 0x121418, opacity: 0.9, life: 30, rotate: rng.next() * 6.28,
        age: vfx.clock - t0,
      });
    }
  }

  /* -------------------------------------------------------- reactions */

  _reactionAt(pos: any, element: any) {
    const now = this.vfx.clock;
    this.zones = this.zones.filter((z) => z.until > now);
    for (const z of this.zones) {
      if (z.element === element) continue;
      if (z.pos.distanceTo(pos) > z.radius * 1.3) continue;
      const pair = [z.element, element].sort().join('+');
      if (pair === 'fire+ice') return 'steam';
      if (pair === 'ice+lightning') return 'conduction';
      if (pair === 'fire+lightning') return 'firestorm';
    }
    return null;
  }

  _reaction(kind: any, pos: any, t0: any, power: any, terrain: any) {
    const vfx = this.vfx;
    if (kind === 'steam') {
      vfx.smokePlume({
        pos, count: 54, speed: 5.5 * power, life: 2.6, t0, color: 0xdfe8ee,
        size: 1.0 * power, grow: 4.4, rise: 3.4, radius: 1.0 * power, intensity: 0.9,
      });
      vfx.flash({ pos, color: 0xd8f0ff, intensity: 60, distance: 12, life: 0.5, t0, priority: 5 });
    } else if (kind === 'conduction') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const to = pos.clone().add(new THREE.Vector3(Math.cos(a) * 4.5 * power, 0.6, Math.sin(a) * 4.5 * power));
        vfx.lightningArc({ from: pos, to, t0: t0 + i * 0.03, life: 0.2, color: 0xa8e8ff, width: 0.07, branches: 0 });
      }
      if (terrain) vfx.ground.ring({ pos, terrain, radius: 6 * power, color: 0x9fe4ff, life: 0.9, intensity: 3.4 });
    } else if (kind === 'firestorm') {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        const p = pos.clone().add(new THREE.Vector3(Math.cos(a) * 3.2 * power, 0, Math.sin(a) * 3.2 * power));
        if (terrain) p.y = terrain.heightAt(p.x, p.z);
        vfx.moteBurst({
          pos: p, count: 26, speed: 6 * power, color: 0xff8a2a, life: 1.1,
          t0: t0 + i * 0.05, size: 0.7, gravity: 3.0, intensity: 5, turbulence: 0.8, spread: Math.PI,
        });
        vfx.flash({ pos: p, color: 0xff8a30, intensity: 45, distance: 10, life: 0.5, t0: t0 + i * 0.05, priority: 3 });
      }
    }
  }

  update() {
    const now = this.vfx.clock;
    if (this.zones.length) this.zones = this.zones.filter((z) => z.until > now);
  }
}
