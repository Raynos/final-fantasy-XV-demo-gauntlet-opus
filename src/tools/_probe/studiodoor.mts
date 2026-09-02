/*
 * Photograph the front door and the studio behind it.
 *
 * `shoot.mts` cannot do this. It drives a `?shoot=1` page, and `?shoot=1` is
 * exactly the flag that suppresses the title screen and the studio -- by
 * design, because BRIEF rule 2 makes two capture runs byte-identical and no
 * frame in the corpus may contain menu chrome. So this probe reaches past the
 * URL guard and drives the two screens directly:
 *
 *   - `Story.showTitle()` for the front door and the game's own menu, and
 *   - `openStudio(game)` imported at runtime for the studio shell.
 *
 * Both are DOM overlays, and the daemon's capture is a `page.screenshot` rather
 * than a canvas read, so they land in the frame.
 *
 *   node src/tools/probe.mts src/tools/_probe/studiodoor.mts \
 *     --shot tmp/shots/studio/door.jpg --dirty
 */
const g = window.GAME;
const out = [];

// The title screen animates on its own clock: crest at 0.2 s, type at 0.9,
// rule at 1.9, menu at 2.8, footer at 3.4. Anything captured before ~4.5 s of
// title time is a picture of a fade, so every settle here is generous on
// purpose -- a thin frame reads as a broken layout and is not one.
const step = (n) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const breathe = () => new Promise((r) => setTimeout(r, 0));
const settle = async (secs) => {
  for (let i = 0; i < Math.ceil(secs * 6); i++) { step(10); await breathe(); }
};

const story = g.get('Story');
if (!story) return { error: 'no Story system' };

/* ------------------------------------------------------------ front door */

story.showTitle();
await settle(6);
out.push(`front stage=${story.title.stage} rows=${story.title.items.map((i) => i.id).join(',')}`);
await window.__shot('1-frontdoor');

/* --------------------------------------------------- PLAY -> game's menu */

story.title.choose('play');
await settle(2.5);
out.push(`main  stage=${story.title.stage} rows=${story.title.items.map((i) => i.id).join(',')}`);
await window.__shot('2-playmenu');

// And back, which is the Esc path -- worth a frame because the footer legend
// differs between the two stages and a wrong one is invisible in code review.
story.title.setStage('front');
await settle(1.5);

/* ---------------------------------------------------------------- studio */

story.hideTitle();
step(10);
const mod = await import('/studio/StudioShell.ts');
const shell = await mod.openStudio(g);
await settle(1.5);
out.push(`studio touch=${shell.touch} sections=${shell.available().map((s) => s.id).join(',')}`);
out.push(`paused=${g.paused} pointerLocked=${g.input && g.input.pointerLocked}`);
await window.__shot('3-studio');

// One section open, to prove the routing and the chrome, not the content.
const first = shell.available()[0];
document.querySelectorAll('#studio .st-item').forEach((n, i) => { if (i === 0) n.click(); });
await settle(1.0);
out.push(`opened section=${shell.section} (expected ${first && first.id})`);
await window.__shot('4-section');

return { report: out.join('\n') };
