import { Game } from './game/Game.ts';
import { installBootProfile } from './engine/BootProfile.ts';
import { touchActive } from './engine/Device.ts';

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
    if (text) label.textContent = text;
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
  // async chunk, so it ships in the production build (one build, no drift --
  // you review the bundle you actually ship) without loading on the normal
  // path. The `!shoot` guard is a hard determinism gate: the capture harness
  // loads `?q=ultra&shoot=1`, so the suite can never appear in a screenshot.
  if (qs.has('debug') && !qs.has('shoot')) {
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
