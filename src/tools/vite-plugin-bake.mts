import { bake } from './bake.mts';
import { texBake, TEX_SOURCES } from './texbake.mts';

/**
 * Make sure the baked world artifacts exist before anything is served or built.
 *
 * Runs in dev, preview and build alike. The bake is content-hashed against its
 * generator sources, so this is a no-op on every start after the first, and an
 * edit to `Field.ts` re-bakes automatically instead of quietly serving stale
 * terrain.
 *
 */
export function bakePlugin(): import('vite').Plugin {
  let done: Promise<void> | null = null;
  return {
    name: 'eos-bake',
    async configResolved() {
      if (!done) done = Promise.all([
        // The terrain field, and the world dressing's procedural textures.
        // Both are content-hashed against their own generator sources, so both
        // are a no-op on every start after the first.
        bake({}).catch((e) => {
          // Never block a server start on the cache: the game regenerates.
          console.warn('[bake] failed, the browser will generate at runtime:', e && e.message);
        }),
        texBake({}).catch((e) => {
          console.warn('[texbake] failed, the browser will generate at runtime:', e && e.message);
        }),
      ]).then(() => undefined);
      await done;
    },
    /**
     * Re-bake the texel cache when a generator is edited.
     *
     * `configResolved` only runs at server start, and the runtime deliberately
     * does not re-check the source hash — so without this, editing
     * `TownMaterials.ts` and letting HMR reload the page would serve the *old*
     * texels under the right keys. That is the one failure this cache can have
     * that does not announce itself: not a miss, which costs generation time
     * and nothing else, but a silent wrong answer.
     *
     * `texBake` hashes its own sources, so an edit to anything else is one
     * `stat` and seven reads.
     */
    async handleHotUpdate(ctx) {
      if (!TEX_SOURCES.some((rel) => ctx.file.endsWith(rel.replace(/^src\//, '')))) return;
      await texBake({}).catch((e) => {
        console.warn('[texbake] re-bake failed, the browser will generate at runtime:', e && e.message);
      });
    },
  };
}
