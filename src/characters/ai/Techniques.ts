import * as THREE from 'three';
import { entry as bestiaryEntry } from '../enemies/Bestiary.ts';

/**
 * Companion techniques — the things the tech bar buys.
 *
 * `PartyState` in the RPG layer owns the *rules* (bar cost, motion value,
 * affinity, whether the node that teaches it is unlocked). This module owns
 * what they actually **do** in the world: the swing, the flare, the pull, the
 * heal. `runTechnique` is the single entry point.
 */

/** @typedef {{id:string,name:string,bars:number,duration:number,run:Function}} Tech */

const V = new THREE.Vector3();

/* ------------------------------------------------------------ helpers */

/** Everything alive within `r` of a point. */
function around(ai: any, p: any, r: any) {
  const out = [];
  const r2 = r * r;
  for (const e of ai.enemies.list) {
    if (e.dead) continue;
    const dx = e.root.position.x - p.x, dz = e.root.position.z - p.z;
    if (dx * dx + dz * dz <= r2) out.push(e);
  }
  return out;
}

/** Ground point under an object. */
function ground(ai: any, p: any) {
  V.set(p.x, ai.terrain ? ai.terrain.heightAt(p.x, p.z) : p.y, p.z);
  return V.clone();
}

/* ---------------------------------------------------------- Gladiolus */

const GLADIO = [
  {
    id: 'tempest', name: 'Tempest', bars: 1, duration: 1.4, motion: 2.4,
    /** A full-body spin that catches everything within reach. */
    run(ai: any, m: any, target: any) {
      m.character?.play?.('attack_slash');
      const at = target ? target.root.position : m.root.position;
      ai._station(m, at, 2.4);
      ai.schedule(0.45, () => {
        const hits = around(ai, m.root.position, 6.5);
        for (const e of hits) ai.strike(m, e, { motion: 2.4, poise: 55, technique: true, scale: 1.5 });
        if (ai.vfx) {
          const c = m.root.position.clone(); c.y += 1.1;
          ai.vfx.airRing({ pos: c, color: 0xffc070, from: 0.6, to: 7.0, life: 0.42, intensity: 3.4 });
          ai.vfx.dustPuff({ pos: ground(ai, m.root.position), count: 22, radius: 3.0, speed: 6, life: 1.5, size: 0.8, grow: 3 });
        }
      });
    },
  },
  {
    id: 'impulse', name: 'Impulse', bars: 2, duration: 1.5, motion: 3.6,
    /** A rising cleave that throws the target into the air. */
    run(ai: any, m: any, target: any) {
      m.character?.play?.('attack_overhead');
      if (!target) return;
      ai._station(m, target.root.position, 2.4);
      ai.schedule(0.5, () => {
        if (target.dead) return;
        ai.strike(m, target, { motion: 3.6, poise: 90, technique: true, scale: 1.9 });
        target.airborne = true;
        target.root.position.y += 2.2;
        ai.schedule(0.8, () => { target.airborne = false; });
        if (ai.vfx) {
          const c = target.centre();
          ai.vfx.crystalBurst({ pos: c, count: 20, speed: 7, life: 0.7, size: 0.24, color: 0xffd08a });
          ai.vfx.flare({ pos: c, color: 0xffe0b0, size: 2.0, life: 0.3, intensity: 5 });
        }
      });
    },
  },
  {
    id: 'dawnhammer', name: 'Dawnhammer', bars: 3, duration: 2.2, motion: 6.2,
    /** The greatsword comes down and the ground goes with it. */
    run(ai: any, m: any, target: any) {
      m.character?.play?.('attack_overhead');
      const at = target ? target.root.position.clone() : m.root.position.clone();
      ai._station(m, at, 2.6);
      ai.schedule(0.9, () => {
        const p = ground(ai, at);
        const hits = around(ai, p, 8);
        for (const e of hits) ai.strike(m, e, { motion: 6.2, poise: 180, technique: true, scale: 2.2 });
        if (ai.vfx) {
          ai.vfx.shockwave({ pos: p, terrain: ai.terrain, radius: 8, color: 0xffb060, intensity: 4.4 });
          ai.vfx.flash({ pos: p, color: 0xffc070, intensity: 60, distance: 20, life: 0.5, priority: 6 });
          if (ai.terrain) ai.vfx.crack(p, 6, ai.terrain);
        }
        const cam = ai.game.get('Camera');
        if (cam && cam.addTrauma) cam.addTrauma(0.55);
        if (ai.combat) ai.combat.hitstop = Math.max(ai.combat.hitstop, 0.12);
      });
    },
  },
  {
    id: 'coverage', name: 'Coverage', bars: 1, duration: 1.0, motion: 0,
    /** Gladio takes the whole fight onto himself for fifteen seconds. */
    run(ai: any, m: any) {
      m.character?.play?.('guard');
      const hits = around(ai, m.root.position, 22);
      for (const e of hits) { e.target = m; e.awareness = 1; if (!e.inCombat) e.setState('chase'); }
      m.taunting = 15;
      if (ai.vfx) {
        const c = m.root.position.clone(); c.y += 1.2;
        ai.vfx.airRing({ pos: c, color: 0xffd8a0, from: 0.5, to: 9, life: 0.7, intensity: 2.6 });
      }
    },
  },
];

/* -------------------------------------------------------------- Ignis */

const IGNIS = [
  {
    id: 'analyse', name: 'Analyse', bars: 1, duration: 1.0, motion: 0.4,
    /** Reads the target and tells the party where it is soft. */
    run(ai: any, m: any, target: any) {
      m.character?.play?.('cast');
      if (!target) return;
      const info = bestiaryEntry(target.type.key) || { name: target.name, weak: [] };
      for (const e of around(ai, target.root.position, 14)) e.analysed = 24;
      window.dispatchEvent(new CustomEvent('encounter:analysed', {
        detail: { name: target.name, level: target.level, hp: Math.round(target.hp), maxHp: target.maxHp, ...info },
      }));
      if (ai.vfx) {
        const c = target.centre();
        ai.vfx.airRing({ pos: c, color: 0x9fe0ff, from: 0.3, to: 3.4, life: 0.5, intensity: 2.4 });
      }
      ai.strike(m, target, { motion: 0.4, poise: 6, technique: true });
    },
  },
  {
    id: 'enhancement', name: 'Enhancement', bars: 1, duration: 1.2, motion: 0,
    /** Ignis coats Noctis' blade — a real, timed attack buff. */
    run(ai: any, m: any) {
      m.character?.play?.('cast');
      const rpg = ai.rpg;
      const player = ai.player;
      const el = ['fire', 'ice', 'lightning'][(ai.rng.next() * 3) | 0];
      if (rpg) {
        const s = rpg.party.stats.noctis;
        const amount = Math.round(s.base('strength') * 0.35);
        s.buff.attack = (s.buff.attack || 0) + amount;
        ai.schedule(60, () => { s.buff.attack = Math.max(0, (s.buff.attack || 0) - amount); });
      }
      if (ai.vfx && player) {
        const c = player.position.clone(); c.y += 1.2;
        const colour = el === 'fire' ? 0xff7030 : el === 'ice' ? 0x9fe0ff : 0xd0c0ff;
        ai.vfx.crystalBurst({ pos: c, count: 18, speed: 3.0, life: 0.9, size: 0.18, color: colour });
        ai.vfx.flare({ pos: c, color: colour, size: 1.6, life: 0.5, intensity: 5 });
      }
      window.dispatchEvent(new CustomEvent('encounter:enhancement', { detail: { element: el, seconds: 60 } }));
    },
  },
  {
    id: 'regroup', name: 'Regroup', bars: 2, duration: 1.4, motion: 0,
    /** Heals the retinue and picks up anyone who is down. */
    run(ai: any, m: any) {
      m.character?.play?.('cast');
      const rpg = ai.rpg;
      if (rpg) {
        for (const s of rpg.roster) {
          s.ko = false;
          s.heal(s.maxHp * 0.32);
        }
      }
      const downed = ai.game.get('Downed');
      if (downed && downed.state === 'downed') downed.revive('ignis', 0.4);
      for (const a of ai.party.members) if (a.downed) { a.downTimer = 0; }
      if (ai.vfx && ai.player) {
        const c = ai.player.position.clone(); c.y += 0.4;
        ai.vfx.airRing({ pos: c, color: 0xa0ffc0, from: 0.5, to: 8, life: 0.8, intensity: 3 });
        ai.vfx.moteBurst({ pos: c, count: 34, speed: 2.2, color: 0x90ffb0, life: 1.4, size: 0.2, gravity: 0.6, intensity: 4 });
      }
      window.dispatchEvent(new CustomEvent('encounter:regroup', { detail: {} }));
    },
  },
  {
    id: 'overwhelm', name: 'Overwhelm', bars: 3, duration: 2.0, motion: 4.8,
    /** Eight dagger hits on one target, fast enough to blur. */
    run(ai: any, m: any, target: any) {
      if (!target) return;
      ai._station(m, target.root.position, 2.0);
      for (let i = 0; i < 8; i++) {
        ai.schedule(0.12 + i * 0.16, () => {
          if (target.dead) return;
          m.character?.play?.(i % 2 ? 'attack_thrust' : 'attack_slash');
          ai.strike(m, target, { motion: 0.6, poise: 18, technique: true, scale: 0.8 });
        });
      }
      ai.schedule(1.5, () => {
        if (target.dead) return;
        ai.strike(m, target, { motion: 1.4, poise: 40, technique: true, scale: 1.5 });
        if (ai.vfx) ai.vfx.flare({ pos: target.centre(), color: 0xbfe8ff, size: 2.2, life: 0.35, intensity: 6 });
      });
    },
  },
];

/* ------------------------------------------------------------ Prompto */

const PROMPTO = [
  {
    id: 'piercer', name: 'Piercer', bars: 1, duration: 1.1, motion: 2.0,
    /** One armour-piercing round, straight through the plate. */
    run(ai: any, m: any, target: any) {
      m.character?.play?.('attack_thrust');
      if (!target) return;
      ai.schedule(0.4, () => {
        if (target.dead) return;
        const from = m.root.position.clone(); from.y += 1.35;
        if (ai.vfx) {
          const b = ai.vfx.acquireBeam();
          b.uniforms.uHead.value.set(0xfff4d8);
          b.uniforms.uTail.value.set(0xffa040);
          b.uniforms.uIntensity.value = 5.0;
          b.width = 0.09;
          b.setLine(from, target.centre());
          ai.vfx.track(ai.vfx.clock, 0.18, (k: any) => { b.strength = k < 0 || k > 1 ? 0 : (1 - k); });
        }
        ai.strike(m, target, { motion: 2.0, poise: 60, technique: true, scale: 1.4, ignoreArmour: true });
      });
    },
  },
  {
    id: 'recoil', name: 'Recoil', bars: 2, duration: 1.2, motion: 3.0,
    /** A shotgun blast at contact range that throws the target off him. */
    run(ai: any, m: any, target: any) {
      m.character?.play?.('attack_thrust');
      if (!target) return;
      ai.schedule(0.35, () => {
        if (target.dead) return;
        ai.strike(m, target, { motion: 3.0, poise: 80, technique: true, scale: 1.7 });
        const away = V.subVectors(target.root.position, m.root.position).setY(0).normalize();
        target.root.position.addScaledVector(away, 4.5);
        if (ai.vfx) {
          const c = target.centre();
          ai.vfx.sparkBurst({ pos: c, dir: away.clone(), count: 30, speed: 12, spread: 0.7, color: 0xffc070, size: 0.09, intensity: 7 });
        }
      });
    },
  },
  {
    id: 'starshell', name: 'Starshell', bars: 2, duration: 1.6, motion: 0.6,
    /** A magnesium flare. It lights the field, and daemons hate it. */
    run(ai: any, m: any, target: any) {
      m.character?.play?.('attack_thrust');
      const at = target ? target.centre() : m.root.position.clone();
      at.y += 12;
      ai.schedule(0.4, () => {
        if (ai.vfx) {
          ai.vfx.flare({ pos: at, color: 0xffffe8, size: 8, life: 6.0, intensity: 12 });
          ai.vfx.flash({ pos: at, color: 0xfff6d0, intensity: 160, distance: 60, life: 5.0, priority: 8 });
          ai.vfx.moteBurst({ pos: at, count: 40, speed: 3.0, color: 0xfff0c0, life: 4.0, size: 0.3, gravity: 0.4, intensity: 6 });
        }
        // burn everything that came out of the ground
        for (const e of around(ai, at, 26)) {
          if (e.faction !== 'daemon') continue;
          ai.strike(m, e, { motion: 1.6, poise: 30, element: 'light', technique: true, scale: 1.2, color: 0xfff0c0 });
          e.awareness = Math.max(0, e.awareness - 0.5);
        }
        window.dispatchEvent(new CustomEvent('encounter:starshell', { detail: { seconds: 6 } }));
      });
    },
  },
  {
    id: 'gravisphere', name: 'Gravisphere', bars: 3, duration: 2.6, motion: 1.2,
    /** Drops a singularity and drags the whole field into it. */
    run(ai: any, m: any, target: any) {
      m.character?.play?.('cast');
      const at = target ? ground(ai, target.root.position) : ground(ai, m.root.position);
      const caught = around(ai, at, 20);
      if (ai.vfx) {
        ai.vfx.airRing({ pos: at.clone().setY(at.y + 1), color: 0x9060ff, from: 0.5, to: 12, life: 0.9, intensity: 3.6 });
        ai.vfx.flash({ pos: at, color: 0x7040ff, intensity: 40, distance: 22, life: 2.2 });
      }
      for (let i = 0; i < 12; i++) {
        ai.schedule(0.2 + i * 0.18, () => {
          for (const e of caught) {
            if (e.dead || e.boss) continue;
            const d = V.subVectors(at, e.root.position).setY(0);
            const l = d.length();
            if (l < 0.6) continue;
            e.root.position.addScaledVector(d.multiplyScalar(1 / l), Math.min(1.6, l * 0.35));
          }
        });
      }
      ai.schedule(2.3, () => {
        for (const e of caught) {
          if (e.dead) continue;
          ai.strike(m, e, { motion: 1.2, poise: 70, technique: true, scale: 1.3, color: 0xa070ff });
        }
        if (ai.vfx) ai.vfx.shockwave({ pos: at, terrain: ai.terrain, radius: 10, color: 0x9060ff, intensity: 3.4 });
      });
    },
  },
];

/** Techniques by companion, in ascending bar cost. */
export const TECH_TABLE = { gladio: GLADIO, ignis: IGNIS, prompto: PROMPTO };

/** Flat lookup by id. */
export const TECHS = Object.fromEntries(
  [...GLADIO, ...IGNIS, ...PROMPTO].map((t) => [t.id, t])
);

/**
 * Perform a technique.
 * @param ai the PartyAI
 * @param m the party member performing it
 * @param target the enemy it is aimed at (may be null)
 */
export function runTechnique(ai: any, m: any, tech: Tech, target: any) {
  if (!tech || !tech.run) return false;
  tech.run(ai, m, target);
  return true;
}
