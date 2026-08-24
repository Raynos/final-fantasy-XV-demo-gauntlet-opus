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
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
  // outDir sits outside `root`, so emptyOutDir must be explicit.
  build: { target: 'esnext', sourcemap: false, outDir: path.join(ROOT, 'dist'), emptyOutDir: true },
});
