#!/usr/bin/env node
/**
 * Cut the recorded takes into the finished trailer.
 *
 *   node src/tools/trailercut.mts                    # normalise, cut, encode
 *   node src/tools/trailercut.mts --proxy            # 960x540 draft, seconds not minutes
 *   node src/tools/trailercut.mts --dry-run          # print the EDL and the filter graph
 *   node src/tools/trailercut.mts --audio sfx        # stems instead of the recorded program mix
 *
 * This never touches a browser and never re-records. That seam is the whole
 * point of the design: recording is the expensive, non-reproducible step, so
 * the cut reads `clips.json` plus `cuts.json` and nothing else. Retiming the
 * edit is a JSON change and a re-run.
 *
 * ## Two stages, because generation loss is real and re-cutting is frequent
 *
 * Stage A normalises each take once -- VFR to CFR 60, scaled to the master
 * resolution, short GOP -- and caches it. `MediaRecorder` writes variable frame
 * timing (`captureStream(0)` stamps each frame as it was actually rendered, so
 * a heavy shot genuinely arrives at ~50 fps), and `trim` on a variable-timestamp
 * source drifts. Normalising first is what makes a frame-accurate cut possible
 * at all.
 *
 * Stage B does the whole edit in one filter graph: trim, fade, concat, audio,
 * encode. One command means no intermediate re-encode between cuts.
 *
 * ## On titles
 *
 * This ffmpeg cannot draw text. `/opt/homebrew/bin/ffmpeg` 8.1.2 here is built
 * without libfreetype, libfontconfig, libharfbuzz and libass, so `drawtext`,
 * `subtitles` and `ass` are all absent -- verified, not assumed. That is fine,
 * because the alternative was better anyway: the closing lockup is *recorded*
 * from the game's own title screen, whose crest draws itself and whose
 * letterspaced type arrives before the menu does. Real type, real animation,
 * and no font to match.
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execFile);
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';

interface CutEvent {
  id: string; at: number; len: number; in: number;
  fadeIn?: number; fadeOut?: number;
}
interface CutSheet {
  fps: number; w: number; h: number; duration: number; events: CutEvent[];
}
interface ClipRow { id: string; file: string; fps?: number; degraded?: boolean }

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const val = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };

const clipsDir = val('--clips', 'tmp/trailer/clips');
const sheetPath = val('--sheet', 'src/tools/trailer/cuts.json');
const outDir = val('--out', 'tmp/trailer/out');
const workDir = val('--work', 'tmp/trailer/norm');
const audioMode = val('--audio', 'program');      // program | sfx | none
const proxy = flag('--proxy');
const dryRun = flag('--dry-run');

const sheet: CutSheet = JSON.parse(await readFile(sheetPath, 'utf8'));
const manifest = JSON.parse(await readFile(path.join(clipsDir, 'clips.json'), 'utf8'));
const byId = new Map<string, ClipRow>(manifest.clips.map((c: ClipRow) => [c.id, c]));

const W = proxy ? 960 : sheet.w;
const H = proxy ? 540 : sheet.h;
const FPS = sheet.fps;

/* --------------------------------------------------------------- prep -- */

await mkdir(outDir, { recursive: true });
await mkdir(workDir, { recursive: true });

const missing = sheet.events.filter((e) => !byId.has(e.id));
if (missing.length) throw new Error(`no recording for: ${missing.map((m) => m.id).join(', ')}`);

/** Is `src` newer than `dst`? A normalise we can skip is the whole cache. */
async function stale(src: string, dst: string): Promise<boolean> {
  try {
    const [a, b] = await Promise.all([stat(src), stat(dst)]);
    return a.mtimeMs > b.mtimeMs;
  } catch { return true; }
}

/** Seconds of a media file, from the container. */
async function duration(file: string): Promise<number> {
  const { stdout } = await exec(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ]);
  return Number(stdout.trim());
}

/* ------------------------------------------------------------ stage A -- */

const normOf = (id: string) => path.join(workDir, `${id}-${W}x${H}.mp4`);

if (!dryRun) {
  for (const e of sheet.events) {
    const row = byId.get(e.id)!;
    const dst = normOf(e.id);
    if (!await stale(row.file, dst)) { console.log(`  cached   ${e.id}`); continue; }
    // CFR first, and before the scale: the source is variable-rate and every
    // later trim is in frames.
    await exec(FFMPEG, [
      '-y', '-v', 'error', '-fflags', '+genpts', '-i', row.file,
      '-an', '-vf', `fps=${FPS},scale=${W}:${H}:flags=lanczos,setsar=1,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', proxy ? '20' : '12',
      '-g', '30', '-keyint_min', '1', '-sc_threshold', '0', dst,
    ]);
    console.log(`  normalised ${e.id}`);
  }
}

/* ------------------------------------------------------------ stage B -- */

const inputs: string[] = [];
const vparts: string[] = [];
const aparts: string[] = [];
let n = 0;

for (const e of sheet.events) {
  const row = byId.get(e.id)!;
  const vIdx = n++;
  inputs.push('-i', normOf(e.id));

  const t0 = e.in;
  const t1 = e.in + e.len;
  let v = `[${vIdx}:v]trim=start=${t0.toFixed(4)}:end=${t1.toFixed(4)},setpts=PTS-STARTPTS`;
  if (e.fadeIn) v += `,fade=t=in:st=0:d=${e.fadeIn}:color=black`;
  if (e.fadeOut) v += `,fade=t=out:st=${(e.len - e.fadeOut).toFixed(4)}:d=${e.fadeOut}:color=black`;
  vparts.push(`${v}[v${vIdx}];`);

  if (audioMode !== 'none') {
    const aFile = audioMode === 'sfx'
      ? row.file.replace(/\.(mp4|mkv|webm)$/, '.sfx.webm')
      : row.file;
    const aIdx = n++;
    inputs.push('-i', aFile);
    // Short fades on every splice: a hard cut into a sustained ambience bed
    // clicks, and the click is much more noticeable than the cut.
    aparts.push(
      `[${aIdx}:a]atrim=start=${t0.toFixed(4)}:end=${t1.toFixed(4)},asetpts=PTS-STARTPTS,`
      + `afade=t=in:d=0.015,afade=t=out:st=${Math.max(0, e.len - 0.025).toFixed(4)}:d=0.025,`
      + `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${aIdx}];`,
    );
  }
}

const vLabels = sheet.events.map((_, i) => `[v${audioMode === 'none' ? i : i * 2}]`).join('');
let graph = vparts.join('\n') + '\n'
  + `${vLabels}concat=n=${sheet.events.length}:v=1:a=0,`
  + `fade=t=out:st=${(sheet.duration - 0.5).toFixed(2)}:d=0.5,format=yuv420p[v];`;

if (audioMode !== 'none') {
  const aLabels = sheet.events.map((_, i) => `[a${i * 2 + 1}]`).join('');
  graph += '\n' + aparts.join('\n') + '\n'
    + `${aLabels}concat=n=${sheet.events.length}:v=0:a=1,`
    + `afade=t=out:st=${(sheet.duration - 0.5).toFixed(2)}:d=0.5,`
    + 'loudnorm=I=-14:TP=-1.5:LRA=11[a];';
}

const graphFile = path.join(outDir, 'graph.txt');
await writeFile(graphFile, graph);

const outFile = path.join(outDir, proxy ? 'trailer-proxy.mp4' : 'ffxv-trailer-1080p60.mp4');
const args = [
  '-y', '-hide_banner', '-v', 'error', '-stats',
  ...inputs,
  '-filter_complex_script', graphFile,
  '-map', '[v]',
  ...(audioMode !== 'none' ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000'] : []),
  '-c:v', 'libx264', '-preset', proxy ? 'veryfast' : 'slow', '-crf', proxy ? '26' : '17',
  '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
  '-movflags', '+faststart', '-t', String(sheet.duration), outFile,
];

console.log(`\n[cut] ${sheet.events.length} events, ${sheet.duration}s, ${W}x${H}@${FPS}, audio=${audioMode}`);
for (const e of sheet.events) {
  const row = byId.get(e.id)!;
  console.log(
    `  ${e.at.toFixed(3).padStart(6)}  ${e.len.toFixed(3).padStart(5)}s  ${e.id.padEnd(13)}`
    + `in ${e.in.toFixed(2)}${row.degraded ? '   (degraded take)' : ''}`,
  );
}
if (dryRun) { console.log(`\n[cut] graph -> ${graphFile}`); process.exit(0); }

await exec(FFMPEG, args, { maxBuffer: 64 * 1024 * 1024 });

const dur = await duration(outFile);
const { stdout: probe } = await exec(FFPROBE, [
  '-v', 'error', '-select_streams', 'v:0', '-count_packets',
  '-show_entries', 'stream=nb_read_packets,width,height,r_frame_rate',
  '-of', 'default=nw=1', outFile,
]);
const size = (await stat(outFile)).size;

// A poster from the Astral act, before any fade.
const poster = path.join(outDir, 'poster.jpg');
await exec(FFMPEG, ['-y', '-v', 'error', '-ss', '23.2', '-i', outFile, '-frames:v', '1', '-q:v', '2', poster]);

console.log(`\n[cut] ${outFile}`);
console.log(`      ${(size / 1048576).toFixed(1)} MB, ${dur.toFixed(3)} s`);
console.log(probe.trim().split('\n').map((l) => `      ${l}`).join('\n'));
console.log(`      poster -> ${poster}`);
