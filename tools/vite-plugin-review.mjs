/**
 * Dev-server routes that let the running game write review notes to disk.
 *
 * The game is a browser page and browsers cannot write files, so the in-game
 * review suite (`src/dev/**`) needs a same-origin endpoint to POST to. Nothing
 * else in this project hooks the Vite server — `vite-plugin-bake.mjs` uses only
 * `configResolved` — so these routes are uncontested.
 *
 * Registered on **both** `configureServer` and `configurePreviewServer`:
 * `vite preview` is a separate server that shares no middleware with `vite dev`,
 * and reviewing a production build is exactly when you most want to file notes.
 * A page opened straight off the filesystem has neither, which is why the client
 * falls back to a browser download when these routes 404.
 *
 * This is localhost middleware for *authoring*, not asset acquisition — it does
 * not weaken BRIEF rule 1 ("no fetch, no CDN"), which is about the game shipping
 * content it did not generate. Nothing here is reachable from the game proper;
 * only `src/dev/**` calls it, and that only loads under `?debug`.
 */
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REVIEW = path.join(ROOT, '.review');
const INBOX = path.join(REVIEW, 'inbox');
const TUNING = path.join(REVIEW, 'tuning');
const exec = promisify(execFile);

/**
 * Cap on a single POST. A 1600x900 PNG data URI runs ~2-4 MB; 64 MB is far
 * above any legitimate note and still refuses a runaway client that would
 * otherwise buffer without bound.
 */
const MAX_BODY = 64 * 1024 * 1024;

const send = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(body);
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const chunks = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > MAX_BODY) { reject(new Error(`body over ${MAX_BODY} bytes`)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

/**
 * A filesystem-safe, sortable stamp. Notes are named by time so `ls` is
 * chronological and a drain pass can process them in the order they were filed.
 */
const stamp = (iso) => String(iso || new Date().toISOString()).replace(/[:.]/g, '-').replace(/Z$/, '');

/** Short random id so two notes filed in the same second cannot collide. */
const rid = () => Math.random().toString(36).slice(2, 8);

/** Refuse anything that could escape `.review/` via `../` or an absolute path. */
const safeName = (s, fallback) => {
  const base = path.basename(String(s || fallback));
  return /^[\w.-]+$/.test(base) ? base : fallback;
};

/**
 * Git SHA plus a dirty flag, so a note records exactly which tree produced it.
 * The single most important field in a bug report is the build it came from --
 * without it you cannot tell a fixed bug from a live one.
 */
async function buildId() {
  try {
    const { stdout: sha } = await exec('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT });
    const { stdout: st } = await exec('git', ['status', '--porcelain'], { cwd: ROOT });
    return { sha: sha.trim(), dirty: st.trim().length > 0 };
  } catch {
    return { sha: 'unknown', dirty: null };
  }
}

async function handle(req, res) {
  const url = (req.url || '').split('?')[0];
  if (!url.startsWith('/__review/')) return false;

  try {
    if (url === '/__review/build' && req.method === 'GET') {
      send(res, 200, await buildId());
      return true;
    }

    if (url === '/__review/note' && req.method === 'POST') {
      const body = await readBody(req);
      await mkdir(INBOX, { recursive: true });
      const id = `${stamp(body.at)}-${rid()}`;

      // The PNG rides in as a data URI because that is what
      // `canvas.toDataURL()` hands us; split it back out so the note is a
      // readable JSON file next to a real image an agent can open.
      let png = null;
      if (typeof body.png === 'string' && body.png.startsWith('data:image/png;base64,')) {
        png = `${id}.png`;
        await writeFile(path.join(INBOX, png), Buffer.from(body.png.slice(22), 'base64'));
      }
      const note = { id, ...body, png, build: body.build || await buildId() };
      delete note.at;
      note.at = body.at || new Date().toISOString();
      await writeFile(path.join(INBOX, `${id}.json`), `${JSON.stringify(note, null, 2)}\n`);
      send(res, 200, { ok: true, id, png });
      return true;
    }

    if (url === '/__review/inbox' && req.method === 'GET') {
      let names = [];
      try { names = (await readdir(INBOX)).filter((f) => f.endsWith('.json')); } catch { /* none filed yet */ }
      const notes = await Promise.all(names.sort().map(async (f) => {
        try { return JSON.parse(await readFile(path.join(INBOX, f), 'utf8')); } catch { return null; }
      }));
      send(res, 200, { notes: notes.filter(Boolean) });
      return true;
    }

    if (url === '/__review/tuning' && req.method === 'POST') {
      const body = await readBody(req);
      await mkdir(TUNING, { recursive: true });
      const name = safeName(body.name, 'tuning.patch.json');
      await writeFile(path.join(TUNING, name), `${JSON.stringify(body.patch ?? {}, null, 2)}\n`);
      send(res, 200, { ok: true, file: path.relative(ROOT, path.join(TUNING, name)) });
      return true;
    }

    send(res, 404, { error: `no route ${url}` });
    return true;
  } catch (err) {
    send(res, 500, { error: String((err && err.message) || err) });
    return true;
  }
}

const middleware = (req, res, next) => {
  handle(req, res).then((taken) => { if (!taken) next(); }).catch(next);
};

/** @returns {import('vite').Plugin} */
export function reviewPlugin() {
  return {
    name: 'eos-review',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
