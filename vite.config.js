import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { bakePlugin } from './src/tools/vite-plugin-bake.mts';
import { reviewPlugin } from './src/tools/vite-plugin-review.mts';

/**
 * Print the dev URL with `?debug=1` on it, so the link you click lands in the
 * dev suite rather than in a bare game you then have to edit the address bar for.
 *
 * The suite is the console, freecam, asset browser and review inbox, and it is
 * how a human actually looks at this thing. It refuses to load when `?shoot` is
 * present, so captures are unaffected — that guard is a determinism contract and
 * this does not touch it.
 */
function debugUrlPlugin() {
  const patchPrintUrls = (server) => {
    const print = server.printUrls.bind(server);
    server.printUrls = () => {
      const resolved = server.resolvedUrls;
      if (resolved) {
        for (const k of ['local', 'network']) {
          if (resolved[k]) resolved[k] = resolved[k].map((u) => `${u}?debug=1`);
        }
      }
      print();
    };
  };
  return {
    name: 'eos-debug-url',
    apply: 'serve',
    configureServer: patchPrintUrls,
    configurePreviewServer: patchPrintUrls,
  };
}

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // `src/` is the server root, so `src/index.html` is the entry and in-page
  // dev-server URLs are `/world/...`, not `/src/world/...`. The repo root holds
  // config and the four buckets; nothing the build reads lives there.
  root: path.join(ROOT, 'src'),
  // Generated terrain cache (`src/tools/bake.mts`). Vite serves it at `/` in dev
  // and copies it into `dist/baked/` on build -- it is the source the dev server
  // reads, which is why it cannot live in `dist/`: the build empties that.
  publicDir: path.join(ROOT, 'src', 'public'),
  plugins: [bakePlugin(), reviewPlugin(), debugUrlPlugin()],
  /**
   * **HMR AND FILE WATCHING ARE OFF, AND THIS IS NOT A PREFERENCE.**
   *
   * Every server this repo runs is started by the capture daemon and consumed
   * by an agent's probe, never by a human refreshing a tab. Live reload in that
   * setting is not a convenience, it is a fault injector: the `dirty:` build
   * serves the **shared working tree**, so the moment *any* agent on the
   * machine saves *any* watched file, vite navigates every open page — and a
   * page under a long `page.evaluate` dies with
   *
   *     page.evaluate: Execution context was destroyed, most likely because
   *     of a navigation
   *
   * which reads like a crash and is not one. It killed a twelve-minute
   * `longplay` session, killed `regaliadrive` twice mid-run, and cost two
   * lanes real time diagnosing it as a browser or memory problem. With four
   * lanes committing, a probe that runs longer than a few minutes could not
   * finish at all.
   *
   * Turning it off here rather than reaching for `vite build` + `vite preview`
   * is deliberate: a preview server has no source URLs, and `heightcheck`,
   * `bootprof` and the probe rigs `import('/world/...')` **inside the page** to
   * compare the GPU's answer against the same source the shader was built
   * from. Preview 404s those, and the failure looks like a broken probe rather
   * than a wrong server. So: keep the source URLs, delete the reloading.
   *
   * `pnpm dev` is gone from `package.json` for the same reason. Nobody starts a
   * server here — a hook blocks it, and `daemon.mts` owns every one.
   */
  server: {
    port: 5173, strictPort: true, host: '127.0.0.1',
    hmr: false,
    watch: { ignored: ['**/*'] },
  },
  preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
  // outDir sits outside `root`, so emptyOutDir must be explicit.
  build: { target: 'esnext', sourcemap: false, outDir: path.join(ROOT, 'dist'), emptyOutDir: true },
});
