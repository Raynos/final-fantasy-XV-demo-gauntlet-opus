import * as THREE from 'three';
import { AssetBrowser } from '../dev/AssetBrowser.ts';
import { isMesh } from '../util/three-guards.ts';
import type { Stage } from '../dev/Stage.ts';
import type { Game } from '../game/Game.ts';

/**
 * Model Explorer: every portable model in the game, one at a time, on a stage.
 *
 * ## What "portable" means, and why it is the boundary
 *
 * This section holds what exists independent of any *place* — heroes, enemies,
 * NPCs, weapons, the chocobo, the Regalia. A turntable does not lie about any
 * of those. Havens, tombs, imperial bases and landmarks are deliberately **not**
 * here: they only mean anything where the ecology put them, and a haven on a
 * turntable cannot show you that its canopy letterboxes the camera from the
 * tent deck — which is a real bug, measured in `_probe/w3bhaven.mts`. Those
 * belong to the World Explorer's in-situ view.
 *
 * ## Almost none of this is new machinery
 *
 * `src/dev/AssetBrowser.ts` already steps four families on `src/dev/Stage.ts`
 * with a persisted `unreviewed / ok / flagged` verdict per asset, and that
 * verdict is what makes it a review tool rather than a viewer: without it you
 * inspect whatever you happen to remember and a pass over 40 assets never
 * finishes. This class wraps it rather than reimplementing it, and adds the
 * three things a studio needs that a keyboard overlay did not:
 *
 *  - **a hierarchy** — families as a first-class list, so a shell can render
 *    "Enemies 23" and drill in, rather than cycling with `[` and `]`;
 *  - **counts read at runtime**, never from a constant. `AssetBrowser`'s own
 *    header says "eight townspeople" and `NPC_CAST` has 17. A number written
 *    down goes stale; a number counted cannot;
 *  - **the cost of the thing you are looking at** — triangles, draw calls and
 *    materials for *this subject*, which is what BRIEF rule 3's 250-draw and
 *    2.5 M-triangle phone budgets are actually spent on.
 *
 * `AssetBrowser` renders its own `.dev-browser` panel, so it is constructed
 * against a detached node here: the studio draws its own chrome and there must
 * never be two panels describing one selection.
 */

/** One family as a shell renders it. */
export interface FamilyView {
  id: string;
  /** What the studio calls it, which is not always what the registry does. */
  title: string;
  /** Counted now, from the registry. @see the class header */
  count: number;
  /** Animation states, empty for families that do not animate. */
  poses: string[];
}

/** What one staged subject costs. All read off the live object. */
export interface SubjectCost {
  tris: number;
  /** Meshes, which is the draw-call floor before instancing and batching. */
  meshes: number;
  materials: number;
  /** Metres, longest axis of the bind-pose bounds. */
  size: number;
}

/** Studio-facing titles. The registry ids are lowercase plurals. */
const TITLES: Record<string, string> = {
  enemies: 'Enemies',
  heroes: 'Party',
  npcs: 'NPCs',
  weapons: 'Weapons',
};

export class ModelExplorer {
  game: Game;
  browser: AssetBrowser;
  /** Detached, so `AssetBrowser`'s own panel is never in the document. */
  _panel: HTMLElement;
  /** Family index, or null while the family list itself is showing. */
  familyAt: number | null;

  constructor(game: Game, stage: Stage) {
    this.game = game;
    this._panel = document.createElement('div');
    this.browser = new AssetBrowser(this._panel, game, stage);
    this.familyAt = null;
  }

  /** Take the stage. Idempotent — a shell may re-enter a section. */
  enter() {
    if (!this.browser.open) this.browser.setOpen(true);
  }

  exit() {
    if (this.browser.open) this.browser.setOpen(false);
    this.familyAt = null;
  }

  /* -------------------------------------------------------------- listing */

  families(): FamilyView[] {
    return this.browser.families.map((f) => ({
      id: f.id,
      title: TITLES[f.id] || f.id,
      // Counted every call. See the class header for what happens otherwise.
      count: f.keys().length,
      poses: f.poses(),
    }));
  }

  /** Keys in the open family, honouring the browser's unreviewed filter. */
  keys(): string[] {
    return this.familyAt == null ? [] : this.browser.list();
  }

  /** `unreviewed` | `ok` | `flag` for one key of the open family. */
  markOf(key: string): string {
    if (this.familyAt == null) return 'unreviewed';
    return this.browser.status[`${this.browser.family.id}/${key}`] || 'unreviewed';
  }

  /* ------------------------------------------------------------ selection */

  openFamily(i: number) {
    this.familyAt = i;
    this.browser.familyAt = i;
    this.browser.itemAt = 0;
    this.browser.poseAt = 0;
    this.browser.select(0);
  }

  select(i: number) { this.browser.select(i); }
  step(d: number) { this.browser.step(d); }
  stepPose(d: number) { this.browser.stepPose(d); }
  mark(v: 'ok' | 'flag' | null) { this.browser.mark(v); }

  /** The key on the stage right now, or null. */
  current(): string | null {
    const keys = this.keys();
    return keys.length ? keys[this.browser.itemAt] : null;
  }

  /** The animation state on the stage right now, or null for a still family. */
  pose(): string | null {
    const poses = this.familyAt == null ? [] : this.browser.family.poses();
    return poses.length ? poses[this.browser.poseAt] : null;
  }

  /** Whatever went wrong building the current subject, for a shell to print. */
  error(): string | null { return this.browser.error; }

  /* -------------------------------------------------------------- facing */

  /**
   * Keep the subject turned toward the reviewer. Called every frame.
   *
   * The party staged with its back to the reviewer, and two attempts to correct
   * that by eye disagreed with each other — which is the signal to stop looking
   * at pictures. `_probe/rigforward.mts` measured it instead, from the one
   * landmark that is unambiguously on the front of a head: **Noctis's eye
   * meshes sit at local z = +0.073.** So the party rig faces +Z, exactly as
   * `Stage.subjectYaw()`'s comment claims, and the *value* was never wrong —
   * `subjectYaw()` (camera azimuth 1.554 plus the 0.7 rad three-quarter turn)
   * is the right number, and the half-turn that looked like the obvious fix put
   * the subject 180 degrees out.
   *
   * What was wrong is that the value did not **stick**. `AssetBrowser` already
   * carries this lesson for enemies — "`EnemyBase.freeze` rewrites
   * `root.rotation.y` from `heading` on every pose" — and a hero's held
   * animation drives its root the same way, so a rotation written once at
   * selection is gone by the time anybody looks at it. Hence a pin, every
   * frame, after the stage has moved the camera.
   */
  pinFacing() {
    const made = this.browser._made;
    if (!made) return;
    // Enemies are turned through `heading`, which `freeze` is the authority
    // for; writing `rotation.y` under it would be undone and would also
    // desynchronise the pose. Leave them alone — measured facing correctly.
    if (made.kind === 'enemy') return;
    made.object.rotation.y = this.browser.stage.subjectYaw();
  }

  /* ---------------------------------------------------------------- cost */

  /**
   * What the staged subject costs, read off the live object.
   *
   * `meshes` rather than "draw calls": a mesh is the floor a renderer can get
   * to, and what the frame actually submits depends on instancing, batching and
   * culling that only the real scene knows. Reporting the honest lower bound
   * beats reporting a number that is wrong in a direction nobody can predict.
   *
   * Materials are counted by identity, because two meshes sharing one material
   * cost one program and two that merely look alike cost two — and a material
   * count that double-counts is exactly how a model looks cheap and is not.
   */
  cost(): SubjectCost | null {
    const made = this.browser._made;
    if (!made || !made.object) return null;
    let tris = 0;
    let meshes = 0;
    const mats = new Set<string>();
    made.object.traverse((o: THREE.Object3D) => {
      if (!isMesh(o)) return;
      meshes++;
      const g = o.geometry;
      const pos = g?.attributes?.position;
      if (g?.index) tris += g.index.count / 3;
      else if (pos) tris += pos.count / 3;
      const m = o.material;
      for (const one of Array.isArray(m) ? m : [m]) if (one?.uuid) mats.add(one.uuid);
    });
    const info = this.browser.info;
    const size = info ? Math.max(info.size.x, info.size.y, info.size.z) : 0;
    return { tris: Math.round(tris), meshes, materials: mats.size, size };
  }
}
