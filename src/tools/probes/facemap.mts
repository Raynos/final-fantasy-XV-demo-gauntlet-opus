/**
 * Put the painted face map on screen so it can be *looked at*.
 *
 *   node src/tools/probe.mts src/tools/probes/facemap.mts --shot tmp/shots/x/m.png --dirty
 *
 * `paintFace` claims to carry "what lighting cannot resolve at gameplay
 * distance: the value structure of a face — sockets, nostrils, the vermilion
 * border". Nothing in a shipped frame shows any of it, and there are two very
 * different reasons that could be true: the paint is weak, or the paint is
 * strong and something downstream is eating it. This decides which, in one
 * picture, before anybody re-tints anything.
 *
 * Draws mip 0 (left) and mip 3 (right) of every hero's face map, upright, on a
 * black page over the canvas. Mip 3 is roughly what a 0.5 m portrait samples.
 */
const g = window.GAME;
g.settle(5);

const party = g.get('Party');
const player = g.get('Player');
const subjects = [['noctis', player], ['gladio', party && party.get && party.get('gladio')],
  ['ignis', party && party.get && party.get('ignis')], ['prompto', party && party.get && party.get('prompto')]];

const wrap = document.createElement('div');
wrap.style.cssText = 'position:fixed;inset:0;background:#000;z-index:999999;display:flex;'
  + 'flex-wrap:wrap;align-items:center;justify-content:center;gap:4px';
document.body.appendChild(wrap);

const info = [];
for (const [key, m] of subjects) {
  const ch = m && m.character;
  const map = ch && ch.faceMat && ch.faceMat.map;
  if (!map || !map.mipmaps) { info.push(`${key}: no map`); continue; }
  info.push(`${key}: mips ${map.mipmaps.length} base ${map.mipmaps[0].width}x${map.mipmaps[0].height}`);
  for (const lvl of [0, 3]) {
    const src = map.mipmaps[Math.min(lvl, map.mipmaps.length - 1)];
    const c = document.createElement('canvas');
    c.width = 210; c.height = 210;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    // the map is a cylindrical projection; the face is the middle third in u,
    // and v runs bottom-up in canonical head space, so flip it for reading
    cx.save();
    cx.translate(0, 210); cx.scale(1, -1);
    cx.drawImage(src, src.width * 0.33, 0, src.width * 0.34, src.height, 0, 0, 210, 210);
    cx.restore();
    c.style.cssText = 'image-rendering:pixelated;border:1px solid #333';
    c.title = `${key} mip${lvl}`;
    wrap.appendChild(c);
  }
}
const lab = document.createElement('div');
lab.style.cssText = 'color:#8f8;font:11px monospace;width:100%;text-align:center';
lab.textContent = 'noctis mip0 | mip3 || gladio mip0 | mip3 || ignis mip0 | mip3 || prompto mip0 | mip3';
wrap.appendChild(lab);

await window.__shot('facemap');
wrap.remove();
return info.join('\n');
