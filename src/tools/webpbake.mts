#!/usr/bin/env node
/**
 * Re-encode the baked texture containers as WebP, for the phone.
 *
 *   node src/tools/webpbake.mts [--force]
 *
 * ## Why this exists
 *
 * The five `baked/*.bin.gz` containers store every texture as four gzipped
 * byte planes. Measured over 39 of them by `_probe/webpsize.mts`, that is
 * ~2.5x against raw — and **WebP q80 on the same bytes is 7.5x**, because gzip
 * has no idea the bytes are a picture and WebP does. On a phone that is the
 * difference between a 44 MB download and something a person will wait for.
 *
 * So this reads each plane container and writes `baked/m/<tier>.bin`, same
 * index, WebP payloads. `TexBake.tierPath()` picks between them at runtime off
 * the detection that already exists, which is what makes "one build, two data
 * sets" work: the choice is made before the first fetch goes out.
 *
 * ## Why it needs a browser
 *
 * Node has no image encoder here and adding one would mean a network install,
 * which `src/tools/README.md` forbids. A browser has had two good ones for
 * twenty years, this repo already drives one for `--canvas` and `--geo`, and
 * `canvas.toBlob` is the *same encoder family* the phone will decode with.
 *
 * ## Quality, by what the texture is for
 *
 * Lossy is invisible on colour at 256-512 px on a 390 px screen, and it is
 * very visible on a normal map, where the three channels are a unit vector and
 * a compression artefact is a dent in the surface. So quality follows the key
 * suffix rather than being one number for everything.
 */
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lease, buildServer, runTool } from './harness.mts';
import { resolveBuild } from './identity.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BAKE_DIR = path.join(ROOT, 'src', 'public', 'baked');
const OUT_DIR = path.join(BAKE_DIR, 'm');
const STAMP = path.join(OUT_DIR, 'webp.json');

/** The five tiers, and the plane container each is re-encoded from. */
const TIERS = ['tex', 'texc', 'texd', 'texp', 'texcp'] as const;

/**
 * Freshness is the source containers' own mtimes.
 *
 * Not a source hash: this bake has no generator sources of its own, it is a
 * pure function of five files that already carry hashes of theirs. Asking
 * "have those files changed since I last ran" is both simpler and impossible
 * to get subtly wrong.
 */
async function isFresh(): Promise<boolean> {
  if (!existsSync(STAMP)) return false;
  try {
    const stamp = JSON.parse(await readFile(STAMP, 'utf8'));
    for (const tier of TIERS) {
      const src = path.join(BAKE_DIR, `${tier}.bin.gz`);
      const out = path.join(OUT_DIR, `${tier}.bin`);
      if (!existsSync(src)) continue;
      if (!existsSync(out)) return false;
      if ((await stat(src)).mtimeMs > (stamp.at || 0)) return false;
    }
    return true;
  } catch { return false; }
}

export async function webpBake(opts: { force?: boolean, quiet?: boolean } = {}): Promise<boolean> {
  if (!opts.force && await isFresh()) return false;
  const log = opts.quiet ? () => {} : (...a: unknown[]) => console.log('[webpbake]', ...a);
  const t0 = Date.now();

  const { port: vitePort } = await buildServer({ build: resolveBuild(undefined) });

  // A socket the page POSTs each finished container to, keyed on path. Port 0
  // so it can never collide with a worktree PORT or its capture daemon.
  const resolvers = new Map<string, (b: Buffer) => void>();
  const bodies = new Map<string, Promise<Buffer>>();
  for (const tier of TIERS) bodies.set(tier, new Promise<Buffer>((r) => resolvers.set(tier, r)));
  const sink = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': '*',
      }).end();
      return;
    }
    const which = (req.url || '').replace(/^\//, '');
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      res.writeHead(204, { 'access-control-allow-origin': '*' }).end();
      const done = resolvers.get(which);
      if (done) done(Buffer.concat(chunks));
      else console.warn('[webpbake] unexpected POST to', which);
    });
  });
  await new Promise<void>((r) => sink.listen(0, '127.0.0.1', () => r()));
  const sinkPort = (sink.address() as net.AddressInfo).port;

  // A blank page: this needs a canvas and `fetch`, and nothing else. Booting
  // the game would cost 8 s and a GPU context to run an encoder.
  const leased = await lease({ blank: true, w: 64, h: 64, agent: 'webpbake', lane: 'sweep' });
  const rows: Array<{ tier: string, n: number, src: number, out: number }> = [];
  try {
    const { page } = leased;
    page.on('pageerror', (e) => log('PAGEERROR:', String(e).split('\n')[0]));
    page.on('console', (m) => { if (m.type() === 'error') log('PAGE:', m.text().slice(0, 160)); });
    await page.goto(`http://127.0.0.1:${vitePort}/`, { waitUntil: 'domcontentloaded', timeout: 300000 });

    await mkdir(OUT_DIR, { recursive: true });
    for (const tier of TIERS) {
      const src = path.join(BAKE_DIR, `${tier}.bin.gz`);
      if (!existsSync(src)) { log(`${tier}: no source container, skipped`); resolvers.get(tier)!(Buffer.alloc(0)); continue; }
      const posted: number = await page.evaluate(async ([vp, sp, t]: [number, number, string]) => {
        const IMG_MAGIC = 'EOSTIM01';
        const enc = new TextEncoder();

        // --- read the plane container -------------------------------------
        const res = await fetch(`http://127.0.0.1:${vp}/baked/${t}.bin.gz`);
        const encd = (res.headers.get('content-encoding') || '').includes('gzip');
        const body = encd ? res.body! : res.body!.pipeThrough(new DecompressionStream('gzip'));
        const buf = new Uint8Array(await new Response(body).arrayBuffer());
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        const hlen = dv.getUint32(8, true);
        const header = JSON.parse(new TextDecoder().decode(buf.subarray(12, 12 + hlen)));
        const planeBody = 12 + hlen;

        // Planes back to interleaved RGBA. The plane split is what makes gzip
        // work at all on this data; an image codec wants the pixels.
        const unplane = (src: Uint8Array, w: number, h: number, ch: number) => {
          const n = w * h;
          const out = new Uint8ClampedArray(n * 4);
          for (let c = 0; c < ch; c++) {
            const p = c * n;
            for (let i = 0; i < n; i++) out[i * 4 + c] = src[p + i];
          }
          if (ch < 4) for (let i = 0; i < n; i++) out[i * 4 + 3] = 255;
          return out;
        };

        /**
         * Quality by what the map is FOR, and losslessness for the ones that
         * are not pictures at all.
         *
         * `sky/cloud/*` is the case that taught this. Those three are 3D noise
         * fields sampled by the volumetric cloud march -- `base` is a 64x4096
         * atlas of slices, `detail` a 48x2304 one. Every texel is
         * uncorrelated with its neighbour BY CONSTRUCTION, which is the exact
         * signal a DCT codec destroys: q78 turned the sky into a field of
         * white speckles, and the first device report on it was "the skybox
         * looks like dogshit". It was right.
         *
         * The rule generalises: lossy is for things a human looks AT, and
         * lossless is for things a shader reads FROM. A normal map is the
         * borderline case and gets q92 -- its channels are a unit vector, so
         * an artefact is a dent in a surface, but it is at least spatially
         * smooth.
         */
        const qualityFor = (key: string) => {
          const suffix = key.slice(key.lastIndexOf('/') + 1);
          if (suffix === 'normal') return 0.92;
          if (suffix === 'rough' || suffix === 'ao' || suffix === 'height' || suffix === 'data') return 0.84;
          return 0.78;
        };

        /**
         * PNG, not WebP, for the textures a shader reads as DATA.
         *
         * `toBlob('image/webp', 1)` is **lossy quality 100, not lossless** --
         * Chrome's canvas exposes no lossless-WebP path at all. On a photograph
         * that distinction does not matter. On `sky/cloud/*`, which is a 3D
         * noise field where every texel is uncorrelated with its neighbour by
         * construction, q100 is still a DCT and still destroys it: the sky came
         * out as a field of white speckles, and setting quality to 1 changed
         * nothing because it was never the quality.
         *
         * PNG was the next attempt and it did not fix it either, which is the
         * clue that matters: the problem is not the CODEC, it is the round
         * trip. Canvas 2D is a lossy pipe for data no matter what comes out
         * the far end -- premultiplied alpha, 8-bit clamping, colour-space
         * conversion on `drawImage`. There is no quality setting that makes
         * `putImageData` -> `toBlob` -> `createImageBitmap` -> `getImageData`
         * an identity function.
         *
         * So these do not go through it at all. `raw` stores the RGBA bytes
         * verbatim and the decoder memcpy's them. The wire cost is handled a
         * layer down -- the CDN gzips `m/tex.bin` in transit (measured: 2.8 MB
         * on disk arrived as 1.9) -- which is exactly the compression these
         * bytes wanted in the first place, and the same compression they had
         * before any of this.
         */
        const mimeFor = (key: string) => (key.startsWith('sky/') ? 'raw' : 'image/webp');

        const cv = document.createElement('canvas');
        const ctx = cv.getContext('2d', { willReadFrequently: true })!;
        const toBlob = (mime: string, q: number): Promise<Blob | null> =>
          new Promise((r) => cv.toBlob(r, mime, q));

        /**
         * THE PREMULTIPLIED-ALPHA TRAP, and why a texture with alpha is
         * written as TWO opaque images instead of one with an alpha channel.
         *
         * Canvas 2D stores premultiplied alpha. Put RGBA in with
         * `putImageData` and read it back and every pixel has been multiplied
         * by its own alpha and divided again -- lossy where alpha is low, and
         * TOTAL where alpha is 0, because 0/0 cannot be recovered. For a
         * texture whose alpha is transparency that is survivable. For one
         * whose alpha is DATA it is destruction.
         *
         * `sky/cloud/base` is a 64x4096 atlas of 3D noise slices with density
         * in the alpha channel, and the first build of this shipped a sky made
         * of white speckles because of exactly this. The control that found it:
         * the same shot at q=low WITHOUT the demo renders perfect clouds.
         *
         * So: alpha is forced opaque for the colour image, and the real alpha
         * goes in a second greyscale image. Neither ever meets a premultiply.
         * Opaque textures -- most of them -- still write one file.
         */
        const entries: Array<{ k: string, w: number, h: number, off: number, len: number, mime: string, aOff?: number, aLen?: number }> = [];
        const files: Uint8Array[] = [];
        let off = 0;
        for (const e of header.entries) {
          const len = e.w * e.h * 4;
          const px = unplane(buf.subarray(planeBody + e.off, planeBody + e.off + len), e.w, e.h, 4);
          const q = qualityFor(e.k);
          const mime = mimeFor(e.k);

          let hasAlpha = false;   // eslint-disable-line prefer-const
          for (let i = 3; i < px.length; i += 4) if (px[i] !== 255) { hasAlpha = true; break; }

          let bytes: Uint8Array;
          if (mime === 'raw') {
            bytes = new Uint8Array(px.buffer.slice(0));
            hasAlpha = false;                    // it is all in there already
          } else {
            // Colour, always opaque.
            const rgb = new Uint8ClampedArray(px.length);
            rgb.set(px);
            if (hasAlpha) for (let i = 3; i < rgb.length; i += 4) rgb[i] = 255;
            cv.width = e.w; cv.height = e.h;
            ctx.putImageData(new ImageData(rgb, e.w, e.h), 0, 0);
            const blob = await toBlob(mime, q);
            if (!blob) continue;
            bytes = new Uint8Array(await blob.arrayBuffer());
          }
          const row: { k: string, w: number, h: number, off: number, len: number, mime: string, aOff?: number, aLen?: number } =
            { k: e.k, w: e.w, h: e.h, off, len: bytes.length, mime };
          files.push(bytes);
          off += bytes.length;

          if (hasAlpha) {
            // Alpha as its own opaque greyscale PNG -- genuinely lossless,
            // unlike WebP q1. An alpha channel is a mask or a density field,
            // and a DCT ring on either is a hole in something.
            const a = new Uint8ClampedArray(px.length);
            for (let i = 0; i < px.length; i += 4) {
              a[i] = a[i + 1] = a[i + 2] = px[i + 3];
              a[i + 3] = 255;
            }
            ctx.putImageData(new ImageData(a, e.w, e.h), 0, 0);
            const ab = await toBlob('image/png', 1);
            if (ab) {
              const abytes = new Uint8Array(await ab.arrayBuffer());
              row.aOff = off; row.aLen = abytes.length;
              files.push(abytes);
              off += abytes.length;
            }
          }
          entries.push(row);
        }

        const hdr = enc.encode(JSON.stringify({ version: 1, hash: header.hash, enc: 'webp', entries }));
        const out = new Uint8Array(8 + 4 + hdr.length + off);
        for (let i = 0; i < 8; i++) out[i] = IMG_MAGIC.charCodeAt(i);
        new DataView(out.buffer).setUint32(8, hdr.length, true);
        out.set(hdr, 12);
        let p = 12 + hdr.length;
        for (const f of files) { out.set(f, p); p += f.length; }

        await fetch(`http://127.0.0.1:${sp}/${t}`, { method: 'POST', body: out as BodyInit });
        return entries.length;
      }, [vitePort, sinkPort, tier] as [number, number, string]);

      const gz = await bodies.get(tier)!;
      await writeFile(path.join(OUT_DIR, `${tier}.bin`), gz);
      const srcSize = (await stat(src)).size;
      rows.push({ tier, n: posted, src: srcSize, out: gz.length });
      log(`${tier.padEnd(6)} ${String(posted).padStart(3)} textures  `
        + `${(srcSize / 1e6).toFixed(1)} MB gz -> ${(gz.length / 1e6).toFixed(1)} MB webp  `
        + `(${(srcSize / Math.max(1, gz.length)).toFixed(1)}x)`);
    }
  } finally {
    await leased.release();
    sink.close();
  }

  await writeFile(STAMP, JSON.stringify({ at: Date.now(), rows }, null, 2));
  const src = rows.reduce((s, r) => s + r.src, 0), out = rows.reduce((s, r) => s + r.out, 0);
  log(`total ${(src / 1e6).toFixed(1)} MB gz -> ${(out / 1e6).toFixed(1)} MB webp `
    + `(${(src / Math.max(1, out)).toFixed(1)}x) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await runTool(async () => {
    const argv = process.argv.slice(2);
    if (!(await webpBake({ force: argv.includes('--force') }))) console.log('[webpbake] already fresh');
  });
}
