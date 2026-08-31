/**
 * What kind of machine is this, and are we running the phone demo?
 *
 * A leaf module: it imports nothing but the DOM, so anything may import it —
 * including `Renderer`, which runs before every system exists.
 *
 * ## Why the answer is memoised
 *
 * `demoActive()` resolves **once**, at module evaluation, and never changes.
 * A predicate that can answer differently at two points in a session is a bug
 * class this repository has already paid for: `Triggers.ts:118-135` records a
 * memo taken before the world could answer, and `LANDMINES.md` carries three
 * more. The demo decides the render tier, the vegetation radius and which
 * texture container a key lives in — three things that are read at different
 * moments during boot and must agree.
 *
 * ## Why the auto-detect is a conjunction
 *
 * All three legs must hold. That is deliberately conservative, because there
 * is no in-game way back: a desktop that guessed "phone" would silently get a
 * smaller world and no explanation. Headless Chromium at 1600x900 fails every
 * leg, so the 21-gate suite cannot drift into the demo by accident; a
 * touchscreen laptop fails the size leg; an iPad fails it too, and gets the
 * full game, which is the intent.
 *
 * No user-agent sniffing. `navigator.userAgentData.mobile` does not exist in
 * Safari — i.e. on the one platform a UA test would exist to serve — and a UA
 * regex is a maintenance liability with no gate that can catch it rotting.
 */
// Type-only, deliberately. `Renderer` imports this module for
// `resolveQualityTier`, so a value import here would close a runtime cycle.
// `import type` is erased, so at runtime `Device` still imports nothing.
import type { QualityTier } from './Renderer.ts';

/**
 * The tier names, duplicated from `Renderer` for the reason above.
 *
 * `QUALITY_TIERS` there stays the exported set every other file narrows
 * against; this is a private copy that exists only so this module can stay a
 * runtime leaf. If a tier is ever added, both move — the type import means
 * the compiler says so.
 */
const TIERS: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];

/**
 * How far past a POI kit the player must get before the demo throws it away.
 *
 * This is the whole world on a phone, not a slice of it — the size of Eos was
 * the best thing the demo had, and fencing it off to save memory would have
 * spent the wrong thing. What bounds memory instead is eviction: `PoiKits`
 * already streams a kit in one-per-frame inside its build radius, and this is
 * the missing bookend.
 *
 * Comfortably outside `PoiKits.BUILD_R` (1500 m) so the two never fight: a kit
 * that keeps crossing a single threshold would rebuild every few seconds, and
 * a rebuild is the expensive direction.
 */
export const KEEP_R = 2600;

function params(): URLSearchParams {
  return typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
}

/**
 * Is this a phone-shaped device? All three legs, see the file docblock.
 *
 * `screen` rather than `innerWidth` because a phone browser's inner size moves
 * with the URL bar; the screen does not.
 */
function isPhoneLike(): boolean {
  if (typeof navigator === 'undefined' || typeof screen === 'undefined') return false;
  const touch = (navigator.maxTouchPoints || 0) > 0;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  // 560, not 500. The short edge of a phone in CSS px runs 375 (SE) to 440
  // (Pro Max / large Android), and a browser in landscape with the chrome
  // showing reports the *screen*, not the viewport -- but a foldable open, or
  // a phone reporting a scaled display, can read higher than 500 and would
  // have been served the desktop build with no controls at all. An iPad mini
  // is 744 and still gets the full game, which is the intent.
  const small = Math.min(screen.width, screen.height) <= 560;
  return touch && coarse && small;
}

function resolveDemo(): boolean {
  const p = params();

  // An explicit answer always wins, in both directions. `?demo=0` is the way
  // back for a phone, and `?demo=1` is the only way a desktop or a harness can
  // reach the demo at all.
  const asked = p.get('demo');
  if (asked === '0') return false;
  if (asked === '1') return true;

  // The harness must never auto-detect into a different world. `shoot.mts`
  // determinism is BRIEF.md rule 2, and a capture taken against a pocket with
  // no cities is not a capture of this game. `?demo=1` above still works for
  // `coldload --extra demo=1`, which is how the demo gets measured.
  if (p.has('shoot') || p.has('scene') || p.has('texbake') || p.has('geobake')) return false;

  return isPhoneLike();
}

const DEMO = resolveDemo();

/** Is the phone demo active? Resolved once, at module load. */
export function demoActive(): boolean { return DEMO; }

function resolveTouch(): boolean {
  const p = params();
  const asked = p.get('touch');
  if (asked === '0') return false;
  // Explicit-on is NOT gated on `?shoot`, unlike `?demo`: the touch layer is
  // DOM and input only, it renders nothing into the world, and `touchcheck`
  // needs a way in. Every other gate's URL simply never carries the flag.
  if (asked === '1') return true;
  if (DEMO) return true;
  // A belt-and-braces leg for the case that actually matters: a device with a
  // touchscreen and a coarse pointer that somehow failed the demo's size test
  // still gets controls. Being handed a game with no way to move is the one
  // outcome worth being wrong in the other direction about, and a desktop
  // fails `coarse` regardless of what else is plugged in.
  return isPhoneLike();
}

const TOUCH = resolveTouch();

/**
 * Should the on-screen control layer be installed?
 *
 * Follows the demo by default, so the one detection decides both, and is
 * separable by hand in both directions: `?touch=1` on a desktop is how the
 * layout gets looked at without a phone, and `?touch=0` on a phone is the way
 * out for someone who has paired a controller.
 */
export function touchActive(): boolean { return TOUCH; }

/**
 * The render tier this page should use.
 *
 * The single source of truth. `Renderer` and `postfx/Msaa` both need the
 * answer and used to compute it independently off `?q=`; once detection can
 * choose a tier, two guesses disagree — a detected phone would render at
 * `low` while MSAA stayed at 4x, and `PostFX._wantSamples` would fire its
 * disagreement warning at boot. `Msaa.ts`'s own docblock predicted exactly
 * this and asked for the tier to be threaded rather than guessed twice.
 */
/**
 * Backing-store scale on the demo path, as a `devicePixelRatio` cap.
 *
 * The first device report was *"phone hot, FPS shit"*, and neither is a
 * content problem — a handset GPU is filling pixels it has no thermal budget
 * for. `?q=low` already caps the ratio at 1.0, which on a 390 CSS-px iPhone is
 * still a 1170x2532 panel driven at 390x844 native-equivalent; the fragment
 * cost of a full deferred-ish forward pass at that size is what cooks it.
 *
 * 0.62 renders **38% of the pixels**. That is the single largest GPU lever
 * available without touching a shader, and on a screen this small the browser's
 * upscale is much less visible than the frame rate is.
 *
 * `?rs=` overrides it, so the trade can be walked back from the URL without a
 * build — a phone that turns out to have headroom can ask for 1.0.
 */
export function renderScale(): number {
  const want = Number(params().get('rs'));
  if (Number.isFinite(want) && want > 0.2 && want <= 2) return want;
  return DEMO ? 0.62 : 1;
}

/**
 * Frames per second the demo asks `Game` for.
 *
 * Halving the duty cycle is the only heat lever that costs nothing at all:
 * every joule the GPU does not spend is a degree the phone does not gain, and
 * a locked 30 reads as smoother than a 40-55 that swings. `?fps=` still wins,
 * because `Game` reads that first.
 */
export function demoFps(): number { return 30; }

/**
 * Extra density cut on top of the tier's own, demo only.
 *
 * `?q=low` already scales vegetation to 0.45 and props to 0.5, and on a
 * handset that is still too much: the report was *"phone hot, FPS shit"*, and
 * after the pixel count the next largest lever is how many things are in
 * front of the camera at all. 0.55 of the low tier lands vegetation near 0.25
 * of the desktop's.
 *
 * It is a multiplier rather than a fourth tier because a tier is a promise
 * about a *look* and this is a promise about a *device*. `?dens=` overrides,
 * so the trade is walkable from the URL.
 */
export function demoDensity(): number {
  const want = Number(params().get('dens'));
  if (Number.isFinite(want) && want > 0 && want <= 1) return want;
  return DEMO ? 0.55 : 1;
}

export function resolveQualityTier(): QualityTier {
  const want = params().get('q') || (DEMO ? 'low' : 'high');
  return TIERS.includes(want as QualityTier) ? (want as QualityTier) : 'high';
}
