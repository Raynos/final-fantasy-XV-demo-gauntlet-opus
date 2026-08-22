import * as THREE from 'three';
import { Pack } from './Pack.ts';
import { TitanArena } from './TitanArena.ts';
import type { EncounterDirector } from './EncounterDirector.ts';

/**
 * A boss fight: a phase machine bolted onto one enemy instance.
 *
 * Every fight follows the same shape — **phases** gated on remaining HP, a
 * **telegraphed heavy** that is survivable if you read it, and a
 * **vulnerability window** after that heavy where the boss is wide open and
 * the fight's damage actually gets done. What differs is the spectacle:
 *
 *  - `field`    Bloodhorn. Charges the arena end to end and buries its horns
 *               in the ground; that miss is the window.
 *  - `imperial` MA-X Cuirass. Arrives under a dropship, sheds an arm at 60 %,
 *               and vents itself white-hot at 25 %.
 *  - `astral`   Titan. A forty-metre fist comes down on the arena and stays
 *               there; you climb it and hit the wrist.
 */
export class BossFight {
  _announced!: boolean;
  _done!: boolean;
  _phaseHold!: number;
  _rise!: number;
  _tmp!: THREE.Vector3;
  adds!: any[];
  arena!: TitanArena | null;
  boss!: any;
  centre!: THREE.Vector3;
  def!: any;
  dir!: EncounterDirector;
  enemies!: any;
  game!: any;
  pack!: Pack | null;
  phase!: number;
  thresholds!: number[];
  time!: number;
  vfx!: any;
  window!: number;
  /**
   * @param def a `SET_PIECES` entry
   */
  constructor(def: any, dir: import('./EncounterDirector.ts').EncounterDirector) {
    this.def = def;
    this.dir = dir;
    this.game = dir.game;
    this.vfx = dir.vfx;
    this.enemies = dir.enemies;
    this.boss = null;
    this.adds = [];
    this.pack = null;
    this.phase = 0;
    this.thresholds = def.kind === 'astral' ? [0.66, 0.33] : [0.6, 0.25];
    this.centre = new THREE.Vector3();
    this.arena = null;
    this.time = 0;
    this.window = 0;          // seconds of vulnerability remaining
    this._tmp = new THREE.Vector3();
    this._announced = false;
  }

  /** Is `e` part of this fight? */
  owns(e: any) { return e === this.boss || this.adds.includes(e); }

  /**
   * Put the boss in the world.
   */
  begin(at: THREE.Vector3) {
    const def = this.def;
    this.centre.copy(at);
    this.pack = new Pack({ id: `boss-${def.id}`, encounter: this.dir, maxEngaged: 3 });
    this.dir.packs.push(this.pack);

    const dir = this.dir;
    const player = dir.player;
    // stand the boss off from the party so the arrival reads
    const bearing = player
      ? Math.atan2(at.x - player.position.x, at.z - player.position.z)
      : 0;
    const stand = def.kind === 'astral'
      ? dir.ground(at.x + Math.sin(bearing) * (def.arena || 60) * 0.9, at.z + Math.cos(bearing) * (def.arena || 60) * 0.9).clone()
      : dir.ground(at.x + Math.sin(bearing) * 16, at.z + Math.cos(bearing) * 16).clone();

    this.boss = this.enemies.spawn(def.boss, {
      pos: stand, level: def.level, pack: this.pack, leash: 400,
      heading: bearing + Math.PI, expClass: 'boss', owner: `boss:${def.id}`,
    });
    this.boss.boss = true;
    this.boss.keepCorpse = true;

    for (const a of def.adds || []) {
      for (let i = 0; i < a.count; i++) {
        const ang = (i / a.count) * Math.PI * 2;
        const p = dir.ground(stand.x + Math.cos(ang) * 9, stand.z + Math.sin(ang) * 9).clone();
        const e = this.enemies.spawn(a.key, {
          pos: p, level: a.level || def.level - 6, pack: this.pack,
          leash: 200, owner: `boss:${def.id}`,
        });
        this.adds.push(e);
      }
    }

    if (def.kind === 'astral') {
      this.arena = new TitanArena(this.game, at, def.arena || 60);
      this.arena.build();
      // Titan does not walk in — he is simply, suddenly, there
      this.boss.root.position.y -= 6;
      this._rise = 0;
    }
    if (def.dropship && dir.dropship) {
      dir.dropship.arrive(dir.ground(stand.x, stand.z).clone(), [this.boss, ...this.adds]);
    } else if (player) {
      for (const e of [this.boss, ...this.adds]) {
        e.target = player;
        e.awareness = 1;
        e.setState('chase');
      }
      this.pack.alerted = true;
    }

    window.dispatchEvent(new CustomEvent('encounter:boss', {
      detail: { id: def.id, name: def.name, kind: def.kind, level: def.level, music: def.music },
    }));
    return this;
  }

  /** Custom strike resolution so a forty-metre fist hits where it lands. */
  resolveStrike(e: any, a: any) {
    if (e !== this.boss || this.def.kind !== 'astral') return false;
    const hand = a.id === 'slam_l' ? 'handL' : 'handR';
    const p = this._handPos(hand);
    if (!p) return false;
    this.slamAt(p, a);
    return true;
  }

  /** World position of one of Titan's hands. */
  _handPos(name: any) {
    const b = this.boss?.rig?.byName?.get(name);
    if (!b) return null;
    b.updateWorldMatrix(true, false);
    return this._tmp.setFromMatrixPosition(b.matrixWorld).clone();
  }

  /**
   * The signature moment: a fist lands, the arena rings, and everything
   * inside the crater is thrown.
   */
  slamAt(p: THREE.Vector3, a: any) {
    const dir = this.dir;
    const r = (a.hitRadius || 14);
    const ground = dir.ground(p.x, p.z).clone();
    if (this.vfx) {
      this.vfx.shockwave({ pos: ground, terrain: dir.terrain, radius: r, color: 0xffc07a, intensity: 4.2 });
      this.vfx.dustPuff({
        pos: ground, count: 46, radius: r * 0.55, speed: 16, life: 3.2,
        size: 2.2, grow: 3.4, up: 1.6, intensity: 0.55,
      });
      this.vfx.flash({ pos: ground, color: 0xffa060, intensity: 60, distance: r * 2, life: 0.5, priority: 6 });
      if (dir.terrain) this.vfx.crack(ground, r * 0.9, dir.terrain);
    }
    const cam = this.game.get('Camera');
    if (cam && cam.addTrauma) cam.addTrauma(0.9);
    if (this.arena) this.arena.quake(1);

    for (const t of dir.threats) {
      const tp = t.position || t.root?.position;
      if (!tp) continue;
      if (Math.hypot(tp.x - ground.x, tp.z - ground.z) > r) continue;
      dir.damageThreat(t, this.boss, a);
    }
  }

  /* ------------------------------------------------------------- phases */

  _enterPhase(n: any) {
    if (n <= this.phase) return;
    this.phase = n;
    const b = this.boss;
    if (!b) return;
    b.phaseIndex = n;
    b.poise = b.maxPoise;
    b.staggered = false;
    b.invulnerable = true;
    b._endAttack();
    b.setState('stagger');
    b.staggerTime = 1.6;
    this._phaseHold = 1.6;

    const c = b.centre();
    if (this.vfx) {
      this.vfx.airRing({ pos: c, color: this.def.kind === 'imperial' ? 0xff4020 : 0xffb060, from: 1, to: 16, life: 0.8, intensity: 4 });
      this.vfx.flash({ pos: c, color: 0xffd0a0, intensity: 70, distance: 24, life: 0.6, priority: 6 });
      this.vfx.crystalBurst({ pos: c, count: 30, speed: 8, life: 1.0, size: 0.4, color: 0xffb060 });
    }
    const cam = this.game.get('Camera');
    if (cam && cam.addTrauma) cam.addTrauma(0.7);

    if (this.def.kind === 'imperial') this._imperialPhase(n);
    if (this.def.kind === 'field') this._fieldPhase(n);
    if (this.def.kind === 'astral' && this.arena) this.arena.riseSpires(n);

    window.dispatchEvent(new CustomEvent('encounter:boss-phase', {
      detail: { boss: this.def.id, name: this.def.name, phase: n },
    }));
  }

  _imperialPhase(n: any) {
    const dir = this.dir;
    if (n === 1) {
      // the missile arm goes; the garrison sends more bodies
      const p = this.boss.root.position;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const at = dir.ground(p.x + Math.cos(a) * 12, p.z + Math.sin(a) * 12).clone();
        const e = this.enemies.spawn('mt', {
          pos: at, level: this.def.level - 8, pack: this.pack, leash: 160, owner: `boss:${this.def.id}`,
        });
        e.target = dir.player; e.awareness = 1; e.setState('chase');
        this.adds.push(e);
      }
      if (this.vfx) {
        const c = this.boss.centre();
        this.vfx.smokePlume({ pos: c, count: 26, speed: 2.6, life: 4.0, color: 0x18140f, size: 1.2, rise: 3.0 });
      }
    }
  }

  _fieldPhase(n: any) {
    const b = this.boss;
    if (!b) return;
    // it gets faster and angrier, and stops queueing behind its own adds
    b.speed *= 1.18;
    b.damage = Math.round(b.damage * 1.15);
    if (n === 2 && this.pack) this.pack.maxEngaged = 4;
  }

  /* --------------------------------------------------------------- tick */

  update(dt: any) {
    const b = this.boss;
    this.time += dt;
    if (this.arena) this.arena.update(dt);
    if (!b) return;

    if (this._phaseHold > 0) {
      this._phaseHold -= dt;
      if (this._phaseHold <= 0) b.invulnerable = false;
    }

    if (this.def.kind === 'astral' && this._rise != null && this._rise < 1) {
      // he comes up out of the Disc over three seconds
      this._rise = Math.min(1, this._rise + dt / 3);
      const g = this.dir.terrain ? this.dir.terrain.heightAt(b.root.position.x, b.root.position.z) : 0;
      b.root.position.y = g - 6 + 6 * this._rise;
      if (this._rise >= 1 && this.arena) this.arena.quake(0.6);
    }

    if (!b.dead) {
      const f = b.hpFraction;
      for (let i = this.thresholds.length - 1; i >= 0; i--) {
        if (f <= this.thresholds[i]) { this._enterPhase(i + 1); break; }
      }
      // the vulnerability window: while the boss is recovering from a heavy it
      // takes far more damage, and the HUD is told so the player knows
      const heavy = b.attack && (b.attack.aoe || b.attack.unblockable || (b.attack.mult || 1) >= 1.4);
      const open = b.state === 'recover' && heavy;
      if (open && this.window <= 0) {
        this.window = b._timing('recover');
        window.dispatchEvent(new CustomEvent('encounter:boss-window', { detail: { boss: this.def.id, open: true } }));
        if (this.vfx) {
          const c = b.centre();
          this.vfx.flare({ pos: c, color: 0xffe6a0, size: 3.0 * b.scale, life: 0.5, intensity: 6 });
        }
      }
      if (this.window > 0) {
        this.window -= dt;
        b.vulnerable = true;
        if (this.window <= 0) {
          b.vulnerable = false;
          window.dispatchEvent(new CustomEvent('encounter:boss-window', { detail: { boss: this.def.id, open: false } }));
        }
      }
    }

    if (b.dead && !this._done) {
      this._done = true;
      this.dir.endBoss(true);
    }
  }

  /** The boss died. */
  onBossDeath(e: any) {
    if (e !== this.boss) return;
    const c = e.centre();
    if (this.vfx) {
      this.vfx.flash({ pos: c, color: 0xfff0d0, intensity: 120, distance: 40, life: 1.0, priority: 8 });
      this.vfx.crystalBurst({ pos: c, count: 70, speed: 12, life: 2.0, size: 0.5, color: 0x9fd8ff, gravity: -3 });
      this.vfx.shockwave({ pos: this.dir.ground(c.x, c.z).clone(), terrain: this.dir.terrain, radius: 18, color: 0xbfe8ff, intensity: 5 });
    }
    const cam = this.game.get('Camera');
    if (cam && cam.addTrauma) cam.addTrauma(1.0);
    if (this.game.time) this.game.time.scale = 0.25;
  }

  end(victory: boolean) {
    window.dispatchEvent(new CustomEvent('encounter:boss-end', {
      detail: { boss: this.def.id, name: this.def.name, victory },
    }));
    if (this.arena) { this.arena.dispose(); this.arena = null; }
    if (!victory) {
      const owner = `boss:${this.def.id}`;
      for (const e of [this.boss, ...this.adds]) {
        if (e && e.spawnedBy === owner && this.enemies.list.includes(e)) this.enemies.despawn(e);
      }
    }
    const i = this.dir.packs.indexOf(this.pack);
    if (i >= 0) this.dir.packs.splice(i, 1);
  }
}
