/**
 * Styles for the on-screen control layer.
 *
 * Tokens are inherited from `src/ui/ui.css`, so the buttons are in the same
 * design language as the HUD — hairline strokes, the 9 px corner cut, the same
 * ink ramp. Three rules are specific to this layer and non-negotiable:
 *
 *  - **`zoom: 1`.** Every other UI surface is scaled by `uiScale()` against a
 *    design box. A thumb is a physical size; a control that shrinks with the
 *    design grid is a control you miss.
 *  - **`env(safe-area-inset-*)`.** The notch and the home indicator eat the
 *    corners a control layer most wants.
 *  - **Three visual families, not one.** The first pass drew nine identical
 *    grey discs and the picture showed the cost: the verb pressed every second
 *    looked exactly like the one pressed twice a session. Weight is the only
 *    thing on a 390 px-tall screen that can carry priority.
 *
 * Same hard rule as the rest of the UI: no transitions, no keyframes.
 */

const CSS = `
#touch {
  position: absolute; inset: 0; z-index: 3;
  zoom: 1;
  pointer-events: none;
  user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  font-family: var(--ui-font);
  touch-action: none;
}
#touch * { box-sizing: border-box; touch-action: none; }
#touch[hidden] { display: none; }

/* ---------- stick zones ----------------------------------------------
   Each zone is a large invisible catcher on its half of the screen, stopping
   short of the top so the HUD's own corners are never stolen. */
.tc-zone {
  position: absolute; bottom: 0; top: 30%;
  pointer-events: auto;
}
.tc-zone-left  { left: 0;  width: 42%; }
.tc-zone-right { right: 0; width: 42%; }
.tc-zone[hidden] { display: none; }

/* The stick at rest, DRAWN -- not a hint, the thing itself.
   The first build drew nothing until a finger landed, so the bottom-left was
   simply empty and a player who had never held this game had no way to learn
   there was a stick there. It is a real base and a real knob, in the same ink
   as everything else, and the floating ring takes over the moment a finger
   lands somewhere else in the zone. */
.tc-rest {
  position: absolute; pointer-events: none;
  width: 108px; height: 108px; border-radius: 50%;
  border: 1px solid var(--hair-hot);
  background: radial-gradient(circle, rgba(10,16,28,0.52) 0%, rgba(10,16,28,0.24) 68%, transparent 100%);
  box-shadow: 0 2px 14px rgba(0,0,0,0.45);
}
.tc-rest::after {
  content: ''; position: absolute; left: 50%; top: 50%;
  width: 46px; height: 46px; margin: -23px 0 0 -23px;
  border-radius: 50%;
  border: 1px solid var(--hair-hot);
  background: rgba(182, 214, 248, 0.16);
}
.tc-rest-left  { left: calc(26px + env(safe-area-inset-left));  bottom: calc(26px + env(safe-area-inset-bottom)); }
.tc-rest-right { right: calc(26px + env(safe-area-inset-right)); bottom: calc(26px + env(safe-area-inset-bottom)); }
.tc-rest[hidden] { display: none; }

.tc-ring, .tc-knob {
  position: fixed; pointer-events: none;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}
.tc-ring {
  width: 108px; height: 108px;
  border: 1px solid var(--hair);
  background: radial-gradient(circle, rgba(12,20,34,0.30) 0%, rgba(12,20,34,0.10) 70%, transparent 100%);
}
/* Sprint is a stick gesture now, not a button. Pushed past the rim the ring
   goes gold, which is the whole feedback -- a sprint pill in the left thumb's
   own zone meant letting go of the stick to press it. */
.tc-ring.is-sprint { border-color: var(--gold); box-shadow: 0 0 12px rgba(232, 207, 152, 0.30); }
.tc-knob {
  width: 46px; height: 46px;
  border: 1px solid var(--hair-hot);
  background: rgba(182, 214, 248, 0.20);
}
.tc-knob.is-sprint { border-color: var(--gold); background: rgba(232, 207, 152, 0.26); }

/* ---------- buttons ---------------------------------------------------
   These sit over a bright desert sky as often as over rock, so the ground is
   dark and opaque enough to read against both and the stroke is the HUD's hot
   hairline rather than its quiet one. */
.tc-cluster { position: absolute; pointer-events: none; }
.tc-btn {
  position: absolute;
  pointer-events: auto;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1px;
  border-radius: 50%;
  border: 1px solid var(--hair-hot);
  background: rgba(8, 14, 24, 0.62);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  color: var(--ink);
  text-align: center;
}
.tc-btn[hidden] { display: none; }
.tc-btn.is-down { background: rgba(182, 214, 248, 0.34); border-color: var(--ink); color: #fff; }
/* The ONLY dimmed state left. Everything else that cannot be pressed is gone
   rather than greyed -- six ghost discs floated over the middle of the first
   layout's frames. INTERACT dims in place because the player has to know where
   the contextual verb will appear before there is one. */
.tc-btn.is-dim { opacity: 0.34; pointer-events: none; }

.tc-glyph {
  display: block; width: 46%; height: 46%;
  fill: none; stroke: currentColor;
  stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.8));
}
.tc-btn-label {
  font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase;
  line-height: 1; padding: 0 3px; font-weight: 600;
  color: var(--ink-2);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.tc-btn-sub {
  font-size: 8px; letter-spacing: 0.06em;
  line-height: 1; color: var(--ink-3);
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.tc-btn.is-long .tc-btn-label { font-size: 7.5px; letter-spacing: 0.03em; }

/* ---------- the four tiers -------------------------------------------
   Diameter is the priority ladder: what the thumb reaches for most is what it
   can least afford to miss. */
.tc-xl { width: 84px; height: 84px; }
.tc-lg { width: 70px; height: 70px; }
.tc-md { width: 66px; height: 66px; }
.tc-sm { width: 54px; height: 54px; }
.tc-xs { width: 42px; height: 42px; }
.tc-xl .tc-btn-label { font-size: 10px; color: var(--ink); }
.tc-sm .tc-glyph, .tc-xs .tc-glyph { width: 52%; height: 52%; }

/* The primary. One accent in the whole layer, spent on the verb pressed every
   second of a fight. */
.tc-primary {
  border-color: rgba(232, 207, 152, 0.66);
  background: rgba(26, 20, 12, 0.66);
  color: var(--gold);
}
.tc-primary.is-down { background: rgba(232, 207, 152, 0.34); border-color: var(--gold); color: #fff; }

/* The rail: the two WORLD verbs. Cut corners rather than a circle, so they can
   never be mistaken for part of the combat fan, and a warm stroke to say they
   belong together. */
.tc-world {
  border-radius: 4px;
  clip-path: polygon(0 0, calc(100% - var(--cut)) 0, 100% var(--cut), 100% 100%, var(--cut) 100%, 0 calc(100% - var(--cut)));
  border-color: rgba(232, 207, 152, 0.40);
  background: rgba(12, 16, 22, 0.70);
}
.tc-world.is-down { background: rgba(232, 207, 152, 0.30); }

/* Utilities. Hairline only: a deliberate reach for a deliberate action, and it
   must not compete with a combat verb for attention. */
.tc-utility {
  background: rgba(8, 14, 24, 0.34);
  border-color: var(--hair);
  color: var(--ink-3);
  box-shadow: none;
}

/* The chocobo summon ring. A conic gradient means the per-frame write is one
   custom property, not a path rewrite. */
.tc-btn-ring {
  position: absolute; inset: -4px;
  border-radius: 50%;
  --t: 0deg;
  background: conic-gradient(var(--gold) var(--t), transparent var(--t));
  -webkit-mask: radial-gradient(circle, transparent 0 calc(50% - 3px), #000 calc(50% - 3px));
  mask: radial-gradient(circle, transparent 0 calc(50% - 3px), #000 calc(50% - 3px));
  opacity: 0.85;
}

/* ---------- placement -------------------------------------------------
   Everything lives in the bottom 55% of the screen or on the very top edge.
   The old cluster spanned 73% of screen height and put the chocobo and the car
   over the horizon; the middle band is what the player is actually looking at. */
.tc-fan  { right: calc(10px + env(safe-area-inset-right)); bottom: calc(10px + env(safe-area-inset-bottom)); width: 280px; height: 210px; }
/* Flex, not absolute offsets: drive hides the chocobo and ride hides the car,
   and a single survivor parked at the left of a two-wide box reads as a
   mistake. The row centres whatever is actually on screen. */
.tc-rail {
  left: 0; right: 0; bottom: calc(12px + env(safe-area-inset-bottom));
  height: 70px;
  display: flex; align-items: center; justify-content: center; gap: 16px;
}
.tc-rail .tc-btn { position: relative; left: auto !important; top: auto !important; flex: 0 0 auto; }
.tc-top  { left: calc(12px + env(safe-area-inset-left)); top: calc(8px + env(safe-area-inset-top)); width: 100px; height: 42px; }
.tc-left { left: calc(14px + env(safe-area-inset-left)); bottom: calc(14px + env(safe-area-inset-bottom)); width: 170px; height: 170px; }

/* ---------- what the HUD gives up ------------------------------------
   844x390 is not big enough for a minimap and a thumb fan in the same corner,
   and the bottom-centre belongs to the rail. The map goes to the top-left,
   beside the utilities, which is the one region of a landscape phone screen
   neither thumb can reach and no gameplay happens in.

   The bottom-centre key legend goes entirely: every glyph on it names a
   keyboard key that does not exist on this device, and the buttons that
   replaced them carry the verb rather than the key. */
html.has-touch .hud-corner.bc { display: none !important; }
/* The first-run hint cards, gone. Every one of them names a keyboard key that
   does not exist on this device -- the device frame reads "H shows every
   control; Tab opens the menu; M opens the map" -- and they are dismissed with
   a key nobody has. A card you cannot read and cannot close is worse than no
   card, and the buttons are labelled with the verb anyway. */
html.has-touch #hints { display: none !important; }
/* The bottom-left corner belongs to the thumb outright, so the party column
   leaves it -- a health bar under your own hand is not a health bar, and
   nudging it up only moved the collision. It goes to the top-left rail with
   the map and the utilities, which is the block of the screen that is already
   "what do I need to know", and it is scaled down to earn the space. */
html.has-touch #hud .bl {
  /* NOTE: this box is inside #hud, which carries zoom: uiScale() -- 0.542 at
     844x390 -- so these are ZOOMED units and 260 here is ~141 real px, which is
     what clears the minimap above it. Reading them as screen px is how the
     first two attempts landed the party column on top of the map.
     (No backticks in this file: the whole stylesheet is one template literal
     and a backtick in a comment ends it.) */
  left: 14px; bottom: auto; top: 260px;
  transform: scale(0.78);
  transform-origin: top left;
}
/* Same trade on the right: the fan owns that corner outright. */
html.has-touch #hud .br { display: none !important; }
html.has-touch #minimap {
  right: auto; bottom: auto;
  /* Tucked under MAP and MENU, so the whole top-left corner is one block of
     navigation and the rest of the frame is the game. Authored for a 1600 px
     screen where it is a glance; dropped whole onto a 390 px-tall one it
     becomes the subject of the frame, hence 0.34. */
  left: 1%; top: 13%;
  transform: scale(0.34);
  transform-origin: top left;
}
html.has-touch #minimap .mm-caption, html.has-touch #minimap .mm-names { display: none; }
`;

let injected = false;

/** Inject the stylesheet once. Safe to call more than once. */
export function ensureTouchCss() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('style');
  s.id = 'touch-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
