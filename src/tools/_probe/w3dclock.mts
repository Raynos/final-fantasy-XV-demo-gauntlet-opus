/*
 * Lane W3-D: does the clock run, and does it leave the corpus alone?
 *
 *   node src/tools/probe.mts src/tools/_probe/w3dclock.mts
 *
 * Four questions, in the order they can lie to you:
 *  1. A posed shot must be PINNED. `applyShot` sets the hour and `settle()`
 *     steps hundreds of frames; if the clock ran through those, every one of
 *     the 166 corpus frames would depend on its settle count.
 *  2. The title screen must be pinned ("golden hour, always").
 *  3. Live play must ADVANCE, at the authored rate.
 *  4. A scripted `setTimeOfDay` must still win while live.
 * Plus: how often `Sky._updateEnv` (a PMREM rebake) fires once time moves.
 */
const g = window.GAME;
const out = [];
const sky = g.get('Sky');
const rpg = g.get('Rpg');
const day = rpg.day;
const story = g.get('Story');
const step = (n) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const f2 = (v) => Number(v).toFixed(3);

// --- instrument the env rebake (instance-level, no file is edited) ---------
let envCalls = 0, envMs = 0;
const rawEnv = sky._updateEnv.bind(sky);
sky._updateEnv = function () { const t0 = performance.now(); rawEnv(); envMs += performance.now() - t0; envCalls++; };

/* 1. a posed shot is pinned ------------------------------------------------ */
for (const name of ['hud_field', 'landmark_meteor', 'lest_overlook_disc']) {
  const shot = g.applyShot(name);
  const before = sky.hours;
  g.settle(200);
  const after = sky.hours;
  out.push(`  ${Math.abs(after - before) < 1e-9 ? 'ok  ' : 'FAIL'}  shot ${name.padEnd(20)} authored ${f2(shot.time)}  sky ${f2(before)} -> ${f2(after)} over 200 settle frames  (currentShot=${g.currentShot})`);
}

/* 2. the title screen is pinned -------------------------------------------- */
g.get('Director').play();
story.showTitle();
step(4);
const tBefore = sky.hours;
step(600);                                   // ten real seconds of reading
const tAfter = sky.hours;
out.push(`  ${Math.abs(tAfter - tBefore) < 1e-9 ? 'ok  ' : 'FAIL'}  title screen pinned      sky ${f2(tBefore)} -> ${f2(tAfter)} over 600 frames (shown=${story.title.shown})`);
story.title.hide();
g.get('Director').play();
step(4);

/* 3. live play advances ----------------------------------------------------- */
sky.setTimeOfDay(12.0);
step(4);
envCalls = 0; envMs = 0;
const h0 = sky.hours, d0 = day.hour;
const t0 = performance.now();
step(3600);                                  // one real minute at 60 Hz
const wall = (performance.now() - t0) / 1000;
const h1 = sky.hours, d1 = day.hour;
const gainedSky = h1 - h0, gainedDay = d1 - d0;
// 0.4 in-game minutes per real second = 0.4 h per real minute.
const want = 0.4;
out.push(`  ${Math.abs(gainedDay - want) < 0.01 ? 'ok  ' : 'FAIL'}  one real minute of play  DayCycle ${f2(d0)} -> ${f2(d1)} (+${f2(gainedDay)} h, want +${want})`);
out.push(`  ${Math.abs(gainedSky - gainedDay) < 0.01 ? 'ok  ' : 'FAIL'}  the sky followed it      Sky ${f2(h0)} -> ${f2(h1)} (+${f2(gainedSky)} h, lag ${f2(Math.abs(gainedSky - gainedDay))})`);
out.push(`        clock reads ${day.clockString}, DAY ${day.day}, ${day.phase.name.toUpperCase()}, nightDepth ${f2(day.nightDepth)}`);
out.push(`        env rebakes: ${envCalls} in 3600 frames (${(3600 / 60 / Math.max(1, envCalls)).toFixed(1)} s apart), ${envMs.toFixed(1)} ms total, ${(envMs / Math.max(1, envCalls)).toFixed(2)} ms each`);
out.push(`        3600 frames took ${wall.toFixed(1)} s of wall clock in this probe`);

/* 4. a scripted set still wins ---------------------------------------------- */
sky.setTimeOfDay(21.0);
step(6);
out.push(`  ${Math.abs(day.hour - 21.0) < 0.02 ? 'ok  ' : 'FAIL'}  scripted setTimeOfDay wins  sky 21.000 -> DayCycle ${f2(day.hour)} after 6 frames`);
step(1800);
out.push(`        and the clock carries on from there: ${day.clockString} after another 30 s (isNight=${day.isNight}, depth ${f2(day.nightDepth)})`);

/* 5. what half an hour looks like ------------------------------------------- */
sky.setTimeOfDay(12.0); step(4);
// Coarse dt on purpose: `advance()` is linear in dt, so 120 half-second steps
// is the same half-hour of clock as 108000 frames and does not hold the lease
// for a quarter of an hour to say so.
const bigStep = (n) => { for (let i = 0; i < n; i++) g.frame(0.5); };
const marks = [];
for (let m = 1; m <= 30; m++) { bigStep(120); if (m % 5 === 0) marks.push(`${m}m ${day.clockString} ${day.phase.name}`); }
out.push(`        a 30-minute session from 12:00: ${marks.join(' | ')}`);

sky._updateEnv = rawEnv;
return out.join('\n');
