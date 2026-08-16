import { Game } from './game/Game.js';

const boot = document.getElementById('boot');
const bar = document.getElementById('boot-bar');
const label = document.getElementById('boot-label');

const game = new Game({
  container: document.getElementById('app'),
  uiRoot: document.getElementById('ui'),
  onProgress: (t, text) => {
    bar.style.right = `${Math.max(0, 100 - t * 100).toFixed(1)}%`;
    if (text) label.textContent = text;
  },
});

window.GAME = game;

game.init().then(() => {
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 900);
  game.start();
}).catch((err) => {
  label.textContent = 'ERROR';
  console.error(err);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f88;max-width:80vw;white-space:pre-wrap;font-size:11px;letter-spacing:0;text-transform:none';
  pre.textContent = (err && err.stack) || String(err);
  boot.appendChild(pre);
});
