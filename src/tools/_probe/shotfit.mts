// Does a 16:9 framing survive a portrait phone now that the gallery letterboxes?
//
//   node src/tools/probe.mts src/tools/_probe/shotfit.mts --w 393 --h 852 \
//     --shot tmp/shots/shotfit/portrait.jpg --dirty
const g = window.GAME;
const out = [];
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n) => { for (let i = 0; i < n; i++) await raf(); };

g.get('Story')?.hideTitle?.();
// The touch build's portrait gate stands in front of everything until it is
// dismissed once, and dismissing it is exactly what a person holding the phone
// has already done by the time they reach the gallery. @see ui/touch/Rotate.ts
[...document.querySelectorAll('button')]
  .filter((b) => (b.textContent || '').trim() === 'Play anyway')
  .forEach((b) => b.click());
const mod = await import('/studio/StudioShell.ts');
const shell = await mod.openStudio(g);
shell.worldBooted = true;          // @see handoff gotcha 9
await shell.setSection('shots');
await frames(30);

const want = new URLSearchParams(location.search).get('shot') || 'lest_market_day';
const row = shell.gallery.shots().find((s) => s.name === want);
if (!row) return 'no such shot';
out.push(`stand ${row.name} authored fov ${row.fov}`);

// CLICKED, not called: `stand()` moves the camera and the shell never hears
// about it, so the list stays on screen over a correctly framed render. The
// same lesson `studiodoor.mts` records for the Model Explorer.
const rows = () => [...document.querySelectorAll('#studio .st-row')];
const hit = rows().find((r) => (r.textContent || '').includes(want));
if (!hit) return `no row for ${want} in ${rows().length} rows`;
hit.click();
await frames(600);

const cv = g.renderer.domElement;
out.push(`viewport ${cv.clientWidth}x${cv.clientHeight} aspect ${(cv.clientWidth / cv.clientHeight).toFixed(3)}`);
out.push(`camera fov now ${g.camera.fov.toFixed(1)} (authored ${row.fov})`);
out.push(`bar ${getComputedStyle(shell.root).getPropertyValue('--shot-bar').trim()}`);
await window.__shot('shot');
return out.join('\n');
