import * as THREE from 'three';
import { TYPES, speciesKeys } from '../characters/enemies/Bestiary.ts';
import { isPoseName } from '../characters/enemies/EnemyBase.ts';
import { CAST, makeCharacter } from '../characters/Cast.ts';
import { NPC_CAST } from '../characters/npc/NpcCast.ts';
import { archetype, NpcBody } from '../characters/npc/NpcRig.ts';
import { WEAPONS, Weapon } from '../combat/Weapons.ts';
import { ACTIONS } from '../characters/rig/Anim.ts';
import { buildChocoboPrototype, chocoboColours, CHOCOBO_COLOURS } from '../characters/chocobo/ChocoboRig.ts';
import { isMesh } from '../util/three-guards.ts';
import { ModelStage } from './ModelStage.ts';
import type { Freecam } from '../dev/Freecam.ts';
import type { Enemy } from '../characters/enemies/EnemyBase.ts';
import type { Character } from '../characters/rig/Character.ts';
import type { Game } from '../game/Game.ts';

/**
 * Model Explorer: every portable model in the game, alone, with **no game**.
 *
 * ## The v1 mistake this exists to undo
 *
 * v1 wrapped `dev/AssetBrowser`, which spawns an enemy through
 * `Enemies.spawn()` — a pool that belongs to a booted game — and staged it with
 * `dev/Stage`, which hides a world that only existed because thirty systems had
 * been booted to get here. To look at one creature, v1 built terrain,
 * vegetation, props, a party, a combat system and a HUD, then hid them.
 *
 * Here **zero game systems are booted.** Every factory below is standalone and
 * always was; v1 simply never called them directly:
 *
 * | family   | factory                                        |
 * |----------|------------------------------------------------|
 * | Party    | `makeCharacter(key)`                            |
 * | NPCs     | `new NpcBody(archetype(key, def), 7)`           |
 * | Weapons  | `new Weapon(key)`                               |
 * | Chocobo  | `buildChocoboPrototype(colours)`                |
 * | Enemies  | `TYPES[key].make(...)` + `attachVisual(buildPrototype())` |
 *
 * Enemies were the one real coupling, and it is not to the *system* — it is to
 * `Enemies.prototype()`, a `Map` cache in front of `type.buildPrototype()`.
 * That cache is eleven lines and is reproduced here, so a species is built once
 * per session whether or not a game exists.
 *
 * ## What is kept from v1, because it was right
 *
 * The persisted `unreviewed / ok / flag` verdict, which is what makes this a
 * review tool rather than a viewer — without it you inspect whatever you happen
 * to remember and a pass over 50 assets never finishes. Counts read from the
 * registry at runtime, never written down: three sources once said 8, 17 and 18
 * for the same list. And the facing pin, whose reason is in `pinFacing`.
 */

/** One content family, as the shell renders it. */
export interface FamilyView {
  id: string;
  title: string;
  /** Counted now, from the registry. Never a constant. */
  count: number;
  poses: string[];
}

/** What one staged subject costs, read off the live object. */
export interface SubjectCost {
  tris: number;
  /** Meshes: the honest draw-call floor before instancing and batching. */
  meshes: number;
  materials: number;
  /** Longest axis of the bind-pose bounds, metres. */
  size: number;
}

/** Whatever the current selection built. */
type Made =
  | { kind: 'enemy', object: THREE.Object3D, enemy: Enemy }
  | { kind: 'hero', object: THREE.Object3D, character: Character }
  | { kind: 'plain', object: THREE.Object3D };

interface Family {
  id: string;
  title: string;
  keys(): string[];
  make(key: string): Made;
  poses(): string[];
}

const ENEMY_POSES = ['idle', 'approach', 'telegraph', 'attack', 'flinch', 'stagger', 'death'];

export type ReviewMark = 'ok' | 'flag';

function load<T>(k: string, fallback: T): T {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
function save(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode; a verdict is not worth throwing over */ }
}

export class ModelExplorer {
  game: Game;
  stage: ModelStage;
  families: Family[];
  /** Family index, or null while the family list itself is showing. */
  familyAt: number | null;
  itemAt: number;
  poseAt: number;
  /** Frozen animation phase, 0..1. */
  phase: number;
  /** Verdicts by `family/key`, persisted. */
  status: Record<string, ReviewMark | undefined>;
  unreviewedOnly: boolean;
  error: string | null;
  _made: Made | null;
  _framing: { size: number } | null;
  /**
   * Built species prototypes, by prototype key.
   *
   * The eleven lines of `Enemies.prototype()` that were the family's only real
   * tie to a booted game. @see the class header.
   */
  _protos: Map<string, ReturnType<(typeof TYPES)[keyof typeof TYPES]['buildPrototype']>>;

  constructor(game: Game) {
    this.game = game;
    this.stage = new ModelStage();
    this.familyAt = null;
    this.itemAt = 0;
    this.poseAt = 0;
    this.phase = 0.45;
    this.status = load('dev.review', {} as Record<string, ReviewMark | undefined>);
    this.unreviewedOnly = false;
    this.error = null;
    this._made = null;
    this._framing = null;
    this._protos = new Map();

    this.families = [
      { id: 'enemies', title: 'Enemies', keys: () => speciesKeys(), make: (k) => this._enemy(k), poses: () => ENEMY_POSES },
      { id: 'heroes', title: 'Party', keys: () => Object.keys(CAST), make: (k) => this._hero(k), poses: () => Object.keys(ACTIONS) },
      { id: 'npcs', title: 'NPCs', keys: () => Object.keys(NPC_CAST), make: (k) => this._npc(k), poses: () => [] },
      { id: 'weapons', title: 'Weapons', keys: () => Object.keys(WEAPONS), make: (k) => this._weapon(k), poses: () => [] },
      { id: 'chocobo', title: 'Chocobo', keys: () => CHOCOBO_COLOURS.map((c) => c.name || 'chocobo'), make: (k) => this._chocobo(k), poses: () => [] },
    ];
  }

  /* --------------------------------------------------------------- listing */

  families_(): FamilyView[] {
    return this.families.map((f) => ({ id: f.id, title: f.title, count: f.keys().length, poses: f.poses() }));
  }

  get family() { return this.families[this.familyAt ?? 0]; }

  keys(): string[] {
    if (this.familyAt == null) return [];
    const all = this.family.keys();
    if (!this.unreviewedOnly) return all;
    const some = all.filter((k) => !this.status[`${this.family.id}/${k}`]);
    return some.length ? some : all;
  }

  markOf(key: string): string {
    if (this.familyAt == null) return 'unreviewed';
    return this.status[`${this.family.id}/${key}`] || 'unreviewed';
  }

  current(): string | null {
    const keys = this.keys();
    return keys.length ? keys[Math.min(this.itemAt, keys.length - 1)] : null;
  }

  pose(): string | null {
    if (this.familyAt == null) return null;
    const poses = this.family.poses();
    return poses.length ? poses[this.poseAt] : null;
  }

  /* ------------------------------------------------------------- lifecycle */

  enter() { this.stage.enter(this.game.scene); }

  exit() {
    this.stage.exit(this.game.scene);
    this._made = null;
    this.familyAt = null;
  }

  openFamily(i: number) {
    this.familyAt = i;
    this.itemAt = 0;
    this.poseAt = 0;
    this.select(0);
  }

  /**
   * Build one asset and put it on the turntable.
   *
   * A failure is **reported, never thrown**: BRIEF rule 5 exits a capture
   * non-zero on a page error, and one broken species must not take the studio
   * down with it.
   */
  select(i: number) {
    const keys = this.keys();
    if (!keys.length) return;
    this.itemAt = (i + keys.length) % keys.length;
    const key = keys[this.itemAt];
    this.error = null;
    this.stage.clear();
    this._made = null;
    try {
      const made = this.family.make(key);
      if (!made || !made.object) throw new Error('no object');
      this._made = made;
      this._framing = this.stage.show(made.object);
      // The enemy's three-quarter, set once, here.
      //
      // `pinFacing` writes `object.rotation.y` every frame for everything else,
      // and must not for an enemy: `EnemyBase.freeze` rewrites the root's
      // rotation from `heading` on every pose, so a pin would be overwritten
      // the moment a pose was applied and the two would fight. v1 set `heading`
      // and let `freeze` do the turning; v2's `_enemy()` left it at 0 and
      // nothing put it back, so every creature in the roster staged dead-on —
      // the least informative angle there is.
      //
      // After `show()`, because `subjectYaw()` reads `faceOffset`, which
      // `show()` derives from the bounds: a long-bodied quadruped needs 1.25 rad
      // where a biped needs 0.7. Before `applyPose()`, because that is the call
      // that turns it.
      if (made.kind === 'enemy') made.enemy.heading = this.stage.subjectYaw();
      this.applyPose();
    } catch (err: unknown) {
      this.error = `${this.family.id}/${key}: ${err instanceof Error ? err.message : String(err)}`;
      console.warn('[studio]', this.error, err);
    }
  }

  step(d: number) { this.select(this.itemAt + d); }

  stepPose(d: number) {
    const poses = this.familyAt == null ? [] : this.family.poses();
    if (!poses.length) return;
    this.poseAt = (this.poseAt + d + poses.length) % poses.length;
    this.applyPose();
  }

  applyPose() {
    const m = this._made;
    if (!m) return;
    const pose = this.pose();
    if (!pose) return;
    try {
      if (m.kind === 'enemy' && isPoseName(pose)) m.enemy.freeze(pose, this.phase, null);
      else if (m.kind === 'hero') m.character.play(pose, { hold: true });
    } catch (err) { console.warn('[studio] pose failed', pose, err); }
  }

  mark(v: ReviewMark | null) {
    const key = this.current();
    if (this.familyAt == null || !key) return;
    const id = `${this.family.id}/${key}`;
    if (v) this.status[id] = v; else delete this.status[id];
    save('dev.review', this.status);
  }

  /* ------------------------------------------------------------------ tick */

  update(dt: number, cam: Freecam) {
    this.stage.update(dt, cam);
    this.pinFacing();
  }

  /**
   * Keep the subject turned toward the reviewer. Every frame, not once.
   *
   * The party staged with its back to the camera in v1 and two attempts to fix
   * it by eye disagreed with each other, so `_probe/rigforward.mts` measured it
   * from the one landmark unambiguously on the front of a head: **Noctis's eye
   * meshes sit at local z = +0.073.** The rig faces +Z and the camera azimuth
   * plus the three-quarter offset was always the right *value*.
   *
   * What was wrong is that the value did not stick — a held animation drives
   * the root every frame, the same way `EnemyBase.freeze` rewrites rotation
   * from `heading`. Hence a pin. Enemies are excluded because `freeze` owns
   * their heading and they measured correct.
   */
  pinFacing() {
    const m = this._made;
    if (!m || m.kind === 'enemy') return;
    m.object.rotation.y = this.stage.subjectYaw();
  }

  /* ------------------------------------------------------------------ cost */

  /**
   * What the staged subject costs.
   *
   * **Meshes**, not "draw calls": a mesh is the floor a renderer can reach, and
   * what a frame submits depends on instancing, batching and culling that only
   * a real scene knows. An honest lower bound beats a number wrong in a
   * direction nobody can predict. Materials are counted by uuid, because two
   * meshes sharing one cost one program.
   */
  cost(): SubjectCost | null {
    const m = this._made;
    if (!m) return null;
    let tris = 0;
    let meshes = 0;
    const mats = new Set<string>();
    m.object.traverse((o: THREE.Object3D) => {
      if (!isMesh(o)) return;
      meshes++;
      const g = o.geometry;
      const pos = g?.attributes?.position;
      if (g?.index) tris += g.index.count / 3;
      else if (pos) tris += pos.count / 3;
      const mat = o.material;
      for (const one of Array.isArray(mat) ? mat : [mat]) if (one?.uuid) mats.add(one.uuid);
    });
    return { tris: Math.round(tris), meshes, materials: mats.size, size: this._framing?.size ?? 0 };
  }

  /* -------------------------------------------------------------- factories */

  /**
   * One enemy, with no `Enemies` system anywhere.
   *
   * `TYPES[key].make()` builds the instance and `buildPrototype()` builds the
   * shared visual; `Enemies` only ever put a `Map` between them, which is
   * reproduced in `_protos`. The prototype is passed as-is rather than cloned,
   * exactly as the game does — only one subject is ever on the turntable, so
   * there is nobody to share it with.
   */
  _enemy(key: string): Made {
    const type = TYPES[key as keyof typeof TYPES];
    if (!type) throw new Error(`unknown enemy ${key}`);
    const pk = type.protoKey || key;
    let proto = this._protos.get(pk);
    if (!proto) { proto = type.buildPrototype(); this._protos.set(pk, proto); }
    const e = type.make({ id: 0, heading: 0, scale: 1 });
    e.attachVisual(proto);
    e.root.position.set(0, 0, 0);
    e.heading = 0;
    return { kind: 'enemy', object: e.root, enemy: e };
  }

  _hero(key: string): Made {
    const c = makeCharacter(key);
    c.root.position.set(0, 0, 0);
    return { kind: 'hero', object: c.root, character: c };
  }

  _npc(key: string): Made {
    const body = new NpcBody(archetype(key, NPC_CAST[key as keyof typeof NPC_CAST]), 7);
    body.root.position.set(0, 0, 0);
    return { kind: 'plain', object: body.root };
  }

  _weapon(key: string): Made {
    const w = new Weapon(key);
    w.setReveal(1);
    w.root.position.set(0, 0, 0);
    return { kind: 'plain', object: w.root };
  }

  _chocobo(name: string): Made {
    const col = CHOCOBO_COLOURS.find((c) => (c.name || 'chocobo') === name) || chocoboColours('default');
    // The chocobo factory hands back a rig record, not an Object3D; the studio
    // only wants the thing that can be put in a scene.
    const proto = buildChocoboPrototype(col);
    proto.group.position.set(0, 0, 0);
    return { kind: 'plain', object: proto.group };
  }
}
