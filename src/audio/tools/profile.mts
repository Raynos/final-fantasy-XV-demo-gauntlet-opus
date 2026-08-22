#!/usr/bin/env node
/** Where does the audio CPU go? Renders the same 20 s with pieces removed. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PORT = Number(process.env.PORT || 5179);
const portOpen = (p: any) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});
async function ensureServer() {
  if (await portOpen(PORT)) return null;
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    if (await portOpen(PORT)) return proc;
  }
  throw new Error('vite failed');
}

const PROFILE = async (mode: any) => {
  const wavePW = (ctx: any) => {
    const N = 32, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) im[n] = (1 / Math.pow(n, 1.08)) * Math.exp(-n / 15);
    return ctx.createPeriodicWave(re, im);
  };
  const Audio = window.GAME.get('Audio').constructor;
  const seconds = 20;
  const t0 = performance.now();
  const { stats } = await Audio.renderSession({
    seconds,
    sampleRate: 44100,
    script: (api: any) => {
      const { score, sfx, amb, graph } = api;
      const near = { x: 3, y: 1.2, z: -4 };
      // Micro-benchmarks: how much does one voice of each kind actually cost?
      if (mode.startsWith('micro:')) {
        graph.sendLong.gain.value = 0; graph.sendShort.gain.value = 0;
        amb.out.gain.value = 0;
        score.setState('silence', { immediate: true });
        const ctx = api.ctx;
        const what = mode.slice(6);
        const N = 20;
        const dst = graph.bus.music;
        for (let i = 0; i < N; i++) {
          const f = 110 * (1 + i * 0.07);
          if (what === 'sine' || what === 'pw' || what === 'pwvib' || what === 'pwfilt') {
            const o1 = ctx.createOscillator();
            if (what === 'sine') o1.type = 'sawtooth';
            else o1.setPeriodicWave(api.inst.constructor === Object ? null : wavePW(ctx));
            o1.frequency.value = f;
            const g = ctx.createGain(); g.gain.value = 0.02;
            let node = o1;
            if (what === 'pwfilt') {
              const bq = ctx.createBiquadFilter();
              bq.type = 'lowpass'; bq.frequency.value = f * 5;
              o1.connect(bq); node = bq;
            }
            if (what === 'pwvib') {
              const lfo = ctx.createOscillator(); lfo.frequency.value = 5;
              const lg = ctx.createGain(); lg.gain.value = 8;
              lfo.connect(lg); lg.connect(o1.detune); lfo.start(0);
            }
            node.connect(g); g.connect(dst);
            o1.start(0); o1.stop(seconds);
          } else if (what === 'strings') {
            api.inst.strings(f, 0, seconds - 1, { dest: dst, gain: 0.2 });
          } else if (what === 'choir') {
            if (i < 6) api.inst.choir(f, 0, seconds - 1, { dest: dst, gain: 0.2 });
          } else if (what === 'brass') {
            api.inst.brass(f, 0, seconds - 1, { dest: dst, gain: 0.2 });
          } else if (what === 'pad') {
            api.inst.pad(f, 0, seconds - 1, { dest: dst, gain: 0.2 });
          }
        }
        return;
      }
      if (mode === 'baseline') {
        graph.sendLong.gain.value = 0; graph.sendShort.gain.value = 0;
        return;
      }
      if (mode !== 'reverb') { graph.sendLong.gain.value = 0; graph.sendShort.gain.value = 0; }
      if (mode === 'reverb') { score.setState('silence', { immediate: true }); return; }
      if (mode === 'music' || mode === 'all') {
        score.setState('combat', { immediate: true });
        score.setIntensity(1);
      } else score.setState('silence', { immediate: true });
      if (mode === 'ambience' || mode === 'all') {
        amb.setTimeOfDay(20, 0.8, 0); amb.setWind(2.8, 0); amb.setRain(1, 0);
        amb.scheduleUntil(seconds, { x: 0, y: 1.6, z: 0 });
      } else {
        amb.out.gain.value = 0;
      }
      if (mode === 'sfx' || mode === 'all' || mode === 'sfxHrtf') {
        for (let i = 0; i < 40; i++) {
          const t = 0.4 + i * 0.45;
          sfx.play('swing:sword', near, { at: t });
          sfx.play('impact:flesh', near, { at: t + 0.13, hrtf: mode === 'sfxHrtf' });
          sfx.play('step:gravel', null, { at: t + 0.25, minGap: 0.01 });
        }
      }
    },
  });
  return { mode, ms: +(performance.now() - t0).toFixed(0), realtimeX: +(seconds * 1000 / (performance.now() - t0)).toFixed(2), stats: stats.graph };
};

const main = async () => {
  const server = await ensureServer();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto(`http://127.0.0.1:${PORT}/?shoot=1&q=low`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 180000 });
  await page.evaluate(() => window.GAME.stop());
  const modes = process.argv.slice(2).length ? process.argv.slice(2)
    : ['baseline', 'reverb', 'music', 'ambience', 'sfx', 'sfxHrtf', 'all'];
  for (const mode of modes) {
    const r = await page.evaluate(PROFILE, mode);
    console.log(`${mode.padEnd(9)} ${String(r.ms).padStart(6)} ms for 20 s  (${r.realtimeX}x realtime)  peakVoices ${r.stats.peakVoices}`);
  }
  await browser.close();
  if (server) server.kill();
};
main().catch((e) => { console.error(e); process.exit(1); });
