/**
 * The contract `Ecology._layoutSites` publishes to the prop layer.
 *
 * `Ecology` authors a flat list of "places people have cleared" — a fuel stop,
 * a roadblock, a wreck, a grazing anchor — and four separate systems build on
 * it: `Outposts` and `Landmarks` put geometry there, `Hammerhead` grows a town
 * out of the `reststop`, and `Wildlife` circles birds over the `crashsite`.
 * None of them owns the list, so the shape lives here rather than in any one
 * of them.
 *
 * The extras are per-type and genuinely optional: `put('obelisk', …, { tall })`
 * writes `tall`, `beside(…)` writes `roadZ`/`side`/`yaw`, and a `graze` anchor
 * writes `count`/`seed`/`range`. Every consumer already defaults them
 * (`site.yaw || 0`, `site.roadZ ?? 25`), which is the honest reading: a wreck
 * has no herd size and never will.
 */

/** Every `type` the layout emits. A closed set: `Ecology` is the only author. */
export type SiteType =
  | 'haven' | 'obelisk' | 'shack' | 'truck' | 'regalia' | 'sign'
  | 'reststop' | 'blockade' | 'layby' | 'wreck' | 'crashsite'
  | 'outpost' | 'watertower' | 'ruins' | 'windpump' | 'graze';

export interface EcoSite {
  type: SiteType;
  x: number;
  z: number;
  /** Clearing radius: vegetation thins inside it, and `Hammerhead` widens it. */
  r: number;
  /** Ground height at `(x, z)` when the site was laid out. */
  y: number;

  /** `obelisk` only: column height. */
  tall?: number;
  /** Facing, radians. Written by `beside()` and by the sites that need one. */
  yaw?: number;
  /** The road station the site was placed against. */
  roadZ?: number;
  /** Which shoulder of the road, ±1 (0 straddles it). */
  side?: number;
  /** `wreck` only: which of the two car bodies. */
  kind?: number;
  /** `graze` only: herd size. */
  count?: number;
  /** `graze` only: herd seed. */
  seed?: number;
  /** `graze` only: how far the herd wanders from the anchor, metres. */
  range?: number;
}

/**
 * A site placed with `Ecology`'s `beside()` helper, which always writes the
 * road station and shoulder. Builders that steer off the road -- the highway
 * signs, and anything that has to face traffic -- require this, not the loose
 * `EcoSite`, so the requirement is written down rather than defaulted away.
 */
export type RoadsideSite = EcoSite & { roadZ: number, side: number };
