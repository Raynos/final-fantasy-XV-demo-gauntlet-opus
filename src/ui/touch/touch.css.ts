/**
 * Styles for the on-screen control layer.
 *
 * Tokens are inherited from `src/ui/ui.css`, so the buttons are in the same
 * design language as the HUD — hairline strokes, the 9 px corner cut, the same
 * ink ramp. Two rules are specific to this layer and non-negotiable:
 *
 *  - **`zoom: 1`.** Every other UI surface is scaled by `uiScale()` against a
 *    design box. A thumb is a physical size; a control that shrinks with the
 *    design grid is a control you miss.
 *  - **`env(safe-area-inset-*)`.** The notch and the home indicator eat the
 *    corners a control layer most wants.
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
   short of the top so the HUD's own corners are never stolen. The ring only
   exists while a finger is down, so at rest the picture is clean. */
.tc-zone {
  position: absolute; bottom: 0; top: 30%;
  pointer-events: auto;
}
.tc-zone-left  { left: 0;  width: 42%; }
.tc-zone-right { right: 0; width: 42%; }

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
.tc-knob {
  width: 46px; height: 46px;
  border: 1px solid var(--hair-hot);
  background: rgba(182, 214, 248, 0.20);
}

/* ---------- buttons --------------------------------------------------- */
.tc-cluster {
  position: absolute; pointer-events: none;
}
/* Contrast is the whole job here. These sit over a bright desert sky as often
   as over rock, so the ground is dark and opaque enough to read against both,
   and the stroke is the HUD's hot hairline rather than its quiet one — the
   first pass used the quiet one and every button read as a smudge. */
.tc-btn {
  position: absolute;
  pointer-events: auto;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--hair-hot);
  background: rgba(8, 14, 24, 0.66);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  color: var(--ink);
  text-align: center;
}
.tc-btn.is-down { background: rgba(182, 214, 248, 0.34); border-color: var(--ink); color: #fff; }
.tc-btn.is-on   { border-color: var(--gold); color: var(--gold); }
/* A disabled button must still be findable -- the thumb needs to know the slot
   exists before the verb becomes available. 0.30 vanished entirely against
   bright desert; this reads as "there, not yet". */
.tc-btn.is-off  { opacity: 0.44; pointer-events: none; }

.tc-btn-label {
  font-size: 10px; letter-spacing: 0.11em; text-transform: uppercase;
  line-height: 1.05; padding: 0 3px;
  font-weight: 600;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.tc-lg { width: 84px; height: 84px; }
.tc-lg .tc-btn-label { font-size: 12px; }
.tc-md { width: 64px; height: 64px; }
.tc-sm { width: 54px; height: 54px; }
.tc-sm .tc-btn-label { font-size: 9px; letter-spacing: 0.1em; }
/* A word longer than the circle. HANDBRAKE and INTERACT both overran the
   84 px button at the authored size; the label steps down rather than the
   button growing, because the geometry is the thing that must not move. */
.tc-btn.is-long .tc-btn-label { font-size: 8.5px; letter-spacing: 0.04em; }
.tc-lg.is-long .tc-btn-label { font-size: 10px; letter-spacing: 0.05em; }

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
   Buttons sit in a fixed arc off the bottom-right and NEVER move between
   field / ride / swim / drive: only labels and enabled-ness change, so muscle
   memory survives a mode change. Offsets are px, plus the safe area. */
.tc-right { right: calc(14px + env(safe-area-inset-right)); bottom: calc(14px + env(safe-area-inset-bottom)); width: 250px; height: 290px; }
.tc-left  { left:  calc(14px + env(safe-area-inset-left));  bottom: calc(14px + env(safe-area-inset-bottom)); width: 170px; height: 170px; }
/* Top-LEFT, which is the one corner the HUD leaves empty at a phone viewport:
   the clock, the gil readout and the quest tracker are all top-right. */
.tc-top   { left:  calc(14px + env(safe-area-inset-left));  top: calc(10px + env(safe-area-inset-top)); width: 150px; height: 60px; }
.tc-btn[hidden] { display: none; }

/* ---------- what the HUD gives up ------------------------------------
   844x390 is not big enough for a minimap and a thumb arc in the same corner,
   and the two claims are both bottom-right. The map moves to the dead ground
   between the two thumb zones, which is otherwise the one part of a landscape
   phone screen nothing uses.

   The bottom-centre key legend goes entirely: every glyph on it names a
   keyboard key that does not exist on this device, and the buttons that
   replaced them are labelled with the verb rather than the key. */
html.has-touch .hud-corner.bc { display: none !important; }
html.has-touch #minimap {
  right: auto; top: auto;
  left: 50%; bottom: 0;
  /* Half size. The map is authored for a 1600 px screen where it is a glance;
     dropped into the middle of a 390 px-tall one at full size it becomes the
     subject of the frame. */
  transform: translateX(-50%) scale(0.52);
  transform-origin: bottom center;
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
