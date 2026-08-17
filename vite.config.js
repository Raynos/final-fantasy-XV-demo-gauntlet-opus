import { defineConfig } from 'vite';
import { bakePlugin } from './tools/vite-plugin-bake.mjs';

export default defineConfig({
  plugins: [bakePlugin()],
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  build: { target: 'esnext', sourcemap: false },
});
