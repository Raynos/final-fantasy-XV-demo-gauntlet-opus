/**
 * Styles for the interaction prompt and the conversation layer.
 *
 * These live here rather than in `src/ui/ui.css` because that file belongs to
 * the UI workstream; the tokens (`--ink`, `--hair`, `--cut`, …) are all
 * inherited from it, so the two layers stay in the same design language.
 *
 * Same hard rule as the rest of the UI: **no transitions, no keyframes**.
 * Everything that moves is written per frame from `game.time`.
 */

const CSS = `
#interact, #dialogue {
  position: absolute; inset: 0; z-index: 2;
  font-family: var(--ui-font);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  font-variant-numeric: tabular-nums;
  user-select: none; pointer-events: none;
}
#interact *, #dialogue * { box-sizing: border-box; }

/* ---------- the far marker -------------------------------------------
   A thing you could walk up to, seen from across a forecourt. Same diamond as
   the prompt's own node so the two read as one object at two distances, at a
   third of the size and no plate: it says "there is something here", and
   walking to it says what. Without this, an interactable is invisible until
   you are already inside its 2.6 m reach, which is how a player can stand in
   the middle of Hammerhead pressing E and never learn that the diner, the
   garage counter, the hunt board, the pump and the caravan are all there. */
.ix-far { position: absolute; left: 0; top: 0; }
.ix-far-d {
  position: absolute; left: -3px; top: -3px; width: 6px; height: 6px;
  transform: rotate(45deg);
  background: linear-gradient(140deg, #dceaff, #7fa8dc);
  box-shadow: 0 0 7px rgba(150,198,255,.6), 0 1px 2px rgba(0,0,0,.7);
}
.ix-far-t {
  position: absolute; left: 9px; top: -6px; white-space: nowrap;
  font-size: 7.5px; font-weight: 300; letter-spacing: .26em;
  text-transform: uppercase; color: rgba(226,238,255,.9);
  text-shadow: 0 1px 4px rgba(3,7,14,.95);
}

/* ---------- contextual prompt ---------------------------------------- */
.ix { position: absolute; left: 0; top: 0; }
.ix-stem {
  position: absolute; left: 0; bottom: 0; width: 1px;
  background: linear-gradient(180deg, transparent, rgba(206,224,250,.42));
}
.ix-node {
  position: absolute; left: -4.5px; top: -4.5px; width: 9px; height: 9px;
  transform: rotate(45deg);
  background: linear-gradient(140deg, #eaf4ff, #86b8ef);
  box-shadow: 0 0 10px rgba(170,214,255,.85), 0 1px 3px rgba(0,0,0,.8);
}
.ix-ring {
  position: absolute; left: -11px; top: -11px; width: 22px; height: 22px;
  transform: rotate(45deg);
  box-shadow: inset 0 0 0 1px rgba(198,224,255,.55);
}
.ix-body {
  position: absolute; left: 16px; bottom: -13px;
  display: flex; align-items: center; gap: 9px;
  padding: 7px 16px 8px 11px; white-space: nowrap;
  background: linear-gradient(96deg, rgba(6,10,18,.72) 0%, rgba(6,10,18,.34) 68%, rgba(6,10,18,.06) 100%);
  clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 9px 100%, 0 calc(100% - 9px));
  box-shadow: 0 8px 26px rgba(0,0,0,.45);
}
.ix-body .btn-glyph { color: var(--ice); flex: none; }
.ix-txt { display: flex; flex-direction: column; gap: 4px; }
.ix-verb {
  font-size: 12.5px; font-weight: 300; letter-spacing: .26em; text-transform: uppercase;
  color: #fff; text-shadow: var(--sh-text); line-height: 1;
}
.ix-sub {
  font-size: 8.5px; letter-spacing: .30em; text-transform: uppercase;
  color: var(--ice); text-shadow: var(--sh-text); line-height: 1;
}
.ix-hint {
  font-size: 8px; letter-spacing: .18em; text-transform: uppercase;
  color: var(--ink-4); text-shadow: var(--sh-text); line-height: 1;
}

/* ---------- conversation --------------------------------------------- */
.dlg {
  /* clear of the party panel, which owns the bottom-left corner of the HUD */
  position: absolute; left: 50%; bottom: 19%; width: 58%; max-width: 860px;
  transform: translateX(-50%);
}
/* The scrim was an ellipse centred at 50% 60% of a box whose CHOICE LIST hangs
 * below that centre, so by the time it reached the menu rows it had fallen to
 * near zero -- and a camp conversation happens outdoors, in daylight, over
 * sunlit sandstone. The playtest's "the meal options are dark grey text on
 * sunlit sandstone and nearly unreadable" is that geometry. Drop the centre to
 * 50% and add a flat vertical wash under it so the bottom of the panel is
 * covered as well as the middle. */
.dlg::before {
  content: ''; position: absolute; left: -30%; right: -30%; top: -120px; bottom: -110px;
  background:
    radial-gradient(ellipse 60% 100% at 50% 50%, rgba(3,6,12,.60), rgba(3,6,12,.24) 52%, rgba(3,6,12,0) 86%),
    linear-gradient(180deg, rgba(3,6,12,0), rgba(3,6,12,.30) 34%, rgba(3,6,12,.34) 82%, rgba(3,6,12,0));
  z-index: -1;
}
.dlg-head { display: flex; align-items: flex-end; gap: 14px; margin-bottom: 12px; }
.dlg-pf {
  position: relative; width: 54px; height: 62px; flex: none; overflow: hidden;
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%);
  box-shadow: 0 4px 18px rgba(0,0,0,.6);
}
.dlg-pf svg { display: block; width: 100%; height: 100%; }
.dlg-who { display: flex; flex-direction: column; gap: 7px; padding-bottom: 3px; }
.dlg-nm {
  font-size: 13px; font-weight: 400; letter-spacing: .34em; text-transform: uppercase;
  color: #fff; text-shadow: var(--sh-text);
}
.dlg-role {
  font-size: 8.5px; letter-spacing: .28em; text-transform: uppercase;
  color: var(--ice); text-shadow: var(--sh-text);
}
.dlg-rule { height: 1px; width: 100%; background: linear-gradient(90deg, var(--hair-hot), rgba(206,224,250,.10) 62%, transparent); }
.dlg-line {
  font-size: 17px; font-weight: 200; letter-spacing: .05em; line-height: 1.56;
  color: #fff; margin-top: 15px; min-height: 3.2em;
  text-shadow: 0 2px 6px rgba(0,0,0,.92), 0 0 26px rgba(0,0,0,.7);
}
.dlg-choices { margin-top: 16px; display: flex; flex-direction: column; gap: 2px; }
/* Every choice row carries its own plate. --ink-3 is rgba(210,224,246,.56):
 * composited over a sunlit sandstone frame at roughly (200,175,140) that is
 * (205,202,200) -- light grey on light sand, which is no contrast at all, and
 * it is why five menu rows were invisible in a frame where the speaker's line
 * one inch above them was perfectly legible (that line carries a 0.92-alpha
 * shadow of its own). A text-shadow alone cannot save 56%-alpha ink over a
 * bright ground; the row needs a dark ground under it. Same fix as b3dbbdc
 * gave the Armiger caption, one step further because these rows are the
 * interactive part of the screen. */
.dlg-ch {
  position: relative; display: flex; align-items: center; gap: 12px; padding: 8px 12px 8px 16px;
  background: linear-gradient(90deg, rgba(4,8,15,.66), rgba(4,8,15,.40) 68%, rgba(4,8,15,.06));
  clip-path: polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%);
}
.dlg-ch .dlg-bg {
  position: absolute; left: 0; right: -8px; top: 0; bottom: 0; opacity: 0;
  background: linear-gradient(90deg, rgba(134,184,239,.26), rgba(134,184,239,.03) 62%, transparent);
  clip-path: polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%);
}
.dlg-ch .dlg-dot { width: 6px; height: 6px; transform: rotate(45deg); background: var(--ink-4); flex: none; }
.dlg-ch.on .dlg-dot { background: var(--accent-hot); box-shadow: 0 0 9px rgba(180,220,255,.9); }
.dlg-ch .dlg-t {
  font-size: 12.5px; font-weight: 300; letter-spacing: .18em; text-transform: uppercase;
  color: var(--ink-2); text-shadow: var(--sh-text);
}
.dlg-ch.on .dlg-t { color: #fff; letter-spacing: .22em; }
/* The note is what the meal is WORTH -- "+600 HP, +25 Vitality" -- which is the
 * whole decision the camp asks the player to make, and it was 8.5px of
 * --ink-4 (0.34 alpha) with no text-shadow at all: the exact shape b3dbbdc
 * found on the Armiger caption. */
.dlg-ch .dlg-note {
  font-size: 9.5px; letter-spacing: .12em; color: var(--ink-2); margin-left: auto;
  text-transform: uppercase; text-shadow: var(--sh-text); padding-right: 4px;
}
.dlg-foot { display: flex; align-items: center; gap: 9px; margin-top: 16px; justify-content: flex-end; }
.dlg-foot .lb { font-size: 9px; letter-spacing: .24em; text-transform: uppercase; color: var(--ink-3); text-shadow: var(--sh-text); }
.dlg-foot .btn-glyph { color: var(--ice); }

/* ---------- shop / hunt board screens --------------------------------- */
.shop-cols { position: absolute; left: 68px; right: 68px; top: 170px; bottom: 96px; display: flex; gap: 40px; }
.shop-l { width: 54%; display: flex; flex-direction: column; min-height: 0; }
.shop-r { flex: 1; position: relative; }
.shop-list { flex: 1; overflow: hidden; }
.srow { position: relative; display: flex; align-items: center; gap: 13px; padding: 8px 14px 8px 8px; }
.srow .ico { color: var(--ink-3); flex: none; }
.srow .sn { flex: 1; font-size: 12px; font-weight: 300; letter-spacing: .11em; color: var(--ink-2); text-shadow: var(--sh-text); }
.srow .sh { font-size: 9.5px; letter-spacing: .12em; color: var(--ink-4); min-width: 46px; text-align: right; }
.srow .sp { font-size: 12.5px; font-weight: 300; color: var(--ink); letter-spacing: .02em; min-width: 74px; text-align: right; text-shadow: var(--sh-text); }
.srow .sp small { font-size: 8.5px; color: var(--ink-4); letter-spacing: .18em; margin-left: 4px; }
.srow .mr-bg { position: absolute; left: -14px; right: -6px; top: 0; bottom: 0; opacity: 0;
  background: linear-gradient(90deg, rgba(134,184,239,.22), transparent 74%);
  clip-path: polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%); }
.srow.on .sn, .srow.on .sp { color: #fff; }
.srow.on .ico { color: var(--accent-hot); }
.srow.poor .sp { color: var(--danger); }
.srow.poor .sn { color: var(--ink-4); }

.shop-gil { position: absolute; right: 68px; top: 54px; text-align: right; }
.shop-gil .k { font-size: 8.5px; letter-spacing: .38em; text-transform: uppercase; color: var(--ink-3); text-shadow: var(--sh-text); }
.shop-gil .v { font-size: 38px; font-weight: 100; letter-spacing: .04em; color: #fff; line-height: 1; margin-top: 7px;
  text-shadow: 0 0 30px rgba(232,207,152,.34), var(--sh-text-lg); }
.shop-gil .v small { font-size: 12px; color: var(--gold); letter-spacing: .22em; margin-left: 8px; }
.shop-gil .d { font-size: 10px; letter-spacing: .2em; margin-top: 8px; color: var(--ice); }

.shop-qty { display: flex; align-items: center; gap: 14px; margin-top: 22px; }
.shop-qty .k { font-size: 8px; letter-spacing: .32em; text-transform: uppercase; color: var(--ink-4); }
.shop-qty .n { font-size: 22px; font-weight: 200; color: #fff; letter-spacing: .04em; text-shadow: var(--sh-text); min-width: 44px; }
.shop-qty .tot { font-size: 12.5px; color: var(--gold); letter-spacing: .08em; }
.shop-empty { font-size: 12.5px; font-weight: 300; letter-spacing: .16em; color: var(--ink-3); text-shadow: var(--sh-text); padding: 26px 8px; }
.shop-msg { position: absolute; left: 0; bottom: -34px; font-size: 10px; letter-spacing: .22em; text-transform: uppercase; text-shadow: var(--sh-text); }
.shop-msg.ok { color: var(--ice); }
.shop-msg.bad { color: var(--danger); }
.shop-owner { position: absolute; right: 0; bottom: 8px; text-align: right; max-width: 380px; }
.shop-owner .q { font-size: 12.5px; font-weight: 200; letter-spacing: .04em; line-height: 1.6; color: var(--ink-2); text-shadow: var(--sh-text); font-style: italic; }
.shop-owner .n { font-size: 8.5px; letter-spacing: .3em; text-transform: uppercase; color: var(--ice); margin-top: 9px; }

/* ---------- hunt board ------------------------------------------------ */
.hunt-cols { position: absolute; left: 68px; right: 68px; top: 170px; bottom: 96px; display: flex; gap: 40px; }
.hunt-l { width: 50%; display: flex; flex-direction: column; }
.hunt-r { flex: 1; position: relative; }
.hrow { position: relative; display: flex; align-items: center; gap: 14px; padding: 10px 14px 10px 8px; }
.hrow .hstars { font-size: 11px; letter-spacing: .04em; color: var(--gold); min-width: 78px; text-shadow: 0 0 10px rgba(232,207,152,.4), var(--sh-text); }
.hrow .hn { flex: 1; font-size: 12px; font-weight: 300; letter-spacing: .12em; color: var(--ink-2); text-shadow: var(--sh-text); }
.hrow .hlv { font-size: 9px; letter-spacing: .16em; color: var(--ink-4); min-width: 56px; text-align: right; }
.hrow .mr-bg { position: absolute; left: -14px; right: -6px; top: 0; bottom: 0; opacity: 0;
  background: linear-gradient(90deg, rgba(134,184,239,.22), transparent 74%);
  clip-path: polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%); }
.hrow.on .hn { color: #fff; }
.hrow.locked .hn, .hrow.locked .hstars { color: var(--ink-4); text-shadow: none; }
.hrow.locked .hstars { color: rgba(232,207,152,.28); }
.hrow.active .hn { color: var(--ice); }
.hrow .hflag { font-size: 8px; letter-spacing: .28em; text-transform: uppercase; color: var(--ice); }
.hrow.locked .hflag { color: var(--ink-4); }

.hunt-card { position: absolute; inset: 0; padding: 4px 0 0 30px; }
.hunt-card .rule.v { position: absolute; left: 0; top: 0; bottom: 0; }
.hunt-card .hc-k { font-size: 8.5px; letter-spacing: .34em; text-transform: uppercase; color: var(--ink-4); }
.hunt-card .hc-n { font-size: 21px; font-weight: 200; letter-spacing: .15em; text-transform: uppercase; color: #fff; margin-top: 10px; text-shadow: var(--sh-text); }
.hunt-card .hc-stars { font-size: 15px; letter-spacing: .10em; color: var(--gold); margin-top: 11px; text-shadow: 0 0 14px rgba(232,207,152,.45); }
.hunt-card .hc-d { margin-top: 15px; max-width: 420px; }
.hunt-card .hc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 40px; margin-top: 22px; max-width: 420px; }
.hunt-card .hc-c .k { font-size: 8px; letter-spacing: .32em; text-transform: uppercase; color: var(--ink-4); }
.hunt-card .hc-c .v { font-size: 12.5px; font-weight: 300; letter-spacing: .07em; color: var(--ink); margin-top: 6px; text-shadow: var(--sh-text); }
.hunt-card .hc-c .v.gold { color: var(--gold); }
.hunt-card .hc-obj { margin-top: 22px; max-width: 440px; }
.hunt-card .hc-obj .k { font-size: 8px; letter-spacing: .32em; text-transform: uppercase; color: var(--ink-4); margin-bottom: 11px; }
.hunt-card .hc-ob { display: flex; align-items: center; gap: 10px; padding: 4px 0; font-size: 11px; font-weight: 300; letter-spacing: .08em; color: var(--ink-2); text-shadow: var(--sh-text); }
.hunt-card .hc-ob .d { width: 5px; height: 5px; transform: rotate(45deg); background: var(--ink-4); flex: none; }
.hunt-card .hc-ob.done .d { background: var(--ice); box-shadow: 0 0 8px rgba(150,200,255,.8); }
.hunt-card .hc-act { position: absolute; left: 30px; bottom: 6px; display: flex; align-items: center; gap: 10px; }
.hunt-card .hc-act .lb { font-size: 10px; letter-spacing: .26em; text-transform: uppercase; text-shadow: var(--sh-text); }
.hunt-card .hc-act .lb.go { color: #fff; }
.hunt-card .hc-act .lb.no { color: var(--ink-4); }
.hunt-card .hc-act .btn-glyph { color: var(--ice); }
.hunt-card .hc-mark { position: absolute; right: 60px; top: 0; color: rgba(178,208,246,.075); pointer-events: none; }

.hunt-rank { position: absolute; right: 68px; top: 54px; text-align: right; }
.hunt-rank .k { font-size: 8.5px; letter-spacing: .38em; text-transform: uppercase; color: var(--ink-3); text-shadow: var(--sh-text); }
.hunt-rank .v { font-size: 30px; font-weight: 100; letter-spacing: .08em; color: #fff; line-height: 1; margin-top: 8px; text-shadow: var(--sh-text-lg); }
.hunt-rank .p { font-size: 9.5px; letter-spacing: .2em; color: var(--ice); margin-top: 9px; }
.hunt-rank .gauge { width: 190px; margin-top: 10px; margin-left: auto; }
`;

let injected = false;

/** Inject the stylesheet once. Safe to call from every module that needs it. */
export function ensureInteractCss() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('style');
  s.id = 'interact-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
