import * as THREE from 'three';
import { speciesKeys, TYPES, entry as bestiaryEntry } from '../characters/enemies/Bestiary.js';
import { CAST, makeCharacter } from '../characters/Cast.js';
import { NPC_CAST } from '../characters/npc/NpcCast.js';
import { archetype, NpcBody } from '../characters/npc/NpcRig.js';
import { WEAPONS, Weapon } from '../combat/Weapons.js';
import { ACTIONS } from '../characters/rig/Anim.js';

/**
 * Step through every asset in the game, one at a time, on the isolation stage.
 *
 * Almost none of this is new machinery: the content families already have real
 * registries (`speciesKeys()` for 23 enemies, `CAST` for the four heroes,
 * `NPC_CAST` for eight townspeople, `WEAPONS` for five weapons), and
 * `EnemyBase.freeze(state, phase)` already exists as an animation-scrubbing
 * hook because the screenshot harness needed it. The browser mostly wires
 * things that were already there to a keyboard.
 *
 * The **review status** (`unreviewed / ok / flagged`, persisted) is the part
 * that makes this a review tool rather than a viewer. Without it you inspect
 * whatever you happen to remember; with it you can filter to what you have not
 * looked at yet and actually finish a pass over 40 assets.
 */

const ENEMY_POSES = ['idle', 'approach', 'telegraph', 'attack', 'flinch', 'stagger', 'death'];

export class AssetBrowser {
  /**
   * @param {HTMLElement} root
   * @param {object} game
   * @param {import('./Stage.js').Stage} stage
   */
  constructor(root, game, stage) {
    this.game = game;
    this.stage = stage;
    this.open = false;
    this.familyAt = 0;
    this.itemAt = 0;
    this.poseAt = 0;
    this.phase = 0.45;
    this.playing = false;
    this.status = load('dev.review', {});
    this.unreviewedOnly = false;

    this.families = [
      { id: 'enemies', keys: () => speciesKeys(), make: (k, at) => this._enemy(k, at), poses: () => ENEMY_POSES },
      { id: 'heroes', keys: () => Object.keys(CAST), make: (k, at) => this._hero(k, at), poses: () => Object.keys(ACTIONS) },
      { id: 'npcs', keys: () => Object.keys(NPC_CAST), make: (k, at) => this._npc(k, at), poses: () => [] },
      { id: 'weapons', keys: () => Object.keys(WEAPONS), make: (k, at) => this._weapon(k, at), poses: () => [] },
    ];

    this.node = document.createElement('div');
    this.node.className = 'dev-browser';
    root.appendChild(this.node);
    this.node.style.display = 'none';
  }

  get family() { return this.families[this.familyAt]; }

  /** Keys in the current family, honouring the unreviewed filter. */
  list() {
    const all = this.family.keys();
    if (!this.unreviewedOnly) return all;
    const f = this.family.id;
    const some = all.filter((k) => !this.status[`${f}/${k}`]);
    return some.length ? some : all;
  }

  setOpen(v) {
    this.open = !!v;
    this.node.style.display = this.open ? '' : 'none';
    if (this.open) { this.stage.enter(this.game); this.select(0); }
    else { this.stage.exit(this.game); this._release(); }
  }

  /** @param {number} d step within the current family */
  step(d) { this.select(this.itemAt + d); }

  /** @param {number} d step between families */
  stepFamily(d) {
    this.familyAt = (this.familyAt + d + this.families.length) % this.families.length;
    this.itemAt = 0;
    this.poseAt = 0;
    this.select(0);
  }

  /** @param {number} i */
  select(i) {
    const keys = this.list();
    if (!keys.length) return;
    this.itemAt = (i + keys.length) % keys.length;
    const key = keys[this.itemAt];
    this._release();
    this.error = null;

    // Stage in front of wherever the player is standing, so terrain grounding
    // and the light rig behave exactly as they do in the real game. The stage
    // hides the world afterwards, but the placement still has to be legal.
    const player = this.game.get('Player');
    const at = new THREE.Vector3();
    if (player && player.position) at.copy(player.position);
    at.z -= 6;

    try {
      const made = this.family.make(key, at);
      if (!made || !made.object) throw new Error('no object');
      this._made = made;
      this.stage.keyToSun(this.game);
      this.info = this.stage.show(made.object, made.pivot || at.clone().setY(at.y + 1));
      // Aim the subject at the camera *before* posing: `EnemyBase.freeze`
      // rewrites `root.rotation.y` from `heading` on every pose, so setting the
      // rotation directly would be undone by the very next pose change.
      if (made.kind === 'enemy') made.enemy.heading = this.stage.subjectYaw();
      else made.object.rotation.y = this.stage.subjectYaw();
      this.applyPose();
    } catch (err) {
      this.error = `${this.family.id}/${key}: ${(err && err.message) || err}`;
      console.warn('[dev]', this.error, err);
    }
    this.render();
  }

  /** Cycle the animation state for families that have one. */
  stepPose(d) {
    const poses = this.family.poses();
    if (!poses.length) return;
    this.poseAt = (this.poseAt + d + poses.length) % poses.length;
    this.applyPose();
    this.render();
  }

  applyPose() {
    const m = this._made;
    if (!m) return;
    const poses = this.family.poses();
    const pose = poses[this.poseAt];
    try {
      if (m.kind === 'enemy' && pose) m.enemy.freeze(pose, this.phase, null);
      else if (m.kind === 'hero' && pose) { m.character.play(pose, { hold: true }); }
    } catch (err) { console.warn('[dev] pose failed', pose, err); }
  }

  /** Mark the current asset reviewed. @param {'ok'|'flag'|null} v */
  mark(v) {
    const key = `${this.family.id}/${this.list()[this.itemAt]}`;
    if (v) this.status[key] = v; else delete this.status[key];
    save('dev.review', this.status);
    this.render();
  }

  // ------------------------------------------------------------- factories

  _enemy(key, at) {
    const enemies = this.game.get('Enemies');
    const e = enemies.spawn(key, { pos: [at.x, at.y, at.z], heading: 0 });
    enemies.frozen = true;
    this._spawned = { enemies, e };
    const pivotY = (e.stats && e.stats.height ? e.stats.height : 2) * 0.55;
    return { kind: 'enemy', enemy: e, object: e.root, pivot: e.root.position.clone().setY(e.root.position.y + pivotY) };
  }

  _hero(key, at) {
    const c = makeCharacter(key);
    c.root.position.copy(at);
    this._char = c;
    return { kind: 'hero', character: c, object: c.root, pivot: at.clone().setY(at.y + c.height * 0.55) };
  }

  _npc(key, at) {
    const arch = archetype(key, NPC_CAST[key]);
    const body = new NpcBody(arch, 7);
    body.root.position.copy(at);
    this._npcBody = body;
    return { kind: 'npc', body, object: body.root, pivot: at.clone().setY(at.y + (body.height || 1.75) * 0.55) };
  }

  _weapon(key, at) {
    const w = new Weapon(key);
    w.setReveal(1);
    w.root.position.copy(at).setY(at.y + 1.1);
    this._weaponObj = w;
    return { kind: 'weapon', weapon: w, object: w.root, pivot: w.root.position.clone() };
  }

  /** Return whatever the last selection built, so stepping cannot leak. */
  _release() {
    if (this._spawned) {
      try { this._spawned.enemies.despawn(this._spawned.e); } catch { /* pooled anyway */ }
      this._spawned = null;
    }
    if (this._char) { try { this._char.dispose(); } catch { /* ignore */ } this._char = null; }
    if (this._weaponObj) { try { this._weaponObj.dispose(); } catch { /* ignore */ } this._weaponObj = null; }
    this._npcBody = null;
    this._made = null;
    this.stage.clear();
  }

  // ------------------------------------------------------------- per frame

  update(dt) {
    if (!this.open) return;
    const m = this._made;
    if (!m) return;
    if (this.playing) {
      this.phase = (this.phase + dt * 0.6) % 1;
      if (m.kind === 'enemy') this.applyPose();
    }
    // Heroes and NPCs run their own animator; keep ticking it so a clip plays.
    try {
      if (m.kind === 'hero') m.character.update(dt, { speed: 0, velocity: null, turnRate: 0 });
      else if (m.kind === 'npc') m.body.update(dt, {});
    } catch { /* animator needs game state this stage does not have */ }
  }

  render() {
    if (!this.open) return;
    const keys = this.list();
    const key = keys[this.itemAt];
    const poses = this.family.poses();
    const st = this.status[`${this.family.id}/${key}`];
    const s = this.stage.stats();
    let extra = '';
    if (this.family.id === 'enemies') {
      try {
        const e = bestiaryEntry(key);
        if (e) extra = `${e.name} · ${e.faction} · lv ${e.level} · hp ${e.hp}`;
      } catch { /* not in the player-facing table */ }
    }
    this.node.innerHTML = `
      <div class="dev-b-head">
        <b>${this.family.id}</b> <span>${this.itemAt + 1}/${keys.length}</span>
        ${this.unreviewedOnly ? '<em>unreviewed only</em>' : ''}
      </div>
      <div class="dev-b-name">${key}${st ? ` <i class="${st}">${st}</i>` : ''}</div>
      ${extra ? `<div class="dev-b-sub">${extra}</div>` : ''}
      ${poses.length ? `<div class="dev-b-sub">pose <b>${poses[this.poseAt]}</b> ${this.playing ? '▶' : `@ ${this.phase.toFixed(2)}`}</div>` : ''}
      <div class="dev-b-sub">${s.tris.toLocaleString()} tris · ${s.meshes} mesh · ${s.materials} mat${s.bones ? ` · ${s.bones} bones` : ''}</div>
      ${this.error ? `<div class="dev-b-err">${this.error}</div>` : ''}
      <div class="dev-b-keys">
        <b>&larr;&rarr;</b> asset · <b>&uarr;&darr;</b> family · <b>,/.</b> pose ·
        <b>Space</b> play · <b>O</b> ok · <b>K</b> flag · <b>U</b> filter · <b>F4</b> close
      </div>`;
  }
}

const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) || f; } catch { return f; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
