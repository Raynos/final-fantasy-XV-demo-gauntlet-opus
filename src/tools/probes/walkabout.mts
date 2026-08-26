// What does a player actually MEET while walking?
//
// The human played the built game and reported the world "feels barren and
// empty". Every other instrument here measures a held frame; this one measures
// the thing they were describing — a person moving through the world for
// minutes at a time — and reports the encounter rate rather than the pixel
// count.
//
// Walks the real player with real input, sampling every ~25 m: what is alive
// near them, what they could press E on, what a POI is within sight, and how
// long they went between events. The summary at the end is the number that
// matters: **metres walked per thing that happened.**
//
// Run: node src/tools/probe.mts src/tools/probes/walkabout.mts --dirty
const g = window.GAME;
const inp = g.input;
const player = g.get('Player');
const dt = 1 / 60;

// Leave capture mode for the live gameplay camera **and turn the world on**.
// `?shoot=1` boots posed, and `Director.init` calls `setLive(false)` under it so
// no wandering pack walks into a capture — which means the encounter loop is
// switched off in every probe page by default. Without the `play()` below this
// instrument reports an empty world however full the world is, and the first
// run of it did exactly that.
g.applyShot('hud_field');
g.get('Director')?.play?.();
g.get('CameraRig')?.clearShot?.();
g.resetClock();

const HEADINGS = Number(window.__WALK_LEGS || 6);
/** 40 s of sprint covers ~296 m, measured; 6 legs of this is ~3 km walked. */
const LEG_FRAMES = Number(window.__WALK_FRAMES || 4200);
const NEAR = 120;      // metres: "near me", roughly what a player scans

const enemies = g.get('Enemies');
const npcs = g.get('Npcs') || g.get('NPCs') || g.get('Townsfolk');
const props = g.get('Props');
const eco = props && props.ecology;
// `Interactables`, not `Interaction`. And its `.prompt` is the prompt WIDGET,
// which is an object and therefore always truthy — reading it as a boolean is
// how the first run of this probe reported an E prompt on 100% of samples.
const inter = g.get('Interactables') || g.get('Interaction');
const dir = g.get('EncounterDirector') || g.get('Encounters');

const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Everything alive within NEAR, split into what will fight you and what is
 * standing there eating.
 *
 * Both live in `Enemies.list`, and counting them together is how the first
 * version of this reported a dangerous world when half of it was cattle. The
 * distinction is the whole design of {@link WildTerritories}: a world where
 * every creature attacks is not full, it is impassable.
 */
function liveEnemies(p) {
  const list = (enemies && enemies.list) || [];
  let hostile = 0, calm = 0;
  for (const e of list) {
    if (!e || e.dead || !e.position) continue;
    if (d2(e.position, p) >= NEAR) continue;
    if (e.passive && !e.inCombat && !e.alerted) calm++; else hostile++;
  }
  return { hostile, calm, all: hostile + calm };
}

/** Wildlife instances within NEAR — birds, herds, waders. */
function liveWildlife(p) {
  const w = props && props.wildlife;
  if (!w) return 0;
  let n = 0;
  // A grazing beast records its anchor as `ax/az` and its birds as `x/z`, so
  // the position test has to accept either. Reading only `x/z` is how the
  // first run of this probe reported no wildlife anywhere in Lucis.
  for (const key of ['birds', 'herd', 'waders']) {
    const grp = w[key];
    if (!grp) continue;
    const live = grp.stream && grp.stream.live;
    if (!live) continue;
    for (const [, arr] of live) {
      for (const it of arr) {
        if (!it) continue;
        const ix = it.x !== undefined ? it.x : it.ax;
        const iz = it.z !== undefined ? it.z : it.az;
        if (ix === undefined || iz === undefined) continue;
        if (Math.hypot(ix - p.x, iz - p.z) < NEAR) n++;
      }
    }
  }
  return n;
}

/** Points of interest whose kit is close enough to be a destination. */
function nearPois(p, r) {
  if (!eco || !eco.sites) return { n: 0, nearest: Infinity, kinds: [] };
  let n = 0, nearest = Infinity;
  const kinds = [];
  for (const s of eco.sites) {
    const d = d2(s, p);
    if (d < nearest) nearest = d;
    if (d < r) { n++; if (kinds.indexOf(s.type) < 0) kinds.push(s.type); }
  }
  return { n, nearest, kinds };
}

const rows = [];
const events = [];
let lastEventM = 0, totalM = 0;
const gaps = [];
const seenPoi = new Set();
let framesFought = 0, framesPrompted = 0, samples = 0;
const tally = { enemy: 0, hostile: 0, calm: 0, wildlife: 0, prompt: 0, poi: 0 };

const start = player.position.clone();
for (let leg = 0; leg < HEADINGS; leg++) {
  // fan out from the start so one unlucky direction cannot carry the verdict
  const yaw = (leg / HEADINGS) * Math.PI * 2;
  // Steer with the CAMERA, not `player.heading`. Movement is camera-relative,
  // so writing the heading directly fights the controller and the player walks
  // into the first thing in front of them and stays there — which is what the
  // first version of this probe measured and reported as a stuck player.
  const rig = g.get('CameraRig');
  if (rig) { rig.yaw = yaw; rig.yawTarget = yaw; }
  player.position.copy(start);
  if (player.velocity) player.velocity.set(0, 0, 0);
  inp.keys.clear();
  inp.keys.add('KeyW');
  inp.keys.add('ShiftLeft');
  inp.look.set(0, 0);
  let last = player.position.clone();
  for (let f = 0; f < LEG_FRAMES; f++) {
    // steer by nudging the look each frame so the heading holds
    g.frame(dt);
    const p = player.position;
    const step = d2(p, last);
    if (step < 25) continue;
    totalM += step;
    last = p.clone();
    samples++;

    const en = liveEnemies(p);
    const ne = en.all;
    const nw = liveWildlife(p);
    const poi = nearPois(p, 180);
    const prompt = !!(inter && inter.current);
    if (ne) { tally.enemy++; framesFought++; }
    if (en.hostile) tally.hostile++;
    if (en.calm) tally.calm++;
    if (nw) tally.wildlife++;
    if (prompt) { tally.prompt++; framesPrompted++; }
    if (poi.n) tally.poi++;
    for (const k of poi.kinds) seenPoi.add(k);

    const happened = ne > 0 || prompt || poi.n > 0;
    if (happened) {
      gaps.push(totalM - lastEventM);
      lastEventM = totalM;
      if (events.length < 40) {
        events.push(`  ${totalM.toFixed(0).padStart(5)} m  `
          + `${en.hostile ? `${en.hostile} hostile ` : ''}${en.calm ? `${en.calm} grazing ` : ''}${prompt ? 'E-prompt ' : ''}`
          + `${poi.n ? `${poi.n} poi(${poi.kinds.join(',')}) ` : ''}`
          + `${nw ? `${nw} wildlife` : ''}`);
      }
    }
    rows.push({ ne, nw, poi: poi.n, nearestPoi: poi.nearest, prompt });
  }
}
inp.keys.clear();

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const pct = (n) => `${((n / Math.max(1, samples)) * 100).toFixed(0)}%`;
const nearestPois = rows.map((r) => r.nearestPoi).filter((v) => isFinite(v));
nearestPois.sort((a, b) => a - b);

const out = [];
out.push(`walked ${totalM.toFixed(0)} m in ${HEADINGS} legs, sampled every 25 m (${samples} samples)`);
out.push(`from ${start.x.toFixed(0)},${start.z.toFixed(0)}`);
out.push('');
out.push('--- how much of the walk had something in it ---');
out.push(`  anything alive within ${NEAR} m ..... ${pct(tally.enemy)} of samples`);
out.push(`    of which will fight you ........ ${pct(tally.hostile)}`);
out.push(`    of which is grazing ............ ${pct(tally.calm)}`);
out.push(`  wildlife within ${NEAR} m ......... ${pct(tally.wildlife)}`);
out.push(`  an E prompt available ............ ${pct(tally.prompt)}`);
out.push(`  a POI within 180 m ............... ${pct(tally.poi)}`);
out.push(`  POI kinds met: ${[...seenPoi].join(', ') || 'NONE'}`);
out.push('');
out.push('--- distance between events ---');
out.push(`  events: ${gaps.length}   mean gap ${mean(gaps).toFixed(0)} m   `
  + `worst gap ${gaps.length ? Math.max(...gaps).toFixed(0) : '-'} m`);
out.push(`  nearest POI, median over the walk: ${nearestPois.length
  ? nearestPois[Math.floor(nearestPois.length / 2)].toFixed(0) : '-'} m`);
out.push('');
out.push('--- the first 40 events ---');
out.push(events.join('\n') || '  NOTHING HAPPENED');
if (dir && dir.stats) out.push(`\ndirector stats: ${JSON.stringify(dir.stats)}`);
return out.join('\n');
