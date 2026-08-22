import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { bakePlugin } from './src/tools/vite-plugin-bake.mts';
import { reviewPlugin } from './src/tools/vite-plugin-review.mts';

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
  plugins: [bakePlugin(), reviewPlugin()],
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  // outDir sits outside `root`, so emptyOutDir must be explicit.
  build: { target: 'esnext', sourcemap: false, outDir: path.join(ROOT, 'dist'), emptyOutDir: true },
});
