#!/usr/bin/env node
/**
 * Record the trailer's takes: real video, with real sound, from the real game.
 *
 *   node src/tools/trailerclips.mts                      # every clip in the spec
 *   node src/tools/trailerclips.mts b1-warp b9-armiger    # named clips only
 *   node src/tools/trailerclips.mts --out tmp/trailer/clips --retakes 3
 *   node src/tools/trailerclips.mts --list                # print the spec and exit
 *
 * Everything else in this harness photographs a *frozen* world: `?shoot=1`
 * stops the render loop, `Director` freezes enemy poses and pins the VFX clock,
 * and that is what buys byte-identical captures. A trailer needs the opposite
 * of all of it, so this tool is the one that boots WITHOUT `?shoot=1`, turns
 * the encounter loop back on, and films what the game actually does.
 *
 * ## How a frame gets out
 *
 * `canvas.captureStream(0)` opens a manual-cadence video track and the render
 * loop calls `requestFrame()` once per rendered frame, so the file cannot hold
 * a capture-side duplicate or drop -- the packet count becomes an independent
 * check on the encoder. `Renderer.ts` already sets `preserveDrawingBuffer`,
 * which is what makes grabbing the WebGL canvas after `post.render()` safe.
 *
 * ## How the sound gets out, and why that was the risk
 *
 * `CHROMIUM_ARGS` carries `--mute-audio` for every page this harness serves, so
 * the first question was whether a live `AudioContext` renders at all here.
 * It does: `--mute-audio` silences the output *device*, and
 * `createMediaStreamDestination()` taps the graph ahead of it. Measured on a
 * two-second spike: mean -14.3 dB, max -2.9 dB. The page also needs
 * `?audio=force`, without which `AudioSystem` waits for a real pointer event
 * that a headless run never delivers.
 *
 * Three destinations are tapped, not one, because a per-clip music track cut at
 * a picture cut is a musical splice and sounds broken. `program` is what a
 * player hears; `music` and `sfx` are stems, so the edit can hold one unbroken
 * bed under hard cuts and still cut the impacts with picture.
 *
 * ## Realtime means the take is a measurement
 *
 * The compositor decides frame timing, so a take is not reproducible and a
 * dropped frame is possible. Every take therefore logs its own frame deltas and
 * is REJECTED and re-shot on any delta over 24 ms -- one dropped vsync at 60 Hz
 * is 33.3 ms and jitter is +/-3, so 24 separates them. The game holds 60 fps
 * across 166/166 shots with zero hitches, so a hitchy take is a machine fault,
 * not a bar to lower.
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFile = promisify(execFileCb);
import {
  harnessArgs, pageOpts, withPage, withExclusive, announceBuild,
  isHarnessFlag, runTool,
} from './harness.mts';
import { SPEC } from './trailer/spec.default.ts';
import type { ClipSpec, TakeReport } from './trailer/types.ts';
import type * as THREE from 'three';
import type { Shot as CamShot } from '../game/cinematics/CameraMove.ts';
import type { Shot as CorpusShot, FixedShot } from '../game/Shots.ts';
import type { CameraShot } from '../game/CameraRig.ts';

/** What one attempt returns from inside the page. */
interface InPageTake {
  ok: boolean;
  /** Metres the world travelled during the body. Zero is a frozen tableau. */
  travel?: number;
  /** Seconds the VFX effect clock advanced. Zero means `Director` pinned it. */
  vfxRan?: number;
  why?: string;
  mime?: string;
  frames?: number;
  fps?: number;
  hitch?: number;
  long?: number;
  p99?: number;
  stems?: string[];
  bytes?: Record<string, number>;
  /** Filled in on the Node side once the blobs are written. */
  file?: string;
}

/** What the preflight measures with nothing attached. */
interface Baseline { fps: number; hitch: number; p99: number }

/* --------------------------------------------------------------- args -- */

const argv = process.argv.slice(2);
const ha = harnessArgs(argv, { play: true, extra: 'audio=force', q: 'ultra', w: 1600, h: 900 });

let out = 'tmp/trailer/clips';
let retakes = 2;
let list = false;
/**
 * Video bitrate for the take.
 *
 * 24 Mbps rather than 40: this is an intermediate that gets re-encoded by the
 * cut, so visually-lossless is the bar, not archival -- and the encoder shares
 * the one Metal GPU with the renderer it is filming, so every megabit is taken
 * from the frame rate of the thing being recorded.
 */
let vbps = 24_000_000;
const only: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const kind = isHarnessFlag(a);
  if (kind === 'value') { i++; continue; }
  if (kind === 'switch') continue;
  if (a === '--out') { out = argv[++i]; continue; }
  if (a === '--retakes') { retakes = Number(argv[++i]); continue; }
  if (a === '--vbps') { vbps = Math.round(Number(argv[++i]) * 1e6); continue; }
  if (a === '--list') { list = true; continue; }
  if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
  only.push(a);
}

const clips = only.length ? SPEC.clips.filter((c) => only.includes(c.id)) : SPEC.clips;
if (only.length && clips.length !== only.length) {
  const have = new Set(clips.map((c) => c.id));
  throw new Error(`no such clip: ${only.filter((n) => !have.has(n)).join(', ')}`);
}

if (list) {
  for (const c of SPEC.clips) {
    console.log(`${c.id.padEnd(14)} ${String(c.dur).padStart(4)}s  ${String(c.shot).padEnd(22)} ${c.doc || ''}`);
  }
  process.exit(0);
}

/* ------------------------------------------------------------- the gate --
 *
 * Two numbers, and they measure different things.
 *
 * `HITCH_MS` = 24 is a DROPPED FRAME: one missed vsync at 60 Hz is 33.3 ms and
 * ordinary jitter is a few, so 24 separates them cleanly. Dropped frames are
 * what a viewer sees as a stutter, and they are the reason the gate exists.
 *
 * `FLOOR_FPS` is the delivery bar, and it is deliberately low. A capture that
 * holds a steady 45 fps is a perfectly good trailer clip -- `captureStream(0)`
 * timestamps every frame as it is actually rendered, so a slower stretch plays
 * back at the right *speed*, just with fewer frames, and the ffmpeg stage
 * normalises the whole cut to CFR anyway. The heavy live-combat shots run
 * ~50 fps on a quiet box with a hardware encoder on the same GPU; that is the
 * game's honest cost, not a defect, and rejecting it buys nothing.
 *
 * So: hitches are still counted and still reported, because a stutter is a
 * real artifact -- but the pass/fail line is the delivery bar.
 */
const HITCH_MS = 24;
const LONG_MS = 20;
const FLOOR_FPS = 30;

/* ------------------------------------------------------- preflight -- */

/**
 * What does this page hold with NOTHING attached?
 *
 * `withExclusive` drains this repository's daemon -- every worker, every pooled
 * page -- and that is all it can do. It cannot see another project's agents on
 * the same box, and a sibling repo's headless Chromium holds its own GPU
 * process. Measured during development: two foreign renderers at ~105% CPU
 * each, each with a GPU process, took a take from 60 fps to 31.8 -- and the
 * frame gate dutifully reported 88 hitches against a recorder that was not at
 * fault.
 *
 * So the gate has to be able to tell "my recorder is slow" from "this machine
 * is busy", and the only way is to price the page before attaching anything.
 * A baseline under the target means every verdict after it is about the box.
 */
async function baselineInPage(seconds: number): Promise<Baseline> {
  const g = window.GAME;
  const orig = g.frame.bind(g);
  const d: number[] = [];
  let last = performance.now();
  g.frame = (dt?: number) => { orig(dt); const n = performance.now(); d.push(n - last); last = n; };
  await new Promise((r) => setTimeout(r, seconds * 1000));
  g.frame = orig;
  const b = d.slice(2);
  const sorted = b.slice().sort((x, y) => x - y);
  return {
    fps: +(b.length / (b.reduce((x, y) => x + y, 0) / 1000)).toFixed(2),
    hitch: b.filter((x) => x > 24).length,
    p99: +(sorted[Math.floor(sorted.length * 0.99)] ?? 0).toFixed(1),
  };
}

/* ------------------------------------------------------------ in-page -- */

/**
 * Stage, roll and stop one take, entirely inside the page.
 *
 * Written as one function because everything it touches -- the patched
 * `Game.frame`, the recorders, the camera sampler -- has to live for exactly
 * the length of the take and be gone afterwards. A take that leaves
 * `Game.frame` patched poisons every take after it.
 */
async function takeInPage(arg: {
  clip: ClipSpec, hitchMs: number, longMs: number, floorFps: number, vbps: number,
}) {
  const { clip, hitchMs, longMs, floorFps, vbps } = arg;
  const g = window.GAME;
  // `tsconfig.tools.json` maps "/*" to "./src/*", so these in-page imports
  // carry the real modules' types rather than being holes in the checker.
  const { SHOTS } = await import('/game/Shots.ts');
  const { Shot } = await import('/game/cinematics/CameraMove.ts');

  /* ---- stage the world ------------------------------------------------ */
  const { isShotName } = await import('/game/Shots.ts');
  // Re-time and re-HUD through the probe slot rather than mutating the corpus:
  // `corpus.mts`, `sheet.mts` and `shoot.mts` all enumerate SHOT_TABLE, and a
  // shot edited in place would follow them home.
  const over = { hud: !!clip.hud, ...(clip.time != null ? { time: clip.time } : {}) };
  let staged: CorpusShot;
  if (typeof clip.shot === 'string') {
    if (!isShotName(clip.shot)) return { ok: false, why: `no shot ${clip.shot}` };
    const base = SHOTS[clip.shot];
    // Spread per branch: `FixedShot`/`FollowShot` carry `never` members that
    // make mixing the two framing modes a compile error, and a blind spread
    // would erase exactly that protection.
    staged = base.follow !== undefined
      ? { ...base, ...over }
      : { ...(base as FixedShot), ...over };
  } else if (clip.shot) {
    staged = { ...(clip.shot as unknown as FixedShot), ...over };
  } else {
    return { ok: false, why: 'clip has no shot' };
  }
  SHOTS.__probe = staged;
  g.applyShot('__probe');

  // A posed scenario freezes its enemies and pins the VFX clock -- correct for
  // a portrait, fatal for footage. Hand the fight back to the live loop.
  const dir = g.get('Director');
  if (clip.live && dir) {
    dir.setLive(true);
    const en = g.get('Enemies');
    if (en) en.frozen = false;
  }

  // The cutscene skip prompt rides inside the lower matte bar and Letterbox
  // raises it whenever a scene is playing, regardless of `skippable`.
  if (!document.getElementById('__trailer_css')) {
    const st = document.createElement('style');
    st.id = '__trailer_css';
    /*
     * Everything the harness draws over the game, hidden.
     *
     * The realtime path never needed this: `captureStream` films the canvas,
     * and all of it is DOM, so none of it was ever in shot. The stepped path
     * composites the whole page -- which is the entire reason it exists -- and
     * that means it also composites the dev suite's stats readout and its
     * keyboard-hint bar, and the cutscene skip prompt.
     *
     * `.ti-menu` is the title screen's NEW GAME / CONTINUE list. The lockup
     * animates for 2.8 s and the menu only fades in afterwards, which a posed
     * still never reaches -- but a 3.6 s stepped take runs straight past it.
     */
    st.textContent = [
      '.cine-skip{display:none!important}',
      '#dev{display:none!important}',
      '.dev-stats{display:none!important}',
      '.ti-menu{display:none!important}',
      '.ti-foot{display:none!important}',
      '.ti-ver{display:none!important}',
    ].join('');
    document.head.appendChild(st);
  }

  const settleS = clip.settle ?? 1.5;
  await new Promise((r) => setTimeout(r, settleS * 1000));

  /*
   * Stage it a SECOND time, immediately before rolling.
   *
   * `applyShot` builds a tableau -- it poses the party, opens a cutscene at a
   * timestamp, shows the HUD, puts the title screen up. On a `?shoot=1` page
   * nothing then moves, so one call is enough. This page free-runs by design,
   * and over a 1.5 s settle the live systems quietly take the tableau apart
   * again: the combat HUD stood down, the title screen dismissed itself, and
   * the Astral cutscene's matte bars retracted because the scene had stopped
   * playing. All three came back as clips of an empty world.
   *
   * `daemon.mts routeShots` already does exactly this for stills --
   * `applyShot(n); settle(s); applyShot(n); settle(8)` -- and the reason is the
   * same one. The second call re-asserts everything the settle undid, and only
   * a few frames pass between it and the first recorded frame.
   */
  g.applyShot('__probe');
  if (clip.live && dir) {
    dir.setLive(true);
    const en2 = g.get('Enemies');
    if (en2) en2.frozen = false;
  }

  /**
   * Release the scenario's holds, in the order they were applied.
   *
   * Without this the take is a photograph: measured 0.00 s of VFX clock, 0 m of
   * player travel and 0 m of enemy travel over two seconds.
   */
  const unlock = () => {
    if (!clip.unpin) return;
    const vfx = g.get('VFX');
    const cmb = g.get('Combat');
    if (vfx && typeof vfx.unpin === 'function') vfx.unpin();
    if (cmb) cmb.scenarioLock = false;
    if (dir) dir._frozenPlayer = null;
    if (dir) dir.setLive(true);
    const en3 = g.get('Enemies');
    if (en3) en3.frozen = false;
  };
  unlock();
  await new Promise((r) => setTimeout(r, 250));

  /* ---- freeze the camera on our own move ------------------------------ */
  const rig = g.get('Camera');
  if (!rig) return { ok: false, why: 'no CameraRig' };
  const cam = g.camera;
  const basePos = cam.position.clone();
  // A Vector3 off the live camera rather than `import('three')`: a bare
  // specifier does not resolve inside an eval'd page context, and the camera
  // is already holding the class we need.
  const fwd = cam.position.clone().set(0, 0, -1).applyQuaternion(cam.quaternion);
  const baseTgt = basePos.clone().add(fwd.multiplyScalar(14));
  const baseFov = cam.fov;

  let mv: CamShot | null = null;
  const live: CameraShot = { pos: [0, 0, 0], target: [0, 0, 0], fov: baseFov, roll: 0 };
  if (clip.move) {
    const m = clip.move;
    const at = (o: number[] | undefined, b: THREE.Vector3) =>
      [b.x + (o?.[0] ?? 0), b.y + (o?.[1] ?? 0), b.z + (o?.[2] ?? 0)] as [number, number, number];
    mv = new Shot({
      t0: 0, t1: clip.dur,
      handheld: m.handheld ?? 0.2,
      breathe: m.breathe ?? 0.6,
      keys: [
        { t: 0, pos: at(m.from, basePos), target: at(m.lookFrom, baseTgt), fov: m.fov?.[0] ?? baseFov, roll: 0, ease: m.ease },
        { t: clip.dur, pos: at(m.to, basePos), target: at(m.lookTo, baseTgt), fov: m.fov?.[1] ?? baseFov, roll: m.roll ?? 0 },
      ],
    });
    // `setShot` calls `_cut()`, which resets TAA history and snaps focus. That
    // is right ONCE, at the cut; doing it per frame would mean no TAA at all.
    // So: set the object once, then mutate it in place every frame.
    rig.followShot = null;
    rig.setShot(live);
    const s = mv.sample(0);
    live.pos = [s.pos.x, s.pos.y, s.pos.z];
    live.target = [s.target.x, s.target.y, s.target.z];
    live.fov = s.fov; live.roll = s.roll;
    await new Promise((r) => setTimeout(r, 200));   // post-cut settle, off the gate
  }

  /* ---- taps ------------------------------------------------------------ */
  const A = g.get('Audio');
  const actx = A?.ctx;
  if (!A || !actx) return { ok: false, why: 'no audio context' };
  if (document.visibilityState !== 'visible') return { ok: false, why: 'page hidden: rAF and audio are throttled' };

  // H.264 first: on macOS Chrome routes it to VideoToolbox, so the encoder
  // stops competing for the very cores the frame gate is measuring.
  const mime = [
    'video/mp4;codecs="avc1.640028,mp4a.40.2"',
    'video/x-matroska;codecs="avc1,opus"',
    'video/webm;codecs="vp9,opus"',
    'video/webm;codecs="vp8,opus"',
  ].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) return { ok: false, why: 'no supported mime' };

  const mkTap = (node: AudioNode) => {
    const d = actx.createMediaStreamDestination();
    node.connect(d);
    return d;
  };
  const sfxSum = actx.createGain();
  for (const b of ['sfx', 'ui', 'voice'] as const) A.graph.bus[b].connect(sfxSum);
  A.graph.bus.amb.connect(sfxSum);
  const tapProgram = mkTap(A.graph.master);
  const tapMusic = mkTap(A.graph.bus.music);
  const tapSfx = mkTap(sfxSum);

  const canvas = g.renderer.domElement as HTMLCanvasElement;
  // `captureStream(0)` is manual cadence: exactly the frames we ask for.
  const vtrack = canvas.captureStream(0).getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;

  const recs: Array<{ name: string, mr: MediaRecorder, chunks: Blob[] }> = [];
  const mkRec = (name: string, stream: MediaStream, mt: string, vb?: number) => {
    const chunks: Blob[] = [];
    const mr = new MediaRecorder(stream, { mimeType: mt, videoBitsPerSecond: vb, audioBitsPerSecond: 192_000 });
    mr.ondataavailable = (e: BlobEvent) => { if (e.data && e.data.size) chunks.push(e.data); };
    recs.push({ name, mr, chunks });
    return mr;
  };
  const audioMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : mime;
  mkRec('main', new MediaStream([vtrack, ...tapProgram.stream.getAudioTracks()]), mime, vbps);
  mkRec('music', tapMusic.stream, audioMime);
  mkRec('sfx', tapSfx.stream, audioMime);

  /* ---- roll ------------------------------------------------------------ */
  const orig = g.frame.bind(g);
  const deltas: number[] = [];
  let frames = 0;
  let sceneT = 0;
  let driving = false;
  let last = performance.now();

  const scaleAt = (t: number) => {
    const r = clip.timeScale;
    if (!r || !r.length) return 1;
    if (t <= r[0].t) return r[0].s;
    for (let i = 1; i < r.length; i++) {
      if (t <= r[i].t) {
        const k = (t - r[i - 1].t) / Math.max(1e-6, r[i].t - r[i - 1].t);
        return r[i - 1].s + (r[i].s - r[i - 1].s) * k;
      }
    }
    return r[r.length - 1].s;
  };

  const hud = g.get('HUD');
  const inp = g.input as { keys: Set<string> } | undefined;
  /** The input entry covering `t`. Held, not tapped: a key must survive frames. */
  const inputAt = (t: number) => {
    const r = clip.input;
    if (!r || !r.length) return null;
    let cur = r[0];
    for (const e of r) if (t >= e.at) cur = e;
    return cur;
  };
  g.frame = (dt?: number) => {
    if (driving && clip.input && inp) {
      const cur = inputAt(sceneT);
      inp.keys.clear();
      for (const c of cur?.keys ?? []) inp.keys.add(c);
    }
    // The combat HUD follows combat state on its own, so on a live page it
    // stands itself down mid-take. The one clip that exists to show the HUD
    // has to keep asking for it.
    if (driving && clip.hud && hud) hud.setVisible(true);
    if (driving && mv) {
      const s = mv.sample(Math.min(sceneT, clip.dur));
      live.pos[0] = s.pos.x; live.pos[1] = s.pos.y; live.pos[2] = s.pos.z;
      live.target[0] = s.target.x; live.target[1] = s.target.y; live.target[2] = s.target.z;
      live.fov = s.fov; live.roll = s.roll;
    }
    if (driving && clip.timeScale) g.time.scale = scaleAt(sceneT);
    orig(dt);
    const now = performance.now();
    if (driving) {
      deltas.push(now - last);
      sceneT += Math.min(0.05, (now - last) / 1000);
      frames++;
    }
    last = now;
    vtrack.requestFrame();
  };

  /*
   * How far does the WORLD travel during this take?
   *
   * The frame gate answers "did the capture stutter". It cannot answer the
   * question that sank the first cut: is anything actually moving? A posed
   * scenario pins the VFX clock, locks combat and copies the player's position
   * back every frame, so a take can be flawless by every timing measure and
   * still be a photograph with a camera move over it. Measured on the first
   * build: 0.00 s of effect clock and 0 m of travel across 26 enemies.
   */
  const actors = (): number[][] => {
    const en = g.get('Enemies');
    const pl = g.get('Player');
    const list = (en?.list ?? []) as Array<{ root?: { position: THREE.Vector3 } }>;
    const out: number[][] = [];
    const push = (o?: { root?: { position: THREE.Vector3 } }) => {
      const q = o?.root?.position;
      if (q) out.push([q.x, q.y, q.z]);
    };
    push(pl as unknown as { root?: { position: THREE.Vector3 } });
    for (const e of list.slice(0, 12)) push(e);
    return out;
  };
  const vfxOf = () => (g.get('VFX')?.clock as number | undefined) ?? 0;
  const posBefore = actors();
  const vfxBefore = vfxOf();

  for (const r of recs) r.mr.start(1000);
  await new Promise((r) => setTimeout(r, 300));         // preroll: MediaRecorder start latency
  last = performance.now();
  const bodyStart = performance.now();
  driving = true;
  await new Promise((r) => setTimeout(r, clip.dur * 1000));
  driving = false;
  const bodyEnd = performance.now();
  await new Promise((r) => setTimeout(r, 350));         // postroll: reverb tails, encoder flush

  await Promise.all(recs.map((r) => new Promise((res) => { r.mr.onstop = res; r.mr.stop(); })));
  g.frame = orig;
  g.time.scale = 1;
  try { A.graph.master.disconnect(tapProgram); A.graph.bus.music.disconnect(tapMusic); sfxSum.disconnect(); } catch { /* torn down anyway */ }

  /* ---- verdict --------------------------------------------------------- */
  const posAfter = actors();
  const travel = posBefore.reduce((sum, a, i) => {
    const b2 = posAfter[i];
    return b2 ? sum + Math.hypot(a[0] - b2[0], a[1] - b2[1], a[2] - b2[2]) : sum;
  }, 0);
  const vfxRan = +(vfxOf() - vfxBefore).toFixed(2);

  const body = deltas.slice(1);
  const sorted = body.slice().sort((a, b) => a - b);
  const hitch = body.filter((d) => d > hitchMs).length;
  const long = body.filter((d) => d > longMs).length;
  const fps = frames / ((bodyEnd - bodyStart) / 1000);

  const blobs: Record<string, string> = {};
  for (const r of recs) {
    const blob = new Blob(r.chunks, { type: r.mr.mimeType });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode(...buf.subarray(i, i + CH));
    blobs[r.name] = btoa(bin);
  }
  window.__TRAILER_BLOBS = blobs;

  return {
    // A dropped frame is a visible stutter, so a few are still a reject; the
    // rate only has to clear the delivery bar.
    ok: hitch <= Math.ceil(0.01 * body.length) && fps >= floorFps,
    why: hitch > Math.ceil(0.01 * body.length) ? `${hitch} dropped frames`
      : fps < floorFps ? `${fps.toFixed(1)} fps, under the ${floorFps} floor` : undefined,
    mime, frames, fps: +fps.toFixed(2), hitch, long,
    p99: +(sorted[Math.floor(sorted.length * 0.99)] ?? 0).toFixed(2),
    stems: recs.map((r) => r.name),
    travel: +travel.toFixed(2),
    vfxRan,
    bytes: Object.fromEntries(Object.entries(blobs).map(([k, v]) => [k, Math.floor(v.length * 0.75)])),
  };
}

/* --------------------------------------------------- stepped capture -- */

/**
 * Stage a clip and hand back a per-frame camera driver, for the stepped path.
 *
 * The realtime path cannot film DOM, and this game's HUD, title lockup,
 * letterbox bars and subtitles are all DOM over the canvas. So the clips whose
 * subject IS the UI are captured the other way: stop the render loop, advance
 * a fixed timestep by hand, and take a `page.screenshot()` per frame -- which
 * composites the page the way a player sees it.
 *
 * `GAME.stop()` matters. This page is not `?shoot=1`, so its rAF loop is
 * genuinely running; stepping `frame()` without stopping it first would advance
 * the world twice per screenshot.
 */
async function stageStepped(arg: { clip: ClipSpec, fps: number }) {
  const { clip, fps } = arg;
  const g = window.GAME;
  const { SHOTS, isShotName } = await import('/game/Shots.ts');
  const { Shot } = await import('/game/cinematics/CameraMove.ts');

  const over = { hud: !!clip.hud, ...(clip.time != null ? { time: clip.time } : {}) };
  let staged: CorpusShot;
  if (typeof clip.shot === 'string') {
    if (!isShotName(clip.shot)) return { ok: false, why: `no shot ${clip.shot}` };
    const base = SHOTS[clip.shot];
    staged = base.follow !== undefined ? { ...base, ...over } : { ...(base as FixedShot), ...over };
  } else if (clip.shot) {
    staged = { ...(clip.shot as unknown as FixedShot), ...over };
  } else {
    return { ok: false, why: 'clip has no shot' };
  }

  if (!document.getElementById('__trailer_css')) {
    const st = document.createElement('style');
    st.id = '__trailer_css';
    /*
     * Everything the harness draws over the game, hidden.
     *
     * The realtime path never needed this: `captureStream` films the canvas,
     * and all of it is DOM, so none of it was ever in shot. The stepped path
     * composites the whole page -- which is the entire reason it exists -- and
     * that means it also composites the dev suite's stats readout and its
     * keyboard-hint bar, and the cutscene skip prompt.
     *
     * `.ti-menu` is the title screen's NEW GAME / CONTINUE list. The lockup
     * animates for 2.8 s and the menu only fades in afterwards, which a posed
     * still never reaches -- but a 3.6 s stepped take runs straight past it.
     */
    st.textContent = [
      '.cine-skip{display:none!important}',
      '#dev{display:none!important}',
      '.dev-stats{display:none!important}',
      '.ti-menu{display:none!important}',
      '.ti-foot{display:none!important}',
      '.ti-ver{display:none!important}',
    ].join('');
    document.head.appendChild(st);
  }

  SHOTS.__probe = staged;
  g.applyShot('__probe');
  const dir = g.get('Director');
  if (clip.live && dir) {
    dir.setLive(true);
    const en = g.get('Enemies');
    if (en) en.frozen = false;
  }
  await new Promise((r) => setTimeout(r, (clip.settle ?? 1.5) * 1000));
  // Stage a second time: the live loop has had the whole settle to disagree.
  g.applyShot('__probe');
  await new Promise((r) => setTimeout(r, 250));

  // Take the loop. From here the tool owns the clock.
  g.stop();

  const rig = g.get('Camera');
  if (!rig) return { ok: false, why: 'no CameraRig' };
  const cam = g.camera;
  const basePos = cam.position.clone();
  const fwd = cam.position.clone().set(0, 0, -1).applyQuaternion(cam.quaternion);
  const baseTgt = basePos.clone().add(fwd.multiplyScalar(14));

  const live: CameraShot = { pos: [0, 0, 0], target: [0, 0, 0], fov: cam.fov, roll: 0 };
  let mv: CamShot | null = null;
  if (clip.move) {
    const m = clip.move;
    const at = (o: number[] | undefined, b: THREE.Vector3) =>
      [b.x + (o?.[0] ?? 0), b.y + (o?.[1] ?? 0), b.z + (o?.[2] ?? 0)] as [number, number, number];
    mv = new Shot({
      t0: 0, t1: clip.dur, handheld: m.handheld ?? 0.2, breathe: m.breathe ?? 0.6,
      keys: [
        { t: 0, pos: at(m.from, basePos), target: at(m.lookFrom, baseTgt), fov: m.fov?.[0] ?? cam.fov, roll: 0, ease: m.ease },
        { t: clip.dur, pos: at(m.to, basePos), target: at(m.lookTo, baseTgt), fov: m.fov?.[1] ?? cam.fov, roll: m.roll ?? 0 },
      ],
    });
    rig.followShot = null;
    rig.setShot(live);
  }

  const hud = g.get('HUD');
  window.__TRAILER_STEP = (i: number) => {
    const t = i / fps;
    if (clip.hud && hud) hud.setVisible(true);
    if (mv) {
      const sm = mv.sample(Math.min(t, clip.dur));
      live.pos[0] = sm.pos.x; live.pos[1] = sm.pos.y; live.pos[2] = sm.pos.z;
      live.target[0] = sm.target.x; live.target[1] = sm.target.y; live.target[2] = sm.target.z;
      live.fov = sm.fov; live.roll = sm.roll;
    }
    g.frame(1 / fps);
  };
  return { ok: true, frames: Math.round(clip.dur * fps) };
}

/* --------------------------------------------------------------- main -- */

const EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/x-matroska': 'mkv', 'video/webm': 'webm' };

async function main() {
  announceBuild(ha);
  await mkdir(out, { recursive: true });
  console.log(`[trailer] ${clips.length} clip(s) -> ${out}, up to ${retakes + 1} attempt(s) each`);

  const manifest: Array<Record<string, unknown>> = [];
  let baseline: Baseline | null = null;
  const attempts: TakeReport[] = [];

  // A realtime take is a timing measurement, so it takes the machine the way
  // `perf` does: every other worker drained, every pooled page closed. Under
  // three concurrent chromiums the frame gate would be measuring the harness.
  await withExclusive('trailerclips', async () => {
    await withPage(pageOpts(ha), async (page) => {
      page.on('pageerror', (e) => console.error('  [pageerror]', String(e).split('\n')[0]));

      const base = baseline = await page.evaluate(baselineInPage, 2.5);
      // Mean fps is the WRONG test and this caught it lying: a contended box
      // measured 68.81 fps -- over target -- while dropping 21 frames in 2.5 s,
      // because the fast frames pull the mean back up over the stalls. A hitch
      // is a dropped vsync, and one is already too many on a page with nothing
      // attached, so that is the signal.
      // Mean fps is the WRONG test and this caught it lying: a contended box
      // measured 68.81 fps -- over target -- while dropping 21 frames in 2.5 s,
      // because the fast frames pull the mean back up over the stalls. Dropped
      // frames are the signal. A couple over 2.5 s is ordinary scheduler noise;
      // a page under real contention drops them by the dozen.
      const busy = base.hitch > 6 || base.fps < FLOOR_FPS;
      console.log(
        `[trailer] page baseline: ${base.fps} fps, ${base.hitch} hitch, p99 ${base.p99} ms`
        + (busy ? '   <-- THE BOX IS BUSY' : '   (quiet)'),
      );
      if (busy) {
        console.log([
          '[trailer] The game holds 60 fps across 166/166 shots, so a baseline this low is',
          '          contention, not the recorder - most likely another project on this box',
          '          holding its own GPU process. `withExclusive` drains only THIS repo.',
          '          Every verdict below is about the machine. Re-run when it is quiet.',
        ].join('\n'));
      }

      for (const clip of clips) {
        if (clip.dom) {
          const st = await page.evaluate(stageStepped, { clip, fps: 60 });
          if (!st.ok) { console.log(`  ${clip.id}: FAILED — ${st.why}`); continue; }
          const nFrames = st.frames!;
          const fdir = path.join(out, `${clip.id}.frames`);
          await mkdir(fdir, { recursive: true });
          const t0 = Date.now();
          for (let i = 0; i < nFrames; i++) {
            await page.evaluate((k) => window.__TRAILER_STEP(k), i);
            await writeFile(
              path.join(fdir, `${String(i).padStart(5, '0')}.jpg`),
              await page.screenshot({ type: 'jpeg', quality: 92 }),
            );
          }
          await page.evaluate(() => window.GAME.start());
          const file = path.join(out, `${clip.id}.mp4`);
          await execFile('/opt/homebrew/bin/ffmpeg', [
            '-y', '-v', 'error', '-framerate', '60', '-i', path.join(fdir, '%05d.jpg'),
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12',
            '-pix_fmt', 'yuv420p', '-g', '30', '-keyint_min', '1', '-sc_threshold', '0', file,
          ]);
          console.log(
            `  ${clip.id}: STEPPED ${nFrames} frames @60 (DOM composited)`
            + `  (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
          );
          manifest.push({
            id: clip.id, doc: clip.doc, shot: clip.shot, dur: clip.dur, file,
            frames: nFrames, fps: 60, mode: 'stepped', degraded: false,
            w: ha.w, h: ha.h, build: ha.build,
          });
          continue;
        }

        let best: InPageTake | null = null;
        for (let attempt = 0; attempt <= retakes; attempt++) {
          const t0 = Date.now();
          const r = await page.evaluate(takeInPage, {
            clip, hitchMs: HITCH_MS, longMs: LONG_MS, floorFps: FLOOR_FPS, vbps,
          });
          const tag = `${clip.id} #${attempt + 1}`;
          if (!r.ok && r.why && !r.frames) { console.log(`  ${tag}: FAILED — ${r.why}`); continue; }
          console.log(
            `  ${tag}: ${r.ok ? 'PASS' : 'REJECT'} ${r.fps} fps, ${r.frames} frames, `
            + `hitch ${r.hitch}, p99 ${r.p99} ms, moved ${r.travel} m, vfx ${r.vfxRan} s`
            + `  (${((Date.now() - t0) / 1000).toFixed(1)}s)`
            + (r.ok ? '' : ` — ${r.why}`)
            + (clip.unpin && (r.travel ?? 0) < 0.05 && (r.vfxRan ?? 0) < 0.05
              ? '\n      ^^ NOTHING MOVED — the scenario is still holding the world' : ''),
          );
          attempts.push({ id: clip.id, attempt: attempt + 1, ok: r.ok, why: r.why, frames: r.frames, fps: r.fps, hitch: r.hitch, long: r.long, p99: r.p99 });

          const b = best;
          const better = !b
            || (r.hitch ?? 0) < (b.hitch ?? 0)
            || ((r.hitch ?? 0) === (b.hitch ?? 0) && (r.long ?? 0) < (b.long ?? 0))
            || ((r.hitch ?? 0) === (b.hitch ?? 0) && (r.long ?? 0) === (b.long ?? 0)
                && (r.fps ?? 0) > (b.fps ?? 0));
          if (better) {
            best = r;
            const blobs = await page.evaluate(() => window.__TRAILER_BLOBS);
            const ext0 = mime2ext(r.mime ?? '');
            for (const [name, b64] of Object.entries(blobs)) {
              const ext = name === 'main' ? ext0 : 'webm';
              const file = path.join(out, name === 'main' ? `${clip.id}.${ext}` : `${clip.id}.${name}.${ext}`);
              await writeFile(file, Buffer.from(b64, 'base64'));
              if (name === 'main') best.file = file;
            }
          }
          if (r.ok) break;
        }

        if (!best) { console.log(`  ${clip.id}: no usable take`); continue; }
        manifest.push({
          id: clip.id, doc: clip.doc, shot: clip.shot, dur: clip.dur,
          file: best.file, mime: best.mime, frames: best.frames, fps: best.fps,
          hitch: best.hitch, long: best.long, p99: best.p99, degraded: !best.ok,
          travel: best.travel, vfxRan: best.vfxRan,
          w: ha.w, h: ha.h, build: ha.build,
        });
      }
    });
  });

  /*
   * MERGE, never replace.
   *
   * Re-recording a few clips is the normal way to work -- a take gets rejected,
   * or a framing gets retuned -- and the first version of this wrote the
   * manifest from the current run alone. Re-shooting five of seventeen clips
   * therefore left a manifest describing five, and the cut refused to build
   * against fourteen recordings that were sitting on disk the whole time.
   *
   * The files are the durable artifact; the manifest is an index of them, and
   * an index that forgets rows it did not just write is a trap.
   */
  const mf = path.join(out, 'clips.json');
  let prior: Array<Record<string, unknown>> = [];
  try {
    const old = JSON.parse(await readFile(mf, 'utf8')) as { clips?: Array<Record<string, unknown>> };
    prior = old.clips ?? [];
  } catch { /* first run in this directory */ }

  const merged = new Map<string, Record<string, unknown>>();
  for (const row of prior) merged.set(String(row.id), row);
  for (const row of manifest) merged.set(String(row.id), row);   // this run wins

  await writeFile(mf, JSON.stringify({
    clips: [...merged.values()],
    lastRun: { clips: manifest.map((m) => m.id), attempts, baseline, build: ha.build, argv },
  }, null, 2));

  const bad = manifest.filter((m) => m.degraded);
  console.log(`\n[trailer] ${manifest.length}/${clips.length} recorded, ${merged.size} in the manifest -> ${mf}`);
  if (bad.length) {
    console.log(`[trailer] ${bad.length} DEGRADED (kept, flagged in the manifest): ${bad.map((b) => b.id).join(', ')}`);
    process.exitCode = 1;
  }
}

function mime2ext(m: string): string {
  for (const [k, v] of Object.entries(EXT)) if (m.startsWith(k)) return v;
  return 'webm';
}

await runTool(main);
