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

const qs = new URLSearchParams(location.search);

// The touch marker goes on the root element NOW, not when `TouchControls`
// finishes its dynamic import after `game.start()`. Three stylesheets key phone
// layouts off `html.has-touch` -- `title.css` among them -- and the title
// screen is shown by `StorySystem` during that same boot, so a class that
// arrives a chunk-load later means the first paint of the title is the desktop
// layout scaled onto a handset. `TouchControls` still adds it (idempotent), so
// `?touch=1` on a desktop and this path agree.
if (touchActive()) document.documentElement.classList.add('has-touch');

/**
 * Which door opens, and — the point of this file in v2 — **when anything is
 * booted at all**.
 *
 * v1 called `game.init()` first and decided afterwards. That meant thirty
 * systems, a terrain build, a vegetation pass and a shader compile all ran
 * before a person could read a two-row menu: **6.5 seconds to reach a crest and
 * two labels.** And it meant the studio inherited a fully running game it then
 * had to suppress — pausing the simulation, clearing encounters every frame,
 * hiding a party that had just been spawned.
 *
 * So the choice comes first and the boot follows it:
 *
 *   - **Play** boots the game exactly as before. The attract camera lands where
 *     it belongs, behind the title, during a load a game should be filling with
 *     a vista anyway.
 *   - **Game Studio** boots to a *profile* — nothing for models, five geometry
 *     systems for the world. @see studio/StudioBoot.ts
 *
 * Three URLs bypass the door entirely, and `?shoot=1` is checked first and
 * independently of everything else: the capture harness loads `?q=ultra&shoot=1`
 * and BRIEF rule 2 makes two runs byte-identical, so no door, no title and no
 * studio may ever appear on a page it drives. `?shoot=1&studio=1` opens nothing.
 */
async function route() {
  const shoot = qs.has('shoot');

  // Straight to the studio, skipping the door. This is the door an agent and
  // the gate use, and it is what makes the studio testable at all.
  if (!shoot && qs.has('studio')) return openStudio();

  // The harness, a named scene, and a resumed save all land in the game with no
  // menu in front of them — same as v1.
  if (shoot || qs.has('scene') || qs.has('continue')) return playGame();

  // Otherwise: ask, before booting anything.
  const { FrontDoor } = await import('./studio/FrontDoor.ts');
  const door = new FrontDoor();
  // The boot bar belongs to whatever comes next, not to the door, which has
  // nothing to load. Hide it now and let the chosen path bring it back.
  boot.style.display = 'none';
  const pick = await door.ask(document.body);
  // Let the door's own fade run under the first frames of whatever boots next
  // rather than blocking on it: a 260 ms transition inside a 6.5 s load is
  // 260 ms nobody gets back.
  setTimeout(() => door.dispose(), 400);
  if (pick === 'studio') return openStudio();
  boot.style.display = '';
  return playGame();
}

/** The full game: thirty systems, the title screen, and play. */
async function playGame() {
  await game.init();
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 900);

  // Under the capture harness the page must not free-run: any wall-clock frame
  // between "ready" and the harness taking over would advance TAA history, the
  // exposure integrator and enemy AI by a nondeterministic amount.
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
  // The `!shoot` guard stays a hard determinism gate.
  if (!qs.has('shoot') && qs.get('debug') !== '0') {
    import('./dev/DevSuite.ts')
      .then((m) => m.installDevSuite(game))
      .catch((err) => console.error('[dev] suite failed to load', err));
  }
}

/**
 * The studio, which boots a profile rather than a game.
 *
 * Nothing is booted here: `openStudio` stands up the renderer and an empty
 * scene, and each section asks for what *it* needs when it is opened. The
 * Model Explorer never causes a world to exist.
 */
async function openStudio() {
  boot.style.display = 'none';
  const m = await import('./studio/StudioShell.ts');
  await m.openStudio(game);
}

route().catch((err) => {
  boot.style.display = '';
  label.textContent = 'ERROR';
  console.error(err);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f88;max-width:80vw;white-space:pre-wrap;font-size:11px;letter-spacing:0;text-transform:none';
  pre.textContent = (err && err.stack) || String(err);
  boot.appendChild(pre);
});
