/**
 * Styles for the fishing overlay.
 *
 * Same rule as the rest of the UI and stated again because it is easy to break
 * here: **no CSS transitions and no keyframes.** A tension bar is exactly the
 * kind of thing somebody reaches for a transition on, and the moment one exists
 * a capture taken after N fixed sim steps stops being reproducible. Every width,
 * colour and opacity below is written per frame from `Fishing.update`.
 *
 * Tokens (`--ink`, `--ice`, `--gold`, `--danger`, `--sh-text`) come from
 * `src/ui/ui.css`, so this reads as the same game as the hunt board.
 */

const CSS = `
#fishing {
  position: absolute; inset: 0; z-index: 3;
  font-family: var(--ui-font); color: var(--ink);
  -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums;
  user-select: none; pointer-events: none;
}
#fishing * { box-sizing: border-box; }
#fishing.off { display: none; }

/* A low vignette so the gauges sit on something, without curtaining the water. */
.fsh-veil {
  position: absolute; left: 0; right: 0; bottom: 0; height: 42%;
  background: linear-gradient(180deg, rgba(3,6,12,0), rgba(3,6,12,.34) 58%, rgba(3,6,12,.62));
}

.fsh {
  position: absolute; left: 50%; bottom: 8.5%; width: 640px; margin-left: -320px;
  display: flex; flex-direction: column; align-items: center; gap: 13px;
}

/* ---------- the state caption ---------------------------------------- */
.fsh-cap {
  font-size: 12.5px; font-weight: 300; letter-spacing: .42em; text-transform: uppercase;
  color: #fff; text-shadow: var(--sh-text); line-height: 1;
}
.fsh-cap.hot { color: var(--accent-hot); text-shadow: 0 0 18px rgba(180,220,255,.9), var(--sh-text); }
.fsh-cap.bad { color: var(--danger); }
.fsh-cap.good { color: var(--gold); text-shadow: 0 0 20px rgba(232,207,152,.5), var(--sh-text); }
.fsh-sub {
  font-size: 8.5px; letter-spacing: .30em; text-transform: uppercase;
  color: var(--ice); text-shadow: var(--sh-text); line-height: 1; min-height: 1em;
}

/* ---------- tension ---------------------------------------------------- */
.fsh-gauge { position: relative; width: 100%; height: 9px; }
.fsh-gauge .bed {
  position: absolute; inset: 0;
  background: rgba(6,10,18,.62); box-shadow: inset 0 0 0 1px rgba(206,224,250,.16);
  clip-path: polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px));
}
.fsh-gauge .fill { position: absolute; left: 1px; top: 1px; bottom: 1px; width: 0; }
/* The snap band: the last 18% of the bar, marked so it can be read at a glance
   rather than learned by losing a fish to it. */
.fsh-gauge .band {
  position: absolute; right: 1px; top: 1px; bottom: 1px; width: 18%;
  background: repeating-linear-gradient(115deg, rgba(226,92,86,.30) 0 3px, rgba(226,92,86,.07) 3px 7px);
}
.fsh-gauge .tick { position: absolute; top: -4px; bottom: -4px; width: 1px; background: rgba(206,224,250,.45); }

/* ---------- the line / stamina readouts -------------------------------- */
.fsh-row { display: flex; align-items: flex-end; justify-content: space-between; width: 100%; }
.fsh-num { display: flex; flex-direction: column; gap: 6px; }
.fsh-num.r { align-items: flex-end; }
.fsh-num .k { font-size: 8px; letter-spacing: .34em; text-transform: uppercase; color: var(--ink-4); }
.fsh-num .v {
  font-size: 27px; font-weight: 100; letter-spacing: .04em; color: #fff; line-height: 1;
  text-shadow: var(--sh-text-lg);
}
.fsh-num .v small { font-size: 11px; color: var(--ice); letter-spacing: .2em; margin-left: 7px; }

/* The fish's own strength, drawn as a thin bar under its name. */
.fsh-stam { position: relative; width: 190px; height: 3px; background: rgba(6,10,18,.7); box-shadow: inset 0 0 0 1px rgba(206,224,250,.14); }
.fsh-stam .f { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ice); }

/* ---------- which way it is running ------------------------------------ */
.fsh-run { display: flex; align-items: center; gap: 16px; height: 15px; }
.fsh-run .ch {
  font-size: 15px; letter-spacing: .1em; color: var(--ink-4); line-height: 1;
  text-shadow: var(--sh-text);
}
.fsh-run .ch.on { color: var(--accent-hot); text-shadow: 0 0 14px rgba(180,220,255,.9), var(--sh-text); }
.fsh-run .ch.counter { color: var(--gold); text-shadow: 0 0 14px rgba(232,207,152,.75), var(--sh-text); }
.fsh-run .mid { font-size: 8px; letter-spacing: .3em; text-transform: uppercase; color: var(--ink-4); }

/* ---------- controls --------------------------------------------------- */
.fsh-keys { display: flex; align-items: center; gap: 22px; }
.fsh-keys .kk { display: flex; align-items: center; gap: 8px; }
.fsh-keys .cap {
  font-size: 9px; font-weight: 400; letter-spacing: .1em; color: #fff;
  padding: 2px 6px; min-width: 20px; text-align: center;
  box-shadow: inset 0 0 0 1px rgba(206,224,250,.42); background: rgba(6,10,18,.55);
}
.fsh-keys .kk.on .cap { background: rgba(134,184,239,.34); box-shadow: inset 0 0 0 1px rgba(206,224,250,.9); }
.fsh-keys .lb { font-size: 8px; letter-spacing: .26em; text-transform: uppercase; color: var(--ink-3); text-shadow: var(--sh-text); }

/* ---------- the cast meter --------------------------------------------- */
.fsh-cast { position: relative; width: 300px; height: 6px; }
.fsh-cast .bed { position: absolute; inset: 0; background: rgba(6,10,18,.62); box-shadow: inset 0 0 0 1px rgba(206,224,250,.16); }
.fsh-cast .f { position: absolute; left: 1px; top: 1px; bottom: 1px; width: 0; background: linear-gradient(90deg, var(--ice), #fff); }

/* ---------- the result card -------------------------------------------- */
.fsh-card { display: flex; flex-direction: column; align-items: center; gap: 11px; }
.fsh-card .nm {
  font-size: 25px; font-weight: 200; letter-spacing: .16em; text-transform: uppercase;
  color: #fff; text-shadow: var(--sh-text-lg);
}
.fsh-card .kg { font-size: 13px; letter-spacing: .22em; color: var(--gold); text-shadow: 0 0 16px rgba(232,207,152,.4); }
.fsh-card .no { font-size: 12px; letter-spacing: .18em; color: var(--ink-3); text-shadow: var(--sh-text); font-style: italic; }
`;

let injected = false;

/** Inject the stylesheet once. Safe to call from anywhere, any number of times. */
export function ensureFishingCss() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('style');
  s.id = 'fishing-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
