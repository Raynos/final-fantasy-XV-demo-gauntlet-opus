/**
 * One answer to "how many MSAA samples will the scene target have", available
 * to anyone, importing nothing.
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
 * It reads `?q=` because that is the only thing that ever sets the tier:
 * `Renderer` takes `opts.quality || params.get('q') || 'high'` and has exactly
 * one call site, in `Game.ts`, which passes no options. If a second call site
 * ever passes `opts.quality` this stops being exact — thread the tier through
 * rather than adding a second guess. `PostFX._wantSamples` warns at boot if the
 * two ever disagree, so the failure is loud instead of being a silhouette that
 * is subtly wrong on one tier and nobody's fault.
 *
 * `?post=nomsaa` returns 0 from here as well as from `PostFX`, so the ablation
 * turns off *both* halves and measures the mechanism rather than one end of it.
 */
export function sceneSamples(): number {
  if (typeof location === 'undefined') return 0;
  const params = new URLSearchParams(location.search);
  const post = (params.get('post') || '').toLowerCase();
  if (post.split(',').some((t) => t.trim() === 'nomsaa')) return 0;
  switch (params.get('q') || 'high') {
    case 'low': return 0;
    case 'medium': return 2;
    case 'ultra': return 8;
    // 'high', and anything unrecognised — `Renderer` falls back to 'high' too.
    default: return 4;
  }
}
