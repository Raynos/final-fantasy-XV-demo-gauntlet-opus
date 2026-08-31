// **Can you walk up the hills this world actually has?**
//
// `longplay` has been printing "gave up on N unreachable spot(s), turned away
// from being stuck M time(s)" all night and nobody read it as a defect. Its own
// source comment records the shape of it: at game minute 2.8 a route reached a
// slope too steep to climb and the probe held W into it for the remaining 27
// minutes, `grounded` true and position pinned to the metre. A blind 30-minute
// playtest then hit the same wall in prose — "running at a hill, I simply
// stopped; ten seconds of sprint moved me one metre" — and stalled 600 m short
// of a lake it could see on the map.
//
// This probe is the instrument that was missing. It reports two things:
//
//  1. **A slope census** of the terrain field the player walks on, as an angle
//     histogram plus the fraction of the world above each candidate limit. A
//     traversal limit is a design choice, but it has to be made against how
//     much of THIS world it excludes, not against a number copied from another
//     game.
//  2. **Walk trials.** Noctis is placed at the foot of real hillsides binned by
//     steepness, pointed uphill, and sprints for 10 s. It reports metres of
//     ground covered along the wish direction, metres of height gained, and —
//     the half that is the actual complaint — whether the game ever TOLD him
//     anything: `body.slip` (the controller's own slipping signal) and the HUD
//     hint that reads from it.
//
// A trial is DEAD when it covers under 2 m in 10 s of sprint with no slip
// signal: that is the silent refusal the playtest described. It is SLIDING when
// it covers little ground but `slip` is up — the player is being told, and the
// character is visibly moving. It is CLIMBED when it gains height.
//
// Run:  node src/tools/probe.mts src/tools/probes/slopewalk.mts --dirty
const g = window.GAME;
const terrain = g.get('Terrain');
const player = g.get('Player');
const rig = g.get('CameraRig');
const inp = g.input;
const out = [];
const fails = [];
const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const DEG = 180 / Math.PI;
const v = new (Object.getPrototypeOf(player.root.position).constructor)();

g.applyShot('hud_field');
g.get('Director')?.play?.();
rig?.clearShot?.();
g.get('Menus')?.setScreen?.(null);
inp.pointerLocked = true;
step(8);

// ---------------------------------------------------------------- 1. census
//
// 40 m grid over the 8 km field is 41 k samples of a bilinear cache — under a
// second, and dense enough that a 200 m hillside cannot hide between samples.
const STRIDE = 40;
const HALF = 4096;
const bins = new Array(19).fill(0);          // 0-5, 5-10 ... 90
let n = 0, above50 = 0, above55 = 0, above58 = 0, above62 = 0, above66 = 0;
for (let x = -HALF; x <= HALF; x += STRIDE) {
  for (let z = -HALF; z <= HALF; z += STRIDE) {
    terrain.normalAt(x, z, v);
    const a = Math.acos(Math.min(1, Math.max(-1, v.y))) * DEG;
    bins[Math.min(18, Math.floor(a / 5))]++;
    n++;
    if (a > 50) above50++;
    if (a > 55) above55++;
    if (a > 58) above58++;
    if (a > 62) above62++;
    if (a > 66) above66++;
  }
}
const pct = (k) => (100 * k / n).toFixed(2) + '%';
out.push(`slope census — ${n} samples on a ${STRIDE} m grid over the 8192 m field`);
out.push(`  >50 deg ${pct(above50)}   >55 ${pct(above55)}   >58 ${pct(above58)}`
  + `   >62 ${pct(above62)}   >66 ${pct(above66)}`);
out.push('  histogram (5 deg bins, 0..90): ' + bins.map((b) => b).join(' '));

// -------------------------------------------------------- 2. find hillsides
//
// A trial site is a point whose slope sits in the wanted band AND which has
// somewhere to go: at least 8 m of rise within 30 m uphill. A steep 3 m lip is
// not the failure the playtest hit; a 60 m hillside between you and a lake is.
const BANDS = [[40, 47], [47, 52], [52, 56], [56, 61], [61, 70]];
const sites = BANDS.map(() => []);
const WANT = 3;
let seed = 20260831;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let tries = 0; tries < 60000 && sites.some((s) => s.length < WANT); tries++) {
  const x = (rnd() * 2 - 1) * 3600, z = (rnd() * 2 - 1) * 3600;
  const y = terrain.heightAt(x, z);
  if (y < -4) continue;                            // not in the sea
  terrain.normalAt(x, z, v);
  const a = Math.acos(Math.min(1, Math.max(-1, v.y))) * DEG;
  const bi = BANDS.findIndex(([lo, hi]) => a >= lo && a < hi);
  if (bi < 0 || sites[bi].length >= WANT) continue;
  const dl = Math.hypot(v.x, v.z) || 1;
  const ux = -v.x / dl, uz = -v.z / dl;             // uphill
  const rise = terrain.heightAt(x + ux * 30, z + uz * 30) - y;
  if (rise < 8) continue;
  sites[bi].push({ x, y, z, a, ux, uz, rise });
}

// ------------------------------------------------------------ 3. walk trials
const SECS = 10;
const rows = [];
let dead = 0, trials = 0;
for (let bi = 0; bi < BANDS.length; bi++) {
  for (const s of sites[bi]) {
    trials++;
    player.root.position.set(s.x, s.y, s.z);
    player.velocity.set(0, 0, 0);
    player.speed = 0;
    const body = player.body;
    body.vy = 0;
    body.grounded = true;
    body.swim = false;
    body.normal.set(0, 1, 0);
    const yaw = Math.atan2(-s.ux, -s.uz);
    if (rig) { rig.yaw = yaw; rig.yawTarget = yaw; }
    inp.keys.clear();
    step(4);                                        // let the camera arrive
    player.root.position.set(s.x, s.y, s.z);
    const p0 = player.root.position.clone();
    let slipFrames = 0, hintFrames = 0, minProg = 1, path = 0;
    const prev = player.root.position.clone();
    for (let f = 0; f < SECS * 60; f++) {
      inp.keys.clear();
      inp.keys.add('KeyW');
      inp.keys.add('ShiftLeft');
      if (rig) { rig.yaw = yaw; rig.yawTarget = yaw; }
      step(1);
      path += Math.hypot(player.root.position.x - prev.x, player.root.position.z - prev.z);
      prev.copy(player.root.position);
      if (body.slip > 0.05) slipFrames++;
      if (g.get('HUD')?.slipHintVisible?.()) hintFrames++;
      minProg = Math.min(minProg, body.progress);
    }
    inp.keys.clear();
    const dx = player.root.position.x - p0.x, dz = player.root.position.z - p0.z;
    const along = dx * s.ux + dz * s.uz;
    const gain = player.root.position.y - p0.y;
    const told = slipFrames > 30 || hintFrames > 30;
    const verdict = along > 6 ? 'CLIMBED'
      : told ? 'SLID (told)'
      : 'DEAD-SILENT';
    if (verdict === 'DEAD-SILENT') dead++;
    rows.push(`  ${s.a.toFixed(1).padStart(4)} deg  at (${s.x.toFixed(0)},${s.z.toFixed(0)})`
      + `  along ${along.toFixed(1).padStart(6)} m  dY ${gain.toFixed(1).padStart(6)} m`
      + `  path ${path.toFixed(1).padStart(6)} m  slip ${(slipFrames / 6).toFixed(0)}%`
      + `  hint ${(hintFrames / 6).toFixed(0)}%  ${verdict}`);
  }
}
out.push('');
out.push(`walk trials — 10 s of sprint straight uphill, ${trials} sites`);
out.push(...rows);
out.push('');
out.push(`${dead} of ${trials} trials were DEAD-SILENT (under 6 m gained, nothing said)`);
if (dead > 0) fails.push(`${dead}/${trials} hillsides refuse input silently`);

const verdict = fails.length ? `FAIL -- ${fails.join('; ')}` : 'PASS -- every trial either climbed or said so';
return { report: out.join('\n') + '\n\n' + verdict, fail: fails.length > 0 };
