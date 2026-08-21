import { bake } from './bake.mjs';

/**
 * Make sure the baked world artifacts exist before anything is served or built.
 *
 * Runs in dev, preview and build alike. The bake is content-hashed against its
 * generator sources, so this is a no-op on every start after the first, and an
 * edit to `Field.js` re-bakes automatically instead of quietly serving stale
 * terrain.
 *
 * @returns {import('vite').Plugin}
 */
export function bakePlugin() {
  let done = null;
  return {
    name: 'eos-bake',
    async configResolved() {
      if (!done) done = bake({}).catch((e) => {
        // Never block a server start on the cache: the game regenerates.
        console.warn('[bake] failed, the browser will generate at runtime:', e && e.message);
      });
      await done;
    },
  };
}
