#!/usr/bin/env node
/**
 * Ad-hoc in-page probe: `node src/tools/probe.mts src/tools/probes/foo.mts` runs
 * the file's body in the page.
 *
 *   node src/tools/probe.mts probes/foo.mts --shot tmp/shots/foo.jpg
 *
 * `--shot` grabs the canvas **after the probe body returns and without applying
 * a shot**, which is the one thing `framecam.mts` cannot do: it runs its shots
 * after the probe, and `applyShot` runs a Director scenario that tears down
 * whatever the probe set up. Anything a probe can drive -- a live set piece, a
 * minigame mid-fight, a menu three keystrokes deep -- can now be photographed
 * where it stands. A probe that wants several frames can call
 * `window.__shot(name)` at each moment instead; every one is written next to
 * `--shot`'s path with the name appended.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { harnessArgs, announceBuild, lease, pageOpts } from './harness.mts';
import { mkdir } from 'node:fs/promises';


const argv = process.argv.slice(2);
const shotIx = argv.indexOf('--shot');
const shotPath = shotIx >= 0 ? argv[shotIx + 1] : null;
const probeFile = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--shot');
if (!probeFile) throw new Error('usage: probe.mts <probe.mts> [--shot out.jpg]');
const src = await readFile(probeFile, 'utf8');
const ha = harnessArgs(process.argv.slice(2), {});
announceBuild(ha);
const leased = await lease(pageOpts(ha));
const page = leased.page;
page.on('console', (m) => console.log(`[page:${m.type()}]`, m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
try {

  // `await window.__shot('name')` from inside the probe grabs the canvas *at
  // that moment*. The binding is async, so the page's JS thread is idle while
  // Node takes the frame -- which is what lets a probe photograph four stages
  // of a minigame in one boot instead of four.
  let shotN = 0;
  await page.exposeFunction('__shot', async (name?: string) => {
    if (!shotPath) return false;
    const ext = path.extname(shotPath) || '.jpg';
    const base = shotPath.slice(0, shotPath.length - ext.length);
    const file = `${base}-${name || ++shotN}${ext}`;
    await mkdir(path.dirname(file), { recursive: true });
    // The **page**, not the canvas: half of what a probe is worth
    // photographing is DOM (the prompt, a menu, the fishing gauges), and a
    // canvas-only grab drops every one of them silently.
    await page.screenshot({ path: file, type: ext === '.png' ? 'png' : 'jpeg',
      ...(ext === '.png' ? {} : { quality: 84 }) });
    console.log(`[shot] ${file}`);
    return true;
  });

  const out = await page.evaluate(`(async () => { ${src} })()`);
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));

  if (shotPath) {
    const ext = path.extname(shotPath) || '.jpg';
    const dir = path.dirname(shotPath);
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: shotPath, type: ext === '.png' ? 'png' : 'jpeg',
      ...(ext === '.png' ? {} : { quality: 84 }) });
    console.log(`[shot] ${shotPath}`);
  }
} finally { await leased.release(); }
