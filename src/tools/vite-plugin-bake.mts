import { bake } from './bake.mts';
import { texBake, pruneStaleCanvasBake, TEX_SOURCES } from './texbake.mts';

/**
 * Make sure the baked world artifacts exist before anything is served or built.
 *
 * Runs in **dev and build**, and deliberately not in `preview`. The bake is
 * content-hashed against its generator sources, so it is a no-op on every start
 * after the first, and an edit to `Field.ts` re-bakes automatically instead of
 * quietly serving stale terrain.
 *
 * Preview is skipped because it serves `dist/`, which already has its own copy
 * of the cache from the build that produced it — so baking there does no work
 * the preview can see. It was also actively harmful: `pruneStaleCanvasBake`
 * would run *after* `build:full` had just recorded a painted-face cache, and
 * delete it on any hash disagreement.
 */
export function bakePlugin(): import('vite').Plugin {
  let done: Promise<void> | null = null;
  return {
    name: 'eos-bake',
    // `apply` is the supported way to say which commands a plugin runs in, and
    // it is cleaner than sniffing the resolved config: `isPreview` is not on
    // `ResolvedConfig` in vite 8. `preview` serves `dist/`, which already has
    // its own copy of the cache; see the note above for why baking there is not
    // merely wasted but harmful.
    apply: (_cfg, env) => !env.isPreview,
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
        // The browser-baked half cannot be produced here — it needs the server
        // that is starting — so the most this can do is make sure a stale one
        // is never served. Deleting it costs the boot time it was saving;
        // serving it costs fifteen faces that no longer match their sculpt,
        // with no symptom. `node src/tools/texbake.mts --canvas` puts it back.
        pruneStaleCanvasBake().then((pruned) => {
          if (pruned) console.warn('[texbake] dropped a stale painted-face cache — '
            + 're-bake it with `node src/tools/texbake.mts --canvas`');
        }).catch(() => {}),
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
