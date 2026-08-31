/*
 * Lane W3-D: what does a *moving* clock cost per frame?
 *
 *   node src/tools/probe.mts src/tools/_probe/w3denv.mts
 *
 * A running clock crosses `Sky`'s 0.08-hour environment threshold about every
 * twelve seconds, and `_updateEnv` renders a PMREM cubemap. Nothing had ever
 * paid that during play, because the hour never moved. So: per-frame wall time
 * with the clock running against the same frames with it pinned, and the cost
 * of the rebake itself broken out call by call rather than averaged.
 */
const g = window.GAME;
const out = [];
const sky = g.get('Sky');
const day = g.get('Rpg').day;
const step = (n) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };

g.applyShot('hud_field');
g.get('Director').play();
g.get('Story')?.applyShot?.(null);
g.settle(120);

const pct = (a, q) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))];
const run = (label, n) => {
  const each = [];
  let envCalls = 0;
  const raw = sky._updateEnv.bind(sky);
  const envEach = [];
  sky._updateEnv = function () { const t0 = performance.now(); raw(); envEach.push(performance.now() - t0); envCalls++; };
  for (let i = 0; i < n; i++) { const t0 = performance.now(); g.frame(1 / 60); each.push(performance.now() - t0); }
  sky._updateEnv = raw;
  out.push(`  ${label.padEnd(22)} p50 ${pct(each, 0.5).toFixed(1)} ms  p99 ${pct(each, 0.99).toFixed(1)} ms  max ${Math.max(...each).toFixed(1)} ms  envRebakes ${envCalls}${envEach.length ? ` [${envEach.map((v) => v.toFixed(0)).join(', ')}] ms` : ''}`);
  return each;
};

// Pinned: exactly what every frame in this repo has ever measured.
day.running = false;
run('clock pinned', 900);
// Running: the clock crosses the env threshold ~1.5x in 900 frames.
day.running = true;
run('clock running', 900);
run('clock running (again)', 900);

// The rebake in isolation, ten times, so a first-call outlier cannot hide in a
// mean: the very first is shader/pipeline warm and is not what a player pays.
const solo = [];
for (let i = 0; i < 10; i++) { const t0 = performance.now(); sky._updateEnv(); solo.push(performance.now() - t0); }
out.push(`  _updateEnv alone x10:  [${solo.map((v) => v.toFixed(0)).join(', ')}] ms  (median ${pct(solo, 0.5).toFixed(0)} ms)`);
out.push(`  NOTE: this is a software-GL harness worker; treat these as a ratio to the p50 frame, not as a device number.`);
return out.join('\n');
