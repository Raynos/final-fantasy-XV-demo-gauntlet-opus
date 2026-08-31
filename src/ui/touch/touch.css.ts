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
.tc-btn {
  position: absolute;
  pointer-events: auto;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--hair);
  background: rgba(10, 17, 29, 0.42);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
  color: var(--ink-2);
  text-align: center;
}
.tc-btn.is-down { background: rgba(182, 214, 248, 0.26); border-color: var(--hair-hot); color: var(--ink); }
.tc-btn.is-on   { border-color: var(--gold); color: var(--gold); }
.tc-btn.is-off  { opacity: 0.28; pointer-events: none; }

.tc-btn-label {
  font-size: 10px; letter-spacing: 0.13em; text-transform: uppercase;
  line-height: 1.05; padding: 0 4px;
  text-shadow: var(--sh-text);
}
.tc-lg { width: 84px; height: 84px; }
.tc-lg .tc-btn-label { font-size: 12px; }
.tc-md { width: 64px; height: 64px; }
.tc-sm { width: 54px; height: 54px; }
.tc-sm .tc-btn-label { font-size: 9px; letter-spacing: 0.1em; }

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
.tc-right { right: calc(14px + env(safe-area-inset-right)); bottom: calc(14px + env(safe-area-inset-bottom)); width: 250px; height: 230px; }
.tc-left  { left:  calc(14px + env(safe-area-inset-left));  bottom: calc(14px + env(safe-area-inset-bottom)); width: 170px; height: 170px; }
.tc-top   { right: calc(14px + env(safe-area-inset-right)); top: calc(10px + env(safe-area-inset-top)); width: 150px; height: 60px; }
/* The two dedicated context buttons ride above the combat arc, on the right
   edge where the thumb reaches without leaving the look stick. */
.tc-side  { right: calc(14px + env(safe-area-inset-right)); bottom: calc(240px + env(safe-area-inset-bottom)); width: 190px; height: 88px; }
.tc-btn[hidden] { display: none; }
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
