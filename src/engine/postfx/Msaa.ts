import { demoActive, resolveQualityTier } from '../Device.ts';

/**
 * One answer to "how many MSAA samples will the scene target have", available
 * to anyone. It imports only `Device`, which is itself a leaf.
 *
 * `PostFX.rtScene`'s sample count and `VegMaterial`'s `alphaToCoverage` are two
 * halves of a single mechanism — read the `rtScene` block in `PostFX.ts` for
 * what it is and why. The awkward part is that the two halves are decided at
 * opposite ends of boot: `Game` builds `Vegetation` at step four and
 * constructs `PostFX` after every system has booted, so the material that
 * carries the first half cannot ask the object that carries the second.
 *
 * Hence a free function, and hence its own file: `VegMaterial` importing a
 * value out of `PostFX.ts` would drag the whole composer graph into the
 * vegetation chunk and invite an import cycle. This module imports nothing at
 * all, so both sides can have it for free.
 *
 * **Setting `alphaToCoverage` when this returns 0 is not harmless.** The
 * hardware half is a strict no-op with one sample — GLES 3.0 skips multisample
 * fragment operations when `SAMPLE_BUFFERS` is zero — but the *shader* half is
 * not: three still defines `ALPHA_TO_COVERAGE`, `patchVeg`'s coverage ramp
 * still runs, and on an opaque material a fractional alpha then does exactly
 * one thing, which is move where the discard happens. The silhouette would
 * come out a ramp-width fatter and every bit as hard. `low` therefore must not
 * set the flag at all, and this is what tells it so.
 *
 * It used to read `?q=` directly, on the reasoning that `?q=` was the only
 * thing that ever set the tier. That stopped being true when the phone demo
 * gained device detection: a detected phone resolves to `low` with no `?q=` in
 * the URL at all, so this function would have returned 4 while `Renderer` ran
 * at `low` — the exact disagreement the old comment here asked the next person
 * to avoid. It now calls `resolveQualityTier()`, which is the single source of
 * truth for both. `PostFX._wantSamples` still warns at boot if the two ever
 * drift apart, so the failure stays loud rather than becoming a silhouette
 * that is subtly wrong on one tier and nobody's fault.
 *
 * `?post=nomsaa` returns 0 from here as well as from `PostFX`, so the ablation
 * turns off *both* halves and measures the mechanism rather than one end of it.
 */
export function sceneSamples(): number {
  if (typeof location === 'undefined') return 0;
  const params = new URLSearchParams(location.search);
  const post = (params.get('post') || '').toLowerCase();
  if (post.split(',').some((t) => t.trim() === 'nomsaa')) return 0;
  // The phone is the one place where MSAA is close to free and badly needed.
  // Handset GPUs are tile-based: they resolve multisampling inside tile memory
  // and never pay the bandwidth a desktop immediate-mode GPU pays for it. And
  // it is needed because the demo renders well under the panel's native
  // resolution, so every silhouette in the game -- a chocobo's neck, a bare
  // tree, a sabertusk -- arrives as stair-steps that no post-process AA fully
  // hides. The device frames were unambiguous about it.
  if (demoActive()) return 4;
  switch (resolveQualityTier()) {
    case 'low': return 0;
    case 'medium': return 2;
    case 'ultra': return 8;
    // 'high', and anything unrecognised — `Renderer` falls back to 'high' too.
    default: return 4;
  }
}
