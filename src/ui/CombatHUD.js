import * as THREE from 'three';
import { el, svg, clamp, commas, easeOut, easeOutQuint, easeBack, rng, Clip } from './UIKit.js';
import { icon } from './Icons.js';
import { Bar } from './Bar.js';
import { ENEMY_TEMPLATES, hudState, readArmiger, readTechniques, rollDamage } from './GameData.js';

const _v = new THREE.Vector3();

/** Project a world point to CSS pixels. Returns null when behind the camera. */
function project(p, camera, w, h) {
  _v.set(p.x, p.y, p.z).project(camera);
  if (_v.z > 1) return null;
  return { x: (_v.x * 0.5 + 0.5) * w, y: (-_v.y * 0.5 + 0.5) * h, depth: _v.z };
}

/**
 * Everything that only exists while fighting: lock-on reticle, world-anchored
 * enemy nameplates, the Armiger gauge, the techniques bar, floating damage
 * numbers and the big call-out banners.
 *
 * Reads live data from `Combat` / `Enemies` when those systems expose it and
 * otherwise drives a deterministic mock encounter so the combat HUD is always
 * renderable for captures.
 */
export class CombatHUD {
  /** @param {HTMLElement} parent */
  constructor(parent) {
    this.root = el('div.combat-layer');
    parent.appendChild(this.root);

    this.plateLayer = el('div.np-layer');
    this.dmgLayer = el('div.dmg-layer');
    this.root.appendChild(this.plateLayer);
    this.root.appendChild(this.dmgLayer);

    this.reticle = this._buildReticle();
    this.root.appendChild(this.reticle.node);

    this.armiger = this._buildArmiger();
    this.root.appendChild(this.armiger.node);

    // the tech rack is built on the first frame, once the RPG roster is up
    this.techs = { node: el('div.techs'), rows: [] };
    this.root.appendChild(this.techs.node);

    this.calloutNode = el('div.callout');
    this.calloutWord = el('div.co-word');
    this.calloutSub = el('div.co-sub');
    this.calloutRule = el('div.co-rule');
    this.calloutNode.appendChild(this.calloutWord);
    this.calloutNode.appendChild(this.calloutRule);
    this.calloutNode.appendChild(this.calloutSub);
    this.root.appendChild(this.calloutNode);
    this.callout = null;

    this.numbers = [];
    this.plates = [];
    this.mockEnemies = null;
    this.mockT = 0;
    this.mockSeq = 0;
    this.armigerVal = 0;
    this.lockOn = null;
    this.lockAge = 0;
  }

  // ---- construction ---------------------------------------------------
  _buildReticle() {
    const node = el('div.reticle');
    const s = svg('svg', { width: 120, height: 120, viewBox: '0 0 120 120' });
    // static square of corner brackets — reads as a lock, not as noise
    const brackets = svg('g');
    for (let i = 0; i < 4; i++) {
      brackets.appendChild(svg('path', {
        d: 'M-9.5 -22 L-22 -22 L-22 -9.5', fill: 'none', stroke: 'rgba(238,247,255,.95)',
        'stroke-width': 1.5, 'stroke-linecap': 'square',
        transform: `translate(60 60) rotate(${i * 90})`,
      }));
    }
    const ring = svg('circle', { cx: 60, cy: 60, r: 16.5, fill: 'none', stroke: 'rgba(178,212,250,.28)', 'stroke-width': 1 });
    const ring2 = svg('circle', {
      cx: 60, cy: 60, r: 27, fill: 'none', stroke: 'rgba(196,226,255,.55)', 'stroke-width': 1,
      'stroke-dasharray': '2 9.2', 'stroke-linecap': 'round',
    });
    const dot = svg('path', { d: 'M60 55.4 64 60 60 64.6 56 60Z', fill: 'rgba(244,250,255,.98)' });
    s.appendChild(ring); s.appendChild(ring2); s.appendChild(brackets); s.appendChild(dot);
    node.appendChild(s);
    return { node, svg: s, spin: brackets, ring2, dot };
  }

  _buildArmiger() {
    const node = el('div.armiger');
    const bar = new Bar({ cls: 'tall cut', chase: false }).tint('armiger');
    const pct = el('div.ar-pct', { text: '0%' });
    node.appendChild(el('div.ar-head', {}, [
      icon('armiger', { size: 15, stroke: 1.2 }),
      el('div.ar-lb', { text: 'Armiger' }),
      el('div.ar-note', { text: 'L1 + R1' }),
      pct,
    ]));
    node.appendChild(bar.node);
    return { node, bar, pct };
  }

  /**
   * Build the technique rack from the real party roster: one signature move per
   * companion, with its real tech-bar cost.
   * @param {object} game
   */
  _buildTechs(game) {
    const node = this.techs.node;
    const list = readTechniques(game);
    this.techs.rows = list.map((t, i) => {
      const b = new Bar({ cls: 'slim', chase: false });
      const row = el('div.tech', {}, [
        el('div.tk-ico', {}, [icon(t.icon, { size: 15, stroke: 1.25 })]),
        el('div.tk-body', {}, [
          el('div.tk-nm', { text: t.name }),
          el('div.tk-ow', { text: `${t.owner}   ·   ${t.cost} bar${t.cost === 1 ? '' : 's'}` }),
          b.node,
        ]),
        el('div.tk-key', { text: ['L1+□', 'L1+△', 'L1+○', 'L1+✕'][i] || '' }),
      ]);
      node.appendChild(row);
      return { row, bar: b, t };
    });
  }

  // ---- public API (called by the Combat system) -----------------------
  /**
   * Pop a floating damage number at a world position.
   * @param {{world:{x:number,y:number,z:number}, amount:number, crit?:boolean,
   *          kind?:'hit'|'crit'|'heal'|'taken', element?:string}} ev
   */
  damage(ev) {
    if (!ev || !ev.world) return;
    const crit = !!ev.crit || ev.kind === 'crit';
    const amount = Math.round(ev.amount ?? 0);
    const kind = ev.kind || (crit ? 'crit' : 'hit');
    const node = el(`div.dmg${crit ? '.crit' : ''}${kind === 'heal' ? '.heal' : ''}${kind === 'taken' ? '.taken' : ''}`);
    if (crit) node.appendChild(el('div.cx', { text: 'Critical' }));
    node.appendChild(el('div.dv', { text: commas(amount) }));
    const size = clamp(12.5 + Math.pow(amount, 0.34) * 1.55, 15, 27) * (crit ? 1.34 : 1);
    // set once — writing font-size every frame invalidates layout for every
    // live number, which is the whole cost of the layer in a busy fight
    node.style.fontSize = `${size.toFixed(1)}px`;
    this.dmgLayer.appendChild(node);
    const r = rng((this.mockSeq++ * 2654435761) >>> 0);
    this.numbers.push({
      node, crit,
      world: new THREE.Vector3(ev.world.x, ev.world.y, ev.world.z),
      // alternate the drift side so consecutive hits never stack on each other
      dx: (r() - 0.5) * 54 + (this.numbers.length % 2 ? 74 : -74),
      dy: -(34 + r() * 26),
      jx: (r() - 0.5) * 0.5, jy: 0.4 + r() * 0.7, jz: (r() - 0.5) * 0.5,
      size,
      clip: new Clip(crit ? 1.35 : 1.05),
    });
    if (this.numbers.length > 22) this._retire(this.numbers.shift());
  }

  /** Show a big centre call-out. @param {string} word @param {string} [sub] */
  callOut(word, sub = '') {
    this.callout = { word, sub, warm: /LINK|CHAIN|CRIT/i.test(word), clip: new Clip(0.34, 1.5) };
    this.calloutWord.textContent = word;
    this.calloutSub.textContent = sub;
    this.calloutNode.classList.toggle('warm', this.callout.warm);
  }

  /** @param {object|null} target object with `.position`, or null to clear */
  setLockOn(target) {
    if (target !== this.lockOn) this.lockAge = 0;
    this.lockOn = target;
  }

  /** @param {number} v 0..1 */
  setArmiger(v) { this.armigerVal = clamp(v, 0, 1); this._armigerDriven = true; }

  /** Rewind the stand-in encounter — used by the capture harness between shots. */
  resetDemo() {
    this.mockT = 0; this._beat = 0; this._didCall = false; this.mockEnemies = null;
    for (const n of this.numbers) this._retire(n);
    this.numbers.length = 0;
    this.callout = null;
    this.lockAge = 0;
  }

  // ---- per-frame ------------------------------------------------------
  /**
   * @param {number} dt seconds
   * @param {object} game
   * @param {number} appear 0..1 combat reveal
   */
  update(dt, game, appear) {
    const w = window.innerWidth, h = window.innerHeight;
    const cam = game.camera;
    const e = easeOut(appear);
    this.root.style.opacity = e.toFixed(3);

    // the stand-in encounter only runs while the combat layer is actually up,
    // and rewinds each time a fight starts, so captures land mid-flurry
    const active = appear > 0.01;
    if (active && !this._wasActive) this.resetDemo();
    this._wasActive = active;
    if (!active) { this.root.style.display = 'none'; return; }
    this.root.style.display = '';

    if (!this.techs.rows.length) this._buildTechs(game);

    const enemies = this._enemies(game);
    this._standIn(dt, game, enemies);
    this._syncPlates(enemies, cam, w, h, dt, game, appear);
    this._updateReticle(dt, game, cam, w, h, enemies, appear);
    this._updateNumbers(dt, cam, w, h);
    this._updateCallout(dt, h);

    // armiger — earned from damage dealt (see rpg/CombatBridge.js)
    if (!this._armigerDriven) {
      const gauge = readArmiger(game);
      const live = game.get?.('Combat')?.armiger;
      this.armigerVal = gauge != null ? clamp(gauge, 0, 1)
        : typeof live === 'number' ? clamp(live, 0, 1)
          : clamp(0.16 + game.time.now * 0.5, 0, 0.82);
    }
    this.armiger.bar.set(this.armigerVal, dt);
    const p = `${Math.round(this.armigerVal * 100)}%`;
    if (p !== this._armPct) { this.armiger.pct.textContent = p; this._armPct = p; }
    const full = this.armigerVal > 0.995;
    this.armiger.node.style.filter = full
      ? `drop-shadow(0 0 ${(8 + 6 * Math.sin(game.time.now * 7)).toFixed(1)}px rgba(150,206,255,.8))` : '';
    const ae = easeOut(clamp((appear - 0.08) / 0.7, 0, 1));
    this.armiger.node.style.transform = `translateX(${((1 - ae) * -22).toFixed(2)}px)`;
    this.armiger.node.style.opacity = ae.toFixed(3);

    // techniques — the tech bar is charged by PartyState while `inCombat`
    const hs = hudState(game);
    const bars = hs ? hs.techBars : null;
    this.techs.rows.forEach((r, i) => {
      const live = game.get?.('Combat')?.techniques?.[i];
      let ready = typeof live?.ready === 'number' ? live.ready : r.t.ready;
      if (bars != null && r.t.cost > 0) ready = clamp(game.get('Rpg').party.techCharge / r.t.cost, 0, 1);
      r.bar.set(ready, dt);
      const on = ready > 0.999;
      if (r._on !== on) { r.row.classList.toggle('ready', on); r._on = on; }
      const te = easeOut(clamp((appear - 0.12 - i * 0.05) / 0.62, 0, 1));
      r.row.style.opacity = te.toFixed(3);
      r.row.style.transform = `translateX(${((1 - te) * -20).toFixed(2)}px)`;
    });
  }

  // ---- internals ------------------------------------------------------
  /** Live enemies if the Enemies/Combat systems provide them, else mocks. */
  _enemies(game) {
    const live = game.get?.('Enemies')?.list;
    if (Array.isArray(live) && live.length) {
      // Nearest five, not the first five in spawn order: the plates should
      // describe what is in front of the player, not what spawned earliest.
      const cam = game.camera;
      const near = live.filter((e2) => !e2.dead).slice();
      if (cam) {
        near.sort((a, b) => {
          const pa = a.position || a.root?.position, pb = b.position || b.root?.position;
          if (!pa || !pb) return 0;
          return cam.position.distanceToSquared(pa) - cam.position.distanceToSquared(pb);
        });
      }
      return near.slice(0, 5).map((e2, i) => {
        const pos = e2.position || e2.root?.position || { x: 0, y: 0, z: 0 };
        const tpl = ENEMY_TEMPLATES[i % ENEMY_TEMPLATES.length];
        return {
          ref: e2,
          name: e2.name || tpl.name,
          level: e2.level ?? tpl.level,
          hp: e2.hp ?? tpl.hp, maxHp: e2.maxHp ?? tpl.maxHp,
          // the species carries its own elemental weakness; the template is
          // only a stand-in for enemies that have not declared one
          weak: e2.type?.weakness || e2.weak || tpl.weak,
          height: (e2.height ?? 2.0) * (e2.scale ?? 1),
          pos,
          alive: e2.hp == null || e2.hp > 0,
        };
      }).filter((x) => x.alive);
    }
    if (!this.mockEnemies) {
      const terrain = game.get?.('Terrain');
      const base = game.get?.('Player')?.position || { x: 0, y: 0, z: 0 };
      // lay the stand-ins out along the camera's forward axis so they frame up
      // sensibly for whatever shot is running
      const cam = game.camera;
      let fx = 0, fz = -1;
      if (cam) {
        const m = cam.matrixWorld.elements;
        const L = Math.hypot(m[8], m[10]) || 1;
        fx = -m[8] / L; fz = -m[10] / L;
      }
      const rx = -fz, rz = fx;
      // [distance ahead of the player, lateral offset, template]
      const layout = [[3.6, -1.5, 0], [5.4, 1.9, 1], [7.8, -3.2, 2]];
      this.mockEnemies = layout.map(([fwd, lat, ti], i) => {
        const x = base.x + fx * fwd + rx * lat;
        const z = base.z + fz * fwd + rz * lat;
        const y = terrain?.heightAt ? terrain.heightAt(x, z) : 0;
        const t = ENEMY_TEMPLATES[ti];
        return {
          name: t.name, level: t.level, hp: t.hp, maxHp: t.maxHp, weak: t.weak,
          height: i === 2 ? 2.8 : 1.9,
          pos: new THREE.Vector3(x, y, z), alive: true, mock: true, phase: i * 1.7,
        };
      });
    }
    return this.mockEnemies.filter((x) => x.alive);
  }

  /**
   * The capture stand-in: a fixed beat schedule of hits so a posed frame is
   * never an empty fight.
   *
   * It runs in exactly two situations — no enemy system at all (pure mocks) and
   * `Director`'s frozen screenshot scenarios, where the enemies are real but
   * nothing is swinging. During live play `CombatSystem` drives the numbers and
   * this does nothing.
   *
   * The *amounts* are not invented: every beat is resolved through
   * `Stats.computeDamage()` against the real target, so a posed frame prints the
   * same number the same swing would print in a real fight.
   */
  _standIn(dt, game, enemies) {
    if (!enemies.length) return;
    const posed = !!game.get?.('Enemies')?.frozen;
    if (!enemies[0].mock && !posed) return;

    this.mockT += dt;
    // mock enemies drift slightly so nameplates visibly track world space
    if (enemies[0].mock) {
      for (const e2 of enemies) {
        e2.pos.x += Math.sin(this.mockT * 0.9 + e2.phase) * dt * 0.42;
        e2.pos.z += Math.cos(this.mockT * 0.7 + e2.phase) * dt * 0.34;
      }
    }

    const beats = [0.18, 0.44, 0.70, 0.96, 1.26, 1.60, 1.98, 2.4];
    // motion values off the real sword combo: three light steps into a finisher
    const MOTION = [0.95, 1.1, 1.25, 1.85, 0.95, 1.1, 1.25, 1.85];
    if (this._beat == null) this._beat = 0;
    while (this._beat < beats.length && beats[this._beat] <= this.mockT) {
      const i = this._beat;
      const r = rng(9001 + i * 7919);
      const tgt = enemies[Math.floor(r() * enemies.length)] || enemies[0];
      const back = i % 4 === 2;
      const roll = tgt.ref ? rollDamage(game, tgt.ref, {
        motion: MOTION[i], weaponClass: 'sword', isBackAttack: back, seed: i * 37 + 11,
      }) : null;
      const amount = roll ? roll.damage : (back ? 900 + Math.floor(r() * 700) : 120 + Math.floor(r() * 260));
      const crit = roll ? roll.crit : back;
      tgt.hp = Math.max(1, tgt.hp - amount);
      if (tgt.ref) tgt.ref.hp = tgt.hp;
      this.damage({
        world: { x: tgt.pos.x, y: tgt.pos.y + tgt.height * 0.5, z: tgt.pos.z },
        amount, crit,
      });
      this._beat++;
    }
    if (!this._didCall && this.mockT > 0.55) {
      this.callOut('Blindside!', 'Attack from behind  ·  ×1.35 damage');
      this._didCall = true;
    }
  }

  _syncPlates(enemies, cam, w, h, dt, game, appear) {
    while (this.plates.length < enemies.length) {
      const bar = new Bar({ cls: 'slim cut' }).tint('hostile');
      const name = el('div.np-name');
      const lv = el('div.np-lv');
      const weak = el('div.np-weak');
      const node = el('div.nameplate', {}, [
        el('div.np-head', {}, [name, lv, weak]), bar.node,
      ]);
      this.plateLayer.appendChild(node);
      this.plates.push({ node, bar, name, lv, weak, key: '' });
    }
    for (let i = 0; i < this.plates.length; i++) {
      const pl = this.plates[i];
      const e2 = enemies[i];
      if (!e2) { if (pl._vis !== false) { pl.node.style.display = 'none'; pl._vis = false; } continue; }
      const sp = cam ? project({ x: e2.pos.x, y: e2.pos.y + e2.height + 0.55, z: e2.pos.z }, cam, w, h) : null;
      if (!sp || sp.x < -140 || sp.x > w + 140 || sp.y < -60 || sp.y > h + 60) {
        if (pl._vis !== false) { pl.node.style.display = 'none'; pl._vis = false; }
        continue;
      }
      if (pl._vis === false || pl._vis == null) { pl.node.style.display = ''; pl._vis = true; }
      const key = `${e2.name}|${e2.level}`;
      if (key !== pl.key) {
        pl.name.textContent = e2.name;
        pl.lv.textContent = `LV ${e2.level}`;
        pl.weak.textContent = '';
        if (e2.weak) pl.weak.appendChild(icon(e2.weak, { size: 12, stroke: 1.4 }));
        pl.key = key;
      }
      pl.bar.set(clamp(e2.hp / e2.maxHp, 0, 1), dt);
      // shrink with distance so far enemies do not shout
      const d = cam ? cam.position.distanceTo(e2.pos) : 10;
      const scale = clamp(1.18 - d * 0.022, 0.68, 1.06);
      const fade = clamp(1.35 - d * 0.026, 0.32, 1) * easeOut(clamp((appear - 0.2) / 0.6, 0, 1));
      // Plates wrap the enemy, so compare identity against the wrapped ref —
      // `this.lockOn` is the raw enemy and never equals its wrapper.
      const focus = !!(this.lockOn && (this.lockOn === e2 || this.lockOn === e2.ref
        || this.lockOn.ref === e2.ref));
      if (pl._focus !== focus) { pl.node.classList.toggle('focus', focus); pl._focus = focus; }
      const cx = clamp(sp.x, 92, w - 92);
      pl.node.style.transform = `translate(${cx.toFixed(1)}px, ${sp.y.toFixed(1)}px) scale(${scale.toFixed(3)})`;
      pl.node.style.opacity = (focus ? Math.min(1, fade + 0.28) : fade).toFixed(3);
    }
  }

  _updateReticle(dt, game, cam, w, h, enemies, appear) {
    let target = this.lockOn;
    // `Combat.lockOn` is the *setter method*; the current target is
    // `lockTarget`. Reading the method here made the reticle follow a function.
    const live = game.get?.('Combat')?.lockTarget;
    if (live) target = this._enemies(game).find((e) => e.ref === live) || target;
    if (!target && enemies.length) target = enemies[0];
    if (target !== this._lastTarget) { this.lockAge = 0; this._lastTarget = target; }
    this.lockAge += dt;

    const pos = target && (target.pos || target.position || target.root?.position);
    if (!pos || !cam) { this.reticle.node.style.display = 'none'; return; }
    const height = target.height ?? 1.7;
    const sp = project({ x: pos.x, y: pos.y + height * 0.55, z: pos.z }, cam, w, h);
    if (!sp) { this.reticle.node.style.display = 'none'; return; }
    this.reticle.node.style.display = '';
    const t = clamp(this.lockAge / 0.30, 0, 1);
    const pop = 1 + (1 - easeBack(t)) * 0.9;
    const spin = game.time.now * 22;
    this.reticle.spin.setAttribute('transform', `rotate(${((1 - easeOut(t)) * 22).toFixed(2)} 60 60)`);
    this.reticle.ring2.setAttribute('transform', `rotate(${(-spin).toFixed(2)} 60 60)`);
    const breathe = 1 + Math.sin(game.time.now * 3.4) * 0.018;
    this.reticle.node.style.transform =
      `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px) scale(${(pop * breathe).toFixed(3)})`;
    this.reticle.node.style.opacity = (easeOut(t) * easeOut(clamp(appear / 0.5, 0, 1))).toFixed(3);
  }

  _updateNumbers(dt, cam, w, h) {
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.clip.step(dt);
      if (!n.clip.alive) { this._retire(n); this.numbers.splice(i, 1); continue; }
      const t = n.clip.t;
      // world anchor drifts up and outward, screen offset arcs
      const wp = {
        x: n.world.x + n.jx * t, y: n.world.y + n.jy * t, z: n.world.z + n.jz * t,
      };
      const sp = cam ? project(wp, cam, w, h) : null;
      if (!sp) { n.node.style.opacity = '0'; continue; }
      const arc = -Math.sin(Math.PI * clamp(t * 1.15, 0, 1)) * 1;
      const x = clamp(sp.x + n.dx * easeOutQuint(t), 76, w - 76);
      const y = sp.y + n.dy * easeOut(t) * 0.55 + arc * n.dy * 0.55;
      const pop = t < 0.22 ? easeBack(t / 0.22) : 1 - (t - 0.22) * 0.16;
      const fade = t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28;
      n.node.style.transform =
        `translate(${(x - 0).toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%,-50%) scale(${clamp(pop, 0.01, 2).toFixed(3)})`;
      n.node.style.opacity = clamp(fade, 0, 1).toFixed(3);
    }
  }

  _retire(n) { if (n && n.node.parentNode) n.node.parentNode.removeChild(n.node); }

  /**
   * Drive the centre call-out. Every value is written from the clip's own
   * accumulated time, never a CSS transition.
   *
   * The punch is carried by **letter-spacing and opacity only**. It used to
   * also run a fractional `scale(1.14 -> 1.0)` on the word, which promoted the
   * glyph layer to its own raster and resampled it every frame; stacked on a
   * half-pixel `translate(-50%,-50%)` and an offset drop shadow, thin
   * 200-weight type read as two overlapping copies of itself over bright
   * desert. See the note above `.callout` in `ui.css`.
   *
   * @param {number} dt seconds
   * @param {number} h viewport height in css px
   */
  _updateCallout(dt, h) {
    const c = this.callout;
    if (!c) { this.calloutNode.style.opacity = '0'; return; }
    c.clip.step(dt);
    if (!c.clip.alive) { this.callout = null; this.calloutNode.style.opacity = '0'; return; }
    const t = c.clip.t;
    const age = c.clip.age;
    const out = clamp((age - (c.clip.dur + c.clip.hold - 0.4)) / 0.4, 0, 1);
    const ls = 0.62 - 0.20 * easeOutQuint(t);
    // the trailing letter-space is real box width, so an equal pad on the left
    // is what keeps the word optically centred while the tracking collapses
    this.calloutWord.style.letterSpacing = `${ls.toFixed(3)}em`;
    this.calloutWord.style.paddingLeft = `${ls.toFixed(3)}em`;
    this.calloutWord.style.opacity = (0.42 + 0.58 * easeOutQuint(t)).toFixed(3);
    // even widths only: `margin: auto` on an odd box centres on a half pixel
    const rw = easeOutQuint(clamp((age - 0.14) / 0.5, 0, 1)) * 300;
    this.calloutRule.style.width = `${Math.round(rw / 2) * 2}px`;
    this.calloutSub.style.opacity = easeOut(clamp((age - 0.22) / 0.4, 0, 1)).toFixed(3);
    this.calloutNode.style.opacity = (easeOut(clamp(age / 0.16, 0, 1)) * (1 - out)).toFixed(3);
    // integer scanline: a half-pixel top resamples every glyph in the block
    this.calloutNode.style.top = `${Math.round(h * 0.215 - out * 12)}px`;
  }
}
