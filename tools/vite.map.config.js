import { defineConfig } from 'vite';

/**
 * Vite config for the world-map capture tools.
 *
 * `node_modules` is shared between agent worktrees, so the default
 * `node_modules/.vite` dependency cache is fought over by several vite servers
 * at once — each decides the config has changed, re-optimises, and triggers a
 * full page reload, which the capture harness sees as a boot that never
 * finishes. A private cache directory makes the harness immune to that.
 */
export default defineConfig({
  cacheDir: 'node_modules/.vite-worldmap',
  server: { strictPort: true, host: '127.0.0.1' },
  build: { target: 'esnext', sourcemap: false },
});
