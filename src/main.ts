import { Game } from './game/Game.ts';
import { installBootProfile } from './engine/BootProfile.ts';
import { touchActive } from './engine/Device.ts';
import { bytes, human } from './engine/BootProgress.ts';

// These five live in `src/index.html` and neither the loading screen nor the
// game can run without them, so an assertion here is the honest reading -- a
// null would be a broken page, not a case to handle.
const boot = document.getElementById('boot')!;
const bar = document.getElementById('boot-bar')!;
const label = document.getElementById('boot-label')!;

const game = new Game({
  container: document.getElementById('app')!,
  uiRoot: document.getElementById('ui')!,
  onProgress: (t: number, text: string | null) => {
    bar.style.right = `${Math.max(0, 100 - t * 100).toFixed(1)}%`;
    if (!text) return;
    // While containers are in flight the download IS the wait, so say so in
    // bytes. On a phone this is the only number that matters: a person
    // watching one climb knows the difference between slow and stuck, which a
    // spinner cannot tell them.
    const b = bytes();
    label.textContent = b.pending && b.total
      ? `${text}   ${human(b.loaded)} / ${human(b.total)}`
      : text;
  },
});

window.GAME = game;
installBootProfile(game);

game.init().then(() => {
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 900);
  // Under the capture harness the page must not free-run: any wall-clock frame
  // between "ready" and the harness taking over would advance TAA history, the
  // exposure integrator and enemy AI by a nondeterministic amount.
  const qs = new URLSearchParams(location.search);
  if (!qs.has('shoot')) game.start();

  // On-screen controls. A dynamic import so a desktop bundle never parses the
  // layer, and `orphans.mts` counts a dynamic import as reachable. It is
  // installed after `start()` on purpose: it takes over `input.padSource` and
  // there is no reason for that hook to exist before the game is running.
  if (touchActive()) {
    import('./ui/touch/TouchControls.ts')
      .then((m) => m.installTouchControls(game))
      .catch((err) => console.error('[touch] controls failed to load', err));
  }

  // In-game developer / review suite. A dynamic import keeps it in its own
  // async chunk, so it loads after the game is up rather than delaying boot --
  // one build, no drift, you review the bundle you actually ship.
  //
  // It is ON BY DEFAULT and `?debug=0` opts out. The suite is part of what this
  // build is for; hiding it behind a flag meant it was mostly not running when
  // somebody looked at the game, which is the one moment it is worth having.
  //
  // The `!shoot` guard stays a hard determinism gate: the capture harness loads
  // `?q=ultra&shoot=1`, so the suite can never appear in a screenshot.
  if (!qs.has('shoot') && qs.get('debug') !== '0') {
    import('./dev/DevSuite.ts')
      .then((m) => m.installDevSuite(game))
      .catch((err) => console.error('[dev] suite failed to load', err));
  }
}).catch((err) => {
  label.textContent = 'ERROR';
  console.error(err);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f88;max-width:80vw;white-space:pre-wrap;font-size:11px;letter-spacing:0;text-transform:none';
  pre.textContent = (err && err.stack) || String(err);
  boot.appendChild(pre);
});
