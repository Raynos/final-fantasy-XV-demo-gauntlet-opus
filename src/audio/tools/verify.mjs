#!/usr/bin/env node
/**
 * Throwaway audio verification harness.
 *
 * You cannot screenshot a mix, so this renders one. It boots the real game,
 * drives a scripted session (explore -> tension -> combat -> victory -> night ->
 * camp -> storm) through an OfflineAudioContext, pulls the rendered buffer back
 * and asserts things about it; then it runs the live game with and without
 * audio to measure the frame-time cost.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PORT = Number(process.env.PORT || 5179);

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

async function ensureServer() {
  if (await portOpen(PORT)) return null;
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'],
  });
  proc.stderr.on('data', (d) => process.env.VERBOSE && console.error(String(d)));
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    if (await portOpen(PORT)) return proc;
  }
  throw new Error('vite failed to start');
}

/* ---------------------------------------------------------------- page fns */

/** Renders the scripted session offline and analyses the result. */
const OFFLINE = async (seconds) => {
  const Audio = window.GAME.get('Audio').constructor;
  const marks = [];
  const t0 = performance.now();
  const { buffer, stats } = await Audio.renderSession({
    seconds,
    sampleRate: 44100,
    script: (api) => {
      const { score, sfx, amb } = api;
      const O = { x: 0, y: 1.6, z: 0 };
      const near = { x: 3, y: 1.2, z: -4 };

      const mark = (t, label) => score.at(t, (s) => marks.push({ t, label, state: s.stateName }));

      /* -- ambience timeline ------------------------------------------- */
      amb.setTimeOfDay(9.0, 0, 0);
      amb.setWind(1.1, 0);
      amb.setRain(0, 0);
      amb.scheduleUntil(38, O);
      amb.setTimeOfDay(21.5, 0.6, 38);
      amb.setWind(2.6, 44);
      amb.setRain(1.0, 44);
      amb.scheduleUntil(seconds, O);

      /* -- music timeline ----------------------------------------------- */
      score.setState('field', { immediate: true });
      mark(2, 'field');
      score.at(11, (s) => s.setState('tension', { fade: 2.0 }));
      mark(15, 'tension');
      score.at(17, (s) => { s.setState('combat', { fade: 1.2 }); s.setIntensity(0.85); });
      mark(24, 'combat');
      score.at(31, (s) => { s.setState('boss', { fade: 1.4 }); s.setIntensity(1); });
      mark(35, 'boss');
      score.at(37, (s) => s.victory());
      mark(39, 'victory');
      score.at(43, (s) => s.setState('night', { fade: 2.5 }));
      mark(47, 'night');
      score.at(50, (s) => s.setState('camp', { fade: 2.5 }));
      mark(55, 'camp');

      /* -- combat SFX stream -------------------------------------------- */
      const kinds = ['sword', 'greatsword', 'polearm', 'daggers'];
      for (let i = 0; i < 34; i++) {
        const t = 17.4 + i * 0.42;
        sfx.play(`swing:${kinds[i % 4]}`, near, { at: t });
        sfx.play('impact:flesh', near, { at: t + 0.13, hrtf: true });
        if (i % 4 === 3) sfx.play('impact:metal', near, { at: t + 0.14 });
        if (i % 7 === 0) sfx.play('voc:sabertusk:hurt', near, { at: t + 0.2 });
        if (i % 9 === 4) sfx.play('voc:mt:aggro', near, { at: t + 0.05 });
      }
      sfx.play('warp:start', O, { at: 20.0 });
      sfx.play('warp:impact', near, { at: 20.3 });
      sfx.play('parry', near, { at: 23.1 });
      sfx.play('spell:fire', near, { at: 25.0 });
      sfx.play('spell:ice', near, { at: 27.0 });
      sfx.play('spell:lightning', near, { at: 29.0 });
      sfx.play('armiger', null, { at: 32.0 });
      for (let i = 0; i < 12; i++) sfx.play('armigerHit', near, { at: 32.8 + i * 0.17 });
      sfx.play('voc:irongiant:aggro', { x: 8, y: 3, z: -10 }, { at: 31.2 });
      sfx.play('voc:irongiant:death', { x: 8, y: 3, z: -10 }, { at: 36.4 });
      sfx.play('grunt', null, { at: 26.2 });
      sfx.play('stagger', near, { at: 28.4 });
      sfx.play('link', near, { at: 30.1 });

      /* -- traversal / UI / weather -------------------------------------- */
      const surfaces = ['grass', 'dirt', 'sand', 'gravel', 'rock', 'road'];
      for (let i = 0; i < 60; i++) {
        sfx.play(`step:${surfaces[Math.floor(i / 10) % 6]}`, null, {
          at: 2 + i * 0.55, run: i % 3 === 0, volume: 0.8, minGap: 0.01,
        });
      }
      sfx.play('ui:open', null, { at: 40.2 });
      sfx.play('ui:move', null, { at: 40.6 });
      sfx.play('ui:confirm', null, { at: 41.0 });
      sfx.play('ui:cancel', null, { at: 41.4 });
      sfx.play('ui:close', null, { at: 41.8 });
      sfx.play('levelup', null, { at: 42.2 });
      sfx.play('quest', null, { at: 44.0 });
      sfx.play('item', null, { at: 45.0 });
      sfx.play('thunder', null, { at: 46.0, distance: 320 });
      sfx.play('thunder', null, { at: 51.0, distance: 2200 });
      sfx.play('splash', { x: -4, y: 0, z: 2 }, { at: 53.0 });
      sfx.play('howl', { x: 40, y: 3, z: 30 }, { at: 54.5 });
    },
  });
  const renderMs = performance.now() - t0;
  await new Promise((r) => setTimeout(r, 800));   // let onended drain
  const after = window.GAME.get('Audio').constructor;
  void after;

  /* -------- analysis ------------------------------------------------- */
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const sr = buffer.sampleRate;
  const win = sr;                                  // one second
  const windows = [];
  let peak = 0, clipped = 0, sum2 = 0;
  let lp = 0, lowSum = 0, highSum = 0, dc = 0;
  for (let i = 0; i < L.length; i++) {
    const v = (L[i] + R[i]) * 0.5;
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    sum2 += v * v;
    dc += v;
    lp += (v - lp) * 0.012;                        // ~85 Hz one-pole
    lowSum += lp * lp;
    const hi = v - lp;
    highSum += hi * hi;
  }
  for (let w = 0; w * win < L.length; w++) {
    let s2 = 0, pk = 0, n = 0;
    for (let i = w * win; i < Math.min(L.length, (w + 1) * win); i++) {
      const v = (L[i] + R[i]) * 0.5;
      s2 += v * v; n++;
      if (Math.abs(v) > pk) pk = Math.abs(v);
    }
    const rms = Math.sqrt(s2 / Math.max(1, n));
    windows.push({ s: w, rms: +rms.toFixed(5), db: +(20 * Math.log10(Math.max(1e-9, rms))).toFixed(1), peak: +pk.toFixed(3) });
  }
  // stereo width: correlation between channels
  let lr = 0, ll = 0, rr = 0;
  for (let i = 0; i < L.length; i += 7) { lr += L[i] * R[i]; ll += L[i] * L[i]; rr += R[i] * R[i]; }
  const corr = lr / Math.max(1e-9, Math.sqrt(ll * rr));

  return {
    renderMs: +renderMs.toFixed(0),
    seconds, sampleRate: sr,
    peak: +peak.toFixed(4),
    clippedSamples: clipped,
    rms: +Math.sqrt(sum2 / L.length).toFixed(5),
    rmsDb: +(20 * Math.log10(Math.max(1e-9, Math.sqrt(sum2 / L.length)))).toFixed(2),
    dcOffset: +(dc / L.length).toFixed(6),
    lowBandFraction: +(lowSum / Math.max(1e-9, lowSum + highSum)).toFixed(3),
    stereoCorrelation: +corr.toFixed(3),
    windows, marks, stats,
  };
};

/** Renders the score alone and reports the level of each cue. */
const MUSIC_ONLY = async (args) => {
  const [seconds, raw] = Array.isArray(args) ? args : [args, false];
  const Audio = window.GAME.get('Audio').constructor;
  const plan = [[0, 'field'], [12, 'tension'], [20, 'combat'], [32, 'boss'], [42, 'victory'], [50, 'night']];
  const { buffer } = await Audio.renderSession({
    seconds, sampleRate: 44100,
    script: (api) => {
      api.amb.out.gain.value = 0;
      if (raw) {
        // Bypass the master chain to see the score's own dynamics.
        api.graph.glue.threshold.value = 0;
        api.graph.limiter.threshold.value = 0;
        api.graph.saturator.curve = null;
      }
      api.score.setState('field', { immediate: true });
      api.score.setIntensity(0.85);
      for (const [t, name] of plan) {
        if (t === 0) continue;
        api.score.at(t, (s) => (name === 'victory' ? s.victory() : s.setState(name, { fade: 1.5 })));
      }
    },
  });
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1), sr = buffer.sampleRate;
  const rms = (a, b) => {
    let s2 = 0, n = 0;
    for (let i = Math.floor(a * sr); i < Math.floor(b * sr) && i < L.length; i++) {
      const v = (L[i] + R[i]) * 0.5; s2 += v * v; n++;
    }
    return +(20 * Math.log10(Math.max(1e-9, Math.sqrt(s2 / Math.max(1, n))))).toFixed(2);
  };
  // Sample each cue after its cross-fade has settled.
  return {
    field: rms(4, 11), tension: rms(15, 19), combat: rms(23, 31),
    boss: rms(35, 41), victory: rms(44, 48), night: rms(53, 58),
  };
};

/** Renders one cue in isolation for 16 s and returns its level. */
const CUE = async (args) => {
  const [name, raw] = args;
  const Audio = window.GAME.get('Audio').constructor;
  const { buffer } = await Audio.renderSession({
    seconds: 16, sampleRate: 44100,
    script: (api) => {
      api.amb.out.gain.value = 0;
      if (raw) {
        api.graph.glue.ratio.value = 1; api.graph.glue.knee.value = 0; api.graph.glue.threshold.value = 0;
        api.graph.limiter.ratio.value = 1; api.graph.limiter.knee.value = 0; api.graph.limiter.threshold.value = 0;
        api.graph.saturator.curve = null;
      }
      api.score.setState(name, { immediate: true, fade: 0.4 });
      api.score.setIntensity(0.85);
    },
  });
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1), sr = buffer.sampleRate;
  let s2 = 0, n = 0, pk = 0;
  for (let i = Math.floor(4 * sr); i < Math.floor(15 * sr); i++) {
    const v = (L[i] + R[i]) * 0.5; s2 += v * v; n++;
    if (Math.abs(v) > pk) pk = Math.abs(v);
  }
  return { db: +(20 * Math.log10(Math.max(1e-9, Math.sqrt(s2 / n)))).toFixed(2), peak: +pk.toFixed(3) };
};

/**
 * Interleaved A/B frame-time measurement.
 *
 * Two separate page loads is not a measurement — under software rendering the
 * run-to-run spread swamps the effect. Instead this runs one page and
 * alternates blocks with the AudioContext suspended (audio thread idle, no
 * scheduler) and running, so both conditions see the same thermal state, the
 * same GPU, the same heap.
 */
const AB = async (blocks) => {
  const g = window.GAME;
  const audio = g.get('Audio');
  const player = g.get('Player');
  const combat = g.get('Combat');
  const enemies = g.get('Enemies');
  const rig = g.get('CameraRig');
  g.applyShot('hud_field');
  rig?.clearShot?.();
  g.resetClock();
  if (enemies && enemies.spawn && enemies.list.length < 3) {
    const p = player.position;
    for (let i = 0; i < 3; i++) {
      enemies.spawn(['sabertusk', 'goblin', 'mt'][i], { pos: [p.x + 6 + i * 3, 0, p.z + 8] });
    }
  }
  const inp = g.input;
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const on = [], off = [];
  let frame = 0;
  const runBlock = async (n, sink) => {
    const t = [];
    for (let i = 0; i < n; i++, frame++) {
      inp.keys.clear();
      inp.keys.add('KeyW');
      if (frame % 3 === 0) inp.keys.add('ShiftLeft');
      if (combat && frame % 24 === 0) combat.attack();
      if (combat && frame % 210 === 40) combat.warpStrike();
      if (combat && frame % 260 === 90) combat.cast('fire');
      if (combat && frame % 400 === 200) combat.armigerBurst();
      const t0 = performance.now();
      g.frame(1 / 60);
      t.push(performance.now() - t0);
      if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    t.sort((a, b) => a - b);
    sink.push(t[Math.floor(t.length * 0.5)]);
  };

  const withAudio = async (want) => {
    if (want) { await audio.ctx.resume(); await new Promise((r) => setTimeout(r, 260)); }
    else { await audio.ctx.suspend(); await new Promise((r) => setTimeout(r, 140)); }
  };
  await runBlock(90, []);                        // warm-up, discarded
  // ABBA ordering: any thermal or GC drift through the run biases both
  // conditions equally instead of whichever one happens to run last.
  for (let b = 0; b < blocks; b++) {
    const order = b % 2 === 0 ? [false, true, true, false] : [true, false, false, true];
    for (const want of order) {
      await withAudio(want);
      await runBlock(70, want ? on : off);
    }
  }
  return {
    onMedian: +med(on).toFixed(2),
    offMedian: +med(off).toFixed(2),
    on: on.map((v) => +v.toFixed(2)),
    off: off.map((v) => +v.toFixed(2)),
    updateMs: +audio.cpuMs.toFixed(3),
    audio: audio.stats(),
  };
};

/* --------------------------------------------------------------------- run */

async function main() {
  const server = await ensureServer();
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--mute-audio',
      '--autoplay-policy=no-user-gesture-required'],
  });
  const errors = [];
  const open = async (query) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => errors.push(`[${query}] ${e}\n${e.stack || ''}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`[${query}] ${m.text()}`);
      if (process.env.VERBOSE) console.log('  page>', m.text());
    });
    await page.goto(`http://127.0.0.1:${PORT}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 180000 });
    await page.evaluate(() => { window.GAME.stop(); document.getElementById('boot')?.remove(); });
    return page;
  };

  const out = {};
  const only = process.argv.includes('--music');
  try {
    if (process.argv.includes('--probe')) {
      const pp = await open('shoot=1&q=low');
      const raw = process.argv.includes('--raw');
      for (const name of ['silence', 'tension', 'night', 'camp', 'field', 'combat', 'boss', 'victory']) {
        const r = await pp.evaluate(CUE, [name, raw]);
        console.log(`${name.padEnd(9)} ${String(r.db).padStart(7)} dBFS   peak ${r.peak}`);
      }
      await pp.close();
      await browser.close();
      if (server) server.kill();
      process.exit(0);
    }
    if (only) {
      const pm0 = await open('shoot=1&q=low');
      const r = await pm0.evaluate(MUSIC_ONLY, [60, process.argv.includes('--raw')]);
      console.log(Object.entries(r).map(([k, v]) => `${k} ${v}`).join('   '));
      await pm0.close();
      await browser.close();
      if (server) server.kill();
      process.exit(0);
    }
    console.log('== offline render ==');
    const p1 = await open('shoot=1&q=high');
    out.offline = await p1.evaluate(OFFLINE, 60);
    await p1.close();

    console.log('== music-only render ==');
    const pm = await open('shoot=1&q=low');
    out.music = await pm.evaluate(MUSIC_ONLY, [60, false]);
    await pm.close();

    console.log('== live A/B frame cost ==');
    const p2 = await open('shoot=1&audio=force&q=high');
    out.ab = await p2.evaluate(AB, 2);
    // Settle: let every tail ring out and the teardown sweep run, then look for
    // anything still holding nodes.
    out.settled = await p2.evaluate(async () => {
      const g = window.GAME;
      g.input.keys.clear();
      // Stop the score first: the leak question is "does anything outlive its
      // schedule", and a running orchestra always has notes in flight.
      g.get('Audio').score.stop();
      // Real time has to pass, not simulated time: a scheduled source only
      // ends when the audio clock reaches it.
      for (let i = 0; i < 70; i++) {
        g.frame(1 / 60);
        await new Promise((r) => setTimeout(r, 110));
      }
      return g.get('Audio').stats();
    });
    await p2.close();
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  const o = out.offline;
  console.log('\n--- offline session ---------------------------------------');
  console.log(`render ${o.seconds}s in ${o.renderMs} ms (${(o.seconds * 1000 / o.renderMs).toFixed(1)}x realtime)`);
  console.log(`peak ${o.peak}  clipped ${o.clippedSamples}  rms ${o.rmsDb} dBFS  dc ${o.dcOffset}`);
  console.log(`low-band ${o.lowBandFraction}  stereo corr ${o.stereoCorrelation}`);
  console.log('marks:', o.marks.map((m) => `${m.t}s=${m.state}`).join(' '));
  console.log('graph:', JSON.stringify(o.stats.graph));
  console.log('score:', JSON.stringify(o.stats.score));
  console.log('sfx:', JSON.stringify(o.stats.sfx));
  console.log('per-second dBFS:');
  console.log(o.windows.map((w) => `${String(w.s).padStart(2)}:${String(w.db).padStart(6)}`).join(' '));

  console.log('\n--- score dynamics (music bus alone, dBFS RMS) -------------');
  console.log(Object.entries(out.music).map(([k, v]) => `${k} ${v}`).join('   '));

  const ab = out.ab;
  console.log('\n--- frame cost (interleaved A/B) ---------------------------');
  console.log(`audio suspended  block medians ${ab.off.join(' ')}  -> ${ab.offMedian} ms`);
  console.log(`audio running    block medians ${ab.on.join(' ')}  -> ${ab.onMedian} ms`);
  console.log(`delta            ${(ab.onMedian - ab.offMedian).toFixed(2)} ms/frame`);
  console.log(`AudioSystem.update  ${ab.updateMs} ms/frame (main thread)`);
  console.log('audio stats:', JSON.stringify(ab.audio, null, 1));
  console.log('after settling:', JSON.stringify(out.settled.graph));

  /* ---------------------------------------------------------- assertions */
  const fail = [];
  const check = (cond, msg) => { if (!cond) fail.push(msg); else console.log(`  ok  ${msg}`); };
  console.log('\n--- assertions --------------------------------------------');
  check(o.clippedSamples === 0, 'nothing clips');
  check(o.peak > 0.10 && o.peak <= 1.0, `peak in range (${o.peak})`);
  check(o.rmsDb > -30 && o.rmsDb < -13, `programme level sane (${o.rmsDb} dBFS)`);
  check(Math.abs(o.dcOffset) < 0.002, `no DC offset (${o.dcOffset})`);
  check(o.stereoCorrelation < 0.999, `mix is stereo (corr ${o.stereoCorrelation})`);
  check(o.windows.every((w) => w.rms > 0.0004), 'no silent second');
  const at = (s) => o.windows[s] ? o.windows[s].rms : 0;
  const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += at(i); return s / (b - a); };
  const m = out.music;
  check(m.combat > m.field + 2, `combat cue is louder than field (${m.combat} vs ${m.field} dBFS)`);
  check(m.boss > m.combat - 0.5, `boss cue is at least as big as combat (${m.boss} vs ${m.combat})`);
  check(m.tension < m.field - 1.5, `tension cue is quieter than field (${m.tension} vs ${m.field})`);
  check(m.victory > m.night + 3, `victory is louder than the night cue (${m.victory} vs ${m.night})`);
  check(m.night < m.field, `night cue is more restrained than day (${m.night} vs ${m.field})`);
  void avg;
  const seen = new Set(o.marks.map((m) => m.state));
  for (const s of ['field', 'tension', 'combat', 'boss', 'victory', 'night', 'camp']) {
    check(seen.has(s), `score reached "${s}"`);
  }
  check(o.stats.score.notesScheduled > 500, `score wrote real music (${o.stats.score.notesScheduled} notes)`);
  check(o.stats.sfx.played > 170, `sfx bank fired (${o.stats.sfx.played} shots)`);
  check(o.stats.graph.dropped / Math.max(1, o.stats.graph.nodesMade) < 0.12,
    `voice budget rarely hit (${o.stats.graph.dropped} dropped of ${o.stats.graph.nodesMade})`);
  check(o.stats.graph.peakVoices <= 72, `peak voices within budget (${o.stats.graph.peakVoices})`);
  const live = out.settled.graph;
  check(live.leaked <= live.voices + 6,
    `no voice leak after settling (made ${live.nodesMade}, freed ${live.nodesFreed}, `
    + `outstanding ${live.leaked}, still sounding ${live.voices})`);
  check(ab.updateMs < 0.5, `AudioSystem.update under 0.5 ms/frame (${ab.updateMs})`);
  check(ab.onMedian - ab.offMedian < 4.0,
    `audio frame cost inside measurement noise (${(ab.onMedian - ab.offMedian).toFixed(2)} ms, sigma ~3 ms on this box)`);
  check(ab.audio.graph.peakVoices <= 72, `live peak voices ${ab.audio.graph.peakVoices}`);
  check(errors.length === 0, `no console errors (${errors.length})`);
  if (errors.length) console.log(errors.slice(0, 12).join('\n'));

  console.log(fail.length ? `\nFAILED ${fail.length}:\n - ${fail.join('\n - ')}` : '\nALL CHECKS PASSED');
  process.exit(fail.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
