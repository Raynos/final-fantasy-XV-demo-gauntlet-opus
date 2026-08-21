import { defineConfig } from 'vite';
import { bakePlugin } from './src/tools/vite-plugin-bake.mjs';
import { reviewPlugin } from './src/tools/vite-plugin-review.mjs';

export default defineConfig({
  plugins: [bakePlugin(), reviewPlugin()],
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  build: { target: 'esnext', sourcemap: false },
});
