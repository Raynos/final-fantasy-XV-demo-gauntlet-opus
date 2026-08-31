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

/** The demo's playable disc, centred on the player's spawn at the origin. */
export const POCKET = { x: 0, z: 0, r: 1200 };

/** Is a world position inside the demo pocket? */
export function inPocket(x: number, z: number): boolean {
  const dx = x - POCKET.x, dz = z - POCKET.z;
  return dx * dx + dz * dz <= POCKET.r * POCKET.r;
}

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
  const small = Math.min(screen.width, screen.height) <= 500;
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
export function resolveQualityTier(): QualityTier {
  const want = params().get('q') || (DEMO ? 'low' : 'high');
  return TIERS.includes(want as QualityTier) ? (want as QualityTier) : 'high';
}
