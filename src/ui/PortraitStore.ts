/**
 * The registry that connects a baked hero portrait to every `<image>` slot the
 * interface has opened for it.
 *
 * Why a registry rather than a getter. Portrait plates are built by four
 * unrelated widgets at four unrelated moments — `PartyPanel` on the first HUD
 * frame, `MainScreen` and `GearScreen` the first time the player opens them,
 * and camp dialogue whenever the Director runs a scene — while the bake itself
 * (`Portraits.ts`) can only run once the world has rendered a frame, because it
 * borrows the scene's real lights and shadow maps. Neither side can wait for
 * the other, so a plate opens a slot with whatever is available now (nothing,
 * at boot) and this module fills it in when the bake lands.
 *
 * It holds no THREE reference on purpose: `Icons.ts` draws pure SVG and must
 * not pull the renderer into its import graph.
 */

/** One `<image>` element waiting for a hero's portrait, and its fallback art. */
interface Slot {
  id: string;
  img: SVGElement;
  /** The procedural bust, hidden the moment a real render arrives. */
  bust: SVGElement | null;
}

const slots: Slot[] = [];
/** roster id -> data URL of the baked render. */
const baked = new Map<string, string>();

/** The baked portrait for a roster id, or null if the bake has not run. */
export function portraitHref(id: string): string | null {
  return baked.get(id) ?? null;
}

/**
 * Open a slot. Called by `Icons.portrait` for every plate it draws.
 *
 * Menu screens are rebuilt on every open, so dead slots are swept rather than
 * left to grow — but **only slots that have already been filled**. An empty one
 * is still detached at this moment by construction: every caller builds its
 * plate and appends it to the document afterwards, so a sweep on `isConnected`
 * alone deletes the plate that is being registered a moment before it is
 * attached, and it never fills. Today the party stack survives that only
 * because it appends each row before building the next.
 */
export function registerPortraitSlot(id: string, img: SVGElement, bust: SVGElement | null) {
  for (let i = slots.length - 1; i >= 0; i--) {
    const s = slots[i];
    if (s.img.getAttribute('opacity') === '1' && !s.img.isConnected) slots.splice(i, 1);
  }
  slots.push({ id, img, bust });
  const href = baked.get(id);
  if (href) fill(slots[slots.length - 1], href);
}

/** Publish a finished bake and fill every slot already waiting on it. */
export function setPortrait(id: string, dataUrl: string) {
  baked.set(id, dataUrl);
  for (const s of slots) if (s.id === id) fill(s, dataUrl);
}

function fill(s: Slot, href: string) {
  s.img.setAttribute('href', href);
  // Older UAs still read the namespaced form; harmless where they do not.
  s.img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href);
  s.img.setAttribute('opacity', '1');
  if (s.bust) s.bust.setAttribute('display', 'none');
}

/** Test seam: forget every bake and every slot. */
export function _resetPortraits() {
  slots.length = 0;
  baked.clear();
}
