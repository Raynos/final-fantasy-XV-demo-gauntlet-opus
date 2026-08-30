# Lane 13 — Memory and boot

Plan: `docs/plans/2026-08-30-fable-to-nine.md` tasks 38–41.
Owns `src/engine/` except `postfx/`, plus the veg/props boot caches.
Started 2026-08-30 from `7da60d5`.

## The exit number, and what it actually means (VERIFIED)

The plan says "tab 1 246 MB". `project/archive/handoff/memory-cut.md:10` is
where that came from and it labels the row **"the tab (renderer)"** — it is
the `--type=renderer` RSS row of `bootprof --mem --play --prod`, **not** the
whole-tree browser total. Do not compare it against the 2 GB summary line.

Baseline taken 2026-08-30 on `sha:096d739bca9a` (`--wait` reported *quiet* at
the start and **CONTENDED by the end**, so treat as ±):

    play (a person), prod
      browser tree RSS        2341.9 MB   (memory-cut recorded 2226)
      renderer  <- THE TAB    1382   MB   (memory-cut recorded 1246)
      gpu-process             786    MB   (footprint 2200)
      physical footprint      3232.8 MB
      JS heap (perf.memory)   633.6 MB    [CDP getHeapUsage 138.4 MB]
        CPU texel arrays       39.2 MB over 62 DataTextures
        geometry attributes   241.1 MB + 43.5 MB index, 819 geometries
        everything else       309.8 MB
      after forced GC         heap 80.5 MB, RSS -58.6 MB only
      GPU-side estimate       713.5 MB
        scene textures        205.9 MB / 265
        render targets        181.1 MB / 33     <- LANE 15's task 45, not mine
        shadow maps            41.9 MB / 2
        vertex + index        284.6 MB
      three.js 609 geometries, 377 textures, 154 programs

So the target is **renderer 1382 -> under 800 MB**, i.e. -582 MB. The
whole-tree number is 116 MB above what memory-cut recorded; the renderer is
136 MB above. Both suggest a regression since that lane, or a colder bake.

The two heap oracles disagree by 4.6x. Per the probe's own note, a typed
array's backing store is EXTERNAL to the V8 heap, so `Runtime.getHeapUsage`
(138 MB) legitimately cannot see the 284 MB of geometry arrays and
`performance.memory` (634 MB) can. Neither is "the liar" here — they measure
different sets. Use the renderer RSS row.

## Status

- Baseline: **done, verified** (above).
- Tasks 38–41: in progress.

## Files touched outside `src/engine/`

(none yet)

## FOR LANE 1

(nothing yet)

## Landed

### Task 38 — `skinWeight` -> Uint8. **Done, verified, and NOT in `Geo.ts`.**

`792e998`. It landed in `src/engine/AttrPack.ts` instead of the generators.
`packGeometry` grew a `RULES` table and now packs `skinWeight` (Uint8
normalised, glTF's own format), `aMat`, `aTan`, `aGroom` and `aClip` alongside
`color` and `normal`. Same memory result, one file, and lane 1 never has to
stop working in `characters/rig/Geo.ts`.

`skinWeight` needed one thing the others did not: four weights are a partition
of 1 and the skinning shader divides by nothing, so independent rounding can
leave a tuple summing to 253/255 and shrink the vertex toward the model origin.
`partitionsOne()` refuses any rig not already summing to 1 (or 0);
`renormalize()` puts the residual on the largest component.

### Task 39 — `AttrPack` for the streamed POI sites. **Done.**

`0fb3087`, own commit, explicit pathspec `-- src/world/Props.ts`, as the plan
requires. `Props.update` packs each site the frame `PoiKits` finishes it: at
most one site is built per frame, so the loop runs at most once and each site
is scanned exactly once ever.

### Measured effect (VERIFIED, `src/tools/_probe/packaudit.mts`)

Float32 attribute bytes across the same 548 geometries:

    total          204.6 -> 168.9 MB    (-35.7 MB CPU, and the same again
    skinWeight:4    20.4 ->   3.9 MB     on the GPU copy: ~71 MB of the
    aMat:3           9.5 ->   2.9 MB     two together)
    aTan:3           9.5 ->   2.9 MB
    aGroom:3         4.7 ->   0.6 MB
    aClip:2          2.1 ->   0.0 MB

Task 38's own estimate was ~15 MB; `skinWeight` alone came in at 16.5 MB CPU.

### Looked at it (VERIFIED)

`0fb3087` against `792e998~1` — a clean two-commit window, mine only. PNG,
`imgdiff`, five shots, every one **under its per-shot floor**:

    hero_full        2.037 / floor 2.25
    town_wide        0.329 / floor 2.00
    zone_lestallum   0.182 / floor 2.00
    poi_reststop     0.077 / floor 2.00
    vista_dawn       0.096 / floor 2.00

`hero_full` is the one that carries `skinWeight`, `aGroom` and `aTan`, so it is
the shot that would catch a renormalisation bug. Its heat map is diffuse
ground-texture noise across the whole terrain with only faint sub-pixel
outlines on the four characters — no concentrated hot spot on any limb, which
is what a shrink would look like. Read the frame itself: all four party members
intact, hair, hands, sword and cloth all correctly shaped. `town_wide`:
Hammerhead complete — canopy, both buildings, signage, poles, road — so no
merge returned null.

### The exit instrument, before and after (`bootprof --mem --play --prod`)

`--build 792e998~1` then `--build 0fb3087`, back to back, both arms with
`geo.bin.gz` and `texc.bin.gz` **absent** (other lanes' commits pruned them
mid-session — absent on both sides is a controlled variable, which is
`memory-cut.md`'s own advice). Two browser launches per arm.

    row                       before          after
    geometry attributes       241.1 MB   ->   213.5 MB    -27.6 MB   EXACT
    vertex + index (GPU)      284.6 MB   ->   257.0 MB    -27.6 MB   EXACT
    renderer RSS (the tab)    1225/1213  ->   1295/1286   +70 MB
    RSS after a forced GC     2149/2150  ->   2123/2092   -27..-58 MB

**Both arms printed `CONTENDED throughout`** — seven lanes were capturing. The
two attribute rows are deterministic and are the real result; the RSS rows are
soft.

**The renderer row went UP, and that is not a leak.** `packSubtree` allocates
the packed array and orphans the Float32 one, so the pass now creates ~28 MB of
garbage in one go at the end of boot: "was garbage" went 63.6/35.4 -> 90.9/94.0
MB and "returned to the OS" went 39.6/25.1 -> 105.3/142.2 MB in the same runs.
The post-GC total, which `memory-cut.md` says to prefer, moved the right way.

## The exit is not reachable from tasks 38-41, and here is the arithmetic

Renderer 1382 MB baseline (all four caches warm) against a target of 800.
Everything tasks 38-41 name, added up, is ~15 MB of memory plus ~730 ms of
boot. The measured map of the tab, biggest first:

    ~750 MB  "unattributed" -- process overhead, shader binaries, and pages
             the allocator has not returned. NOT yet named. See below.
     285 MB  geometry attributes CPU + the same again GPU-side (mine; -27.6)
     206 MB  scene textures over 265
     181 MB  render targets over 33          <- LANE 15 task 45, not mine
     138 MB  V8 heap (CDP; `performance.memory` is frozen, see below)
      42 MB  shadow maps
      39 MB  CPU texel arrays still held after upload

`performance.memory` is FROZEN on this build and lies: `memowners.mts`'s own
oracle control allocated 200 MB of `Float32Array` and `usedJSHeapSize` moved
**0.0 MB**, sitting at 894 MB. Every "JS heap used" line `bootprof --mem`
prints is that number. The CDP `Runtime.getHeapUsage` figure beside it (138 MB)
is the true V8 heap; the geometry arrays are external to it and are counted
separately above.

### The largest unclaimed lever I found: the bake path costs ~270 MB of tab

`?nobake=1` boots the same world, bit-identical content, and the renderer is
**1115 MB against 1382** -- and `unattributed` is 477 MB against 749. The two
arms were three commits apart, so treat 267 MB as an order of magnitude rather
than a figure.

**It is not the containers.** `src/tools/_probe/bakeresident.mts` (new) asks
both modules from inside the page: `GeoBake` has released its 165 MB body
(`store === null`) and `TexBake` is compacted to 7.1 MB. The 2026-08-25
landmine is genuinely fixed. What is left is the **peak transient**: every
loader does `new Uint8Array(await new Response(body).arrayBuffer())` over a
`DecompressionStream`, which accumulates chunks and then copies them into one
contiguous buffer -- roughly 2x the inflated size, for 165 MB (geo) + 67.3
(tex) + 67.1 (texc) + the heightfield. Each `.json` sidecar could carry the
inflated length, which would let the reader fill one pre-sized `Uint8Array` and
halve the peak. **Untried** -- filed, not done, because it is two of lane 14's
named files and because `geo.bin.gz`/`texc.bin.gz` were pruned out from under
the measurement twice tonight by other lanes' commits.

## Task 40 — Census the towns. **Done (census). The cut is residue, not mine to make.**

`a33ce01` adds `src/tools/_probe/towncensus.mts`. Run it and it prints every
built site by merged material. The eight prebuilt sites:

    ALL 8 built sites: 3 668 762 verts, 101.6 MB, 1 629 304 tris
      buried 29 198 (1.8%)   downward 433 684 (26.6%)

    site                  geos    verts     MB    tris   buried  downward  sealed-under
    lestallum   (town)      19  1333678   36.8  520508     0.6%     25.9%    35528  6.8%
    galdin_quay (town)      19  1274326   35.1  495180     0.6%     26.0%    30908  6.2%
    formouth  (imperial)    15   181820    5.2  101016     4.9%     27.5%    20078 19.9%
    norduscaen(imperial)    15   179492    5.1  109384     3.6%     28.0%    22880 20.9%
    fort_vaullerey          14   176516    5.0   97232     4.8%     27.4%    18818 19.4%
    aracheole (imperial)    13   175910    5.0  104904     3.6%     27.9%    21440 20.4%
    perpetouss(imperial)    13   174194    4.9  101792     3.1%     27.8%    20444 20.1%
    tollhends (imperial)    15   172826    4.5   99288     2.7%     27.7%    19776 19.9%

Three findings, in order of size:

1. **Half of each town is its shadow proxy.** `lestallum/town_shadow` is
   666 839 verts and 11.1 MB of the town's 1 333 678 and 36.8;
   `galdin_quay/town_shadow` is 637 163 and 10.6 of 1 274 326 and 35.1. The two
   proxies are **1.30 M of the 2.61 M town vertices and 21.7 MB**, and they are
   the largest geometries in the world after `meteor_mega_stone`.
2. **The proxies carry `[position:Float32]` and nothing else** — verified in
   the census output, every `*_shadow` row. So there is no attribute to strip;
   the only lever on them is fewer triangles. A shadow map at cascade
   resolution does not resolve a 260 k-triangle silhouette, so a decimated
   proxy is the obvious cut and it is worth ~16 MB across the two towns.
3. **`buried` is small and `downward` is a trap.** 1.8% is genuinely below the
   ground plane. 26.6% faces down, but Hammerhead's canopy soffit, every
   balcony underside and every arcade ceiling is in that number. The defensible
   subset is `sealed-under`: down-facing with its highest vertex under
   base + 2.0 m. That is 6–7% in the towns and ~20% in the six imperial camps,
   ~190 k triangles over the eight sites, and it is where a bottom-face cull in
   the kit's box lofts would pay.

All three land in `src/world/props/PoiKits.ts`, which lanes 18 and 19 own. Not
touched. Written out as residue in the report.

## Task 41 — Boot caches. **Two refuted, one blocked. Nothing landed.**

### `Props.landmarks` -> `bakedParts` (~46 ms): **refuted, do not attempt as written**

`project/TASKS.md` calls this "a five-line addition, skipped for want of time"
and "the cheapest open boot item in the repo". It is neither. `bakedParts`
serves geometry and **does not run `fill` on a hit** — and `Landmarks.build`'s
per-site loop is not only geometry. Inside it, `_haven` alone also does
`this.runeMesh = runeMesh` (Landmarks.ts:220), `this.flames = flames` (:270),
`this.lights.push({ light: fire, kind: 'fire', base: 130 })` (:323), a second
fire glow (:329), a lantern per site (:361) and `this.havenTop = top` (:433).
On a cache hit every one of those is skipped: **every haven loses its fire, its
flame group and its lights after dark**, and `Landmarks.update` (:730) would
read a `this.flames` that was never assigned. Making it cacheable means
splitting placement from lofting across `Landmarks.ts`, which is a refactor,
not five lines. Filed with this reason.

### `Rocks`' two rootless `TileStream`s (~78 ms) and `Vegetation.prime` (610 ms): one mechanism, and it is blocked

These are the same problem and want the same new thing, which nobody has built:
a cache for **a `TileStream`'s primed-at-origin state** — the per-tile instance
matrices plus the streamer's tile bookkeeping — not for geometry, which is why
`bakedParts`/`bakedGeo` do not fit either of them. `Rocks.build` ends with
`this.stream.flush(o); this.outcrops.flush(o); this.update(o)` (Rocks.ts:2649)
and `Vegetation.init` ends with three `bootPhase('Vegetation.prime.*')` calls
(Vegetation.ts:69-72). One container shape serves both, ~690 ms of a ~6 s boot.

**Blocked on ownership, not on difficulty.** The restore side has to live in
`GrassField`, `Bushes` and `Trees` — all in `src/world/veg/`, which is lane 3's
tree and lane 3 is live in it tonight. Not started rather than half-started.

**Do not "just delete the prime" instead.** `project/LANDMINES.md` has it as a
measured negative: `hero_full` moves **13.359/255** against a floor of 2.25,
31.7% of pixels over 8/255, because `converge()` is not sixty budgeted updates.
Caching the *result* is a different idea and is still untried.

## Second AttrPack commit — half precision for over-bright colour (`4d16821`)

`packaudit.mts` now prints each attribute's measured span, and that is what
unlocked this: colour spans **[0.02, 1.68]** across the whole world, so the
29.3 MB `packGeometry` was refusing is over-bright by 1.68x, not by orders of
magnitude. A `Rule` grew a `wide: 'f16'` fallback; colour takes it, `uv` does
not, because uv spans **[-17.84, 35.04]** and half precision is a *relative*
format — at 35 the absolute error is 0.016, sixteen texels on a 1024 map.

    Float32 attribute bytes:  204.6 -> 168.9 -> 139.6 MB
    net saving so far:        -50.4 MB CPU and the same again GPU-side

`halfSafe()` refuses any array with a NaN or a magnitude past 65 504:
`DataUtils.toHalfFloat` clamps to `Infinity` rather than throwing, and one
infinity is one vertex painted white for the session.

## Residue, ready to paste into `project/TASKS.md`

    - **Half of each town is its shadow proxy, and it carries position only.**
      `lestallum/town_shadow` 666 839 verts / 11.1 MB and
      `galdin_quay/town_shadow` 637 163 / 10.6 are 1.30 M of the towns' 2.61 M
      vertices. Verified `[position:Float32]`, so there is nothing to strip;
      decimating a proxy a shadow cascade cannot resolve is worth ~16 MB.
      `PoiKits.ts`, lanes 18/19. `src/tools/_probe/towncensus.mts`. `lane13`
    - **~190 k of 1.63 M town triangles are sealed under 2 m and face down** —
      6-7% in the two towns, ~20% in the six imperial camps. The bottom faces
      of the kit's closed box lofts. NOT the same as the blunt 26.6%
      downward-facing figure, which includes canopy soffits. `lane13`
    - **The bake path costs ~270 MB of tab RSS and the containers are not the
      reason** — `GeoBake` releases its body, `TexBake` compacts to 7.1 MB
      (`_probe/bakeresident.mts`). What is left is peak transient: every loader
      does `new Uint8Array(await new Response(body).arrayBuffer())` over a
      `DecompressionStream`, ~2x the inflated size, for 165 + 67.3 + 67.1 MB
      plus the heightfield. Put the inflated length in each `.json` sidecar and
      fill one pre-sized buffer. `GeoBake.ts`/`TexBake.ts`, lane 14. `lane13`
    - **`position` is 78.6 MB, 71.1 of it inside Int16**, but a normalised
      integer position needs a per-geometry scale and offset pushed onto the
      mesh, and these geometries are merged, shared and read back by collision.
      Its own change, its own risk. `AttrPack.ts`. `lane13`
    - **`uv` is 30.2 MB and has no safe cheaper format** — span [-17.84, 35.04]
      rules out both normalised integers and half precision. Would need a
      per-geometry uv scale. `lane13`
    - **`Props.landmarks` -> `bakedParts` is NOT a five-line addition** and the
      TASKS line saying so is wrong: `bakedParts` skips `fill` on a hit, and
      `Landmarks.build`'s loop also assigns `runeMesh`, `flames`, `havenTop`
      and pushes every haven fire and lantern into `this.lights`. A hit would
      ship havens with no fire and no light after dark. `lane13`
    - **A `TileStream` primed-at-origin cache is one mechanism serving two
      items** — `Rocks` (~78 ms, two rootless streams) and `Vegetation.prime`
      (610 ms). Not geometry, so `bakedGeo` does not fit: it wants the instance
      matrices plus the streamer's tile bookkeeping. Restore side lands in
      `src/world/veg/`. `lane13`

### Looked at the colour change too (VERIFIED)

`4d16821` against `4d16821~1`, PNG, eight shots chosen to cover vertex colour
everywhere it does work — towns, vegetation, terrain, characters, water. Every
one under its per-shot floor:

    hero_full        0.310 / 2.25      zone_galdin       0.334 / 2.00
    town_wide        0.334 / 2.00      party_formation   0.344 / 2.85
    zone_lestallum   0.223 / 2.00      zone_nebulawood   0.498 / 0.74
    poi_reststop     0.095 / 2.00      vista_dawn        0.178 / 2.00

Read `zone_lestallum`: the town sits complete on the plain, warm stone against
the green, no missing merge and no colour banding on the long terrain gradient.
Read `zone_nebulawood`, the tightest ratio to its floor: canopy, the faceted
rock mass and its crack texture, the haven ring and the shore foam all
unchanged. **No white vertices anywhere** — an `Infinity` out of
`toHalfFloat` is what `halfSafe()` exists to prevent and it is what these two
frames were read for.

## FOR LANE 1

**Nothing is required of you.** Task 38 (`skinWeight` Float32x4 -> Uint8) is
banked and `src/characters/rig/Geo.ts` was never touched. It landed in
`src/engine/AttrPack.ts` (`792e998`) as an end-of-boot re-pack instead, which
gets the same 16.5 MB without two lanes editing one file on a shared trunk.
Nothing in `rig/` needs to change and nothing in `rig/` is blocked by me.

If, later, somebody wants the *peak-allocation* win as well — the re-pack still
lets the Float32 arrays exist during boot and then orphans them, which showed
up as ~28 MB of extra garbage in `bootprof`'s "was garbage" row — the
source-level change is this, and it is four files, not one:

    src/characters/rig/Geo.ts:250
    -   geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    +   const sw8 = new Uint8Array(this.sw.length);
    +   for (let i = 0; i < this.sw.length; i += 4) {
    +     let s = 0, big = 0;
    +     for (let k = 0; k < 4; k++) { sw8[i + k] = Math.round(this.sw[i + k] * 255); s += sw8[i + k]; if (sw8[i + k] > sw8[i + big]) big = k; }
    +     if (s !== 0 && s !== 255) sw8[i + big] += 255 - s;   // see AttrPack.renormalize
    +   }
    +   geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw8, 4, true));

    src/characters/rig/Geo.ts:316    ['skinWeight', 4, Float32Array] -> Uint8Array
    src/characters/rig/Sculpt.ts:512 the same row
    src/characters/enemies/RigBuilder.ts:85,118,170  the same three constructions

`npc/NpcShadow.ts:71-76` needs no change: it `clone()`s the attribute, which
carries the format. `engine/postfx/VelocityPass.ts:156` needs no change either
— its four-vertex proxy has its own geometry, and the `normalized` flag is
per-attribute, not per-scene.

It is filed, not recommended: the memory is already banked and every one of
those four files belongs to a different lane.

## The biggest lever nobody has recorded: 213.5 MB of CPU geometry is disposable

`bootprof --mem` prints `geometry attributes 213.5 MB + 43.5 MB index (NOT
disposable)`. That parenthesis is an assumption, not a measurement. Every one
of those arrays is resident **twice** — once as a JS typed array in the
renderer and once as a GL buffer in the gpu process — and three.js has the hook
to drop the first: `BufferAttribute.onUpload(fn)`, which fires after the buffer
reaches the GPU and lets the callback null the array.

It is the single largest named item left in the tab, roughly a sixth of it, and
it is not something to land at 2 a.m. on a contended box, because what breaks
is *invisible in a posed shot*: anything that reads a geometry back after boot
— collision, raycast interaction, a later merge, a `needsUpdate` re-upload —
gets a null array and throws the first time a player walks into it.

**The safe subset is the shadow proxies**, and the census proved the property
that makes them safe: every `*_shadow` row is `[position:Float32]`, they are
depth-only, nothing raycasts them and nothing merges them again. That is
`lestallum/town_shadow` 11.1 MB + `galdin_quay/town_shadow` 10.6 + six imperial
proxies at ~1.7 each ~= **32 MB** with a one-line safety argument. Filed.

    - **213.5 MB of CPU-side geometry is disposable and `bootprof` says it is
      not.** Every attribute is resident twice, and `BufferAttribute.onUpload`
      lets the JS array go once the GL buffer exists. The whole 213 MB is the
      biggest single item left in the tab; the SAFE subset is the shadow
      proxies, which the census proved are `[position:Float32]`, depth-only,
      never raycast and never re-merged — ~32 MB with a one-line safety
      argument. What breaks otherwise is invisible in a posed shot: a
      collision, raycast or re-merge readback gets a null array. `lane13`

## The whole lane, on the exit instrument

`bootprof --mem --play --prod`, `--build 792e998~1` (lane start) against
`--build 4d16821` (everything I landed). `geo.bin.gz`/`texc.bin.gz` absent on
every arm — other lanes' commits pruned them and kept pruning them, so absent
throughout is the controlled variable. **Every arm printed `CONTENDED
throughout`**; seven lanes were capturing all night.

    geometry attributes (CPU)   241.1  ->  199.0 MB    -42.1   deterministic
    vertex + index (GPU copy)   284.6  ->  242.5 MB    -42.1   deterministic
                                                     ------
                                                      -84.2 MB across both

    renderer RSS "the tab"   1225/1213 -> 1211/1280    within the noise band
    RSS after a forced GC    2149/2150 -> 2139/2136    -12 MB, also noise

**The two attribute rows are the result.** They are computed from the actual
`BufferAttribute` byte lengths, so they are exact and repeat. The RSS rows on a
box with seven other lanes on it do not: the same build measured twice in one
run came back 1211 and 1280 MB, a 69 MB spread between two browser launches
five minutes apart, which is larger than most of what a lane can cut.

### Task 39 verified end to end (this needed a trick)

A plain probe reported `_poiPacked: 0` and I nearly filed the mechanism as
untested. **The harness page is paused after settle** — `Game.frame` is
`if (!this.paused) for (const s of this.systems) ... s.update(...)` — so
`Props.update` never runs on it and `_camPos` sits at [0,0,0] no matter how
many `requestAnimationFrame`s you wait for. Stepping `g.frame(1/60)` 240 times
by hand (and putting `paused` back):

    before  { packed: 0,  built: 8  }
    after   { packed: 26, built: 26, seen: 68, packed: 14, refused: 0,
              saved: 1 402 920 }

18 sites streamed in without the camera moving at all, every one of them was
packed the frame it was built, and 1.40 MB came back from those 18 alone. Note
`refused: 0` — with the half-precision fallback in `4d16821` nothing is
refused any more.

## Status at stop

Landed and verified: **38** (in `AttrPack`, not `Geo.ts`), **39**, **40** (the
census; the cut is another lane's file), plus one item the plan did not have —
half precision for over-bright colour, which is larger than task 38.
**41 is not done**: one item refuted with its reason, two blocked on lane 3's
live tree, none half-started.

Every commit passed the `pre-commit` gate (build + both typechecks + 4 cheap
gates). A full `pnpm run check` was queued behind seven lanes' captures and had
not returned at stop — **whoever picks this up should run it first**.

Commits: `792e998` `0fb3087` `a33ce01` `4d16821` `5315b53` plus the handoff.
Files touched outside `src/engine/`: `src/world/Props.ts` (the plan's named
cross-lane one-liner, its own commit) and three new files under
`src/tools/_probe/`. Nothing in `src/characters/`, nothing in `src/world/veg/`,
nothing in `PoiKits.ts`.

### Next step, exactly

1. `pnpm run check`, then `node src/tools/texbake.mts --geo --force` and
   `--canvas --force` once the tree settles — both artifacts have been missing
   for hours and every boot and memory number tonight was taken without them.
2. Re-run `bootprof --mem --play --prod` on a genuinely quiet tree. Nothing
   measured tonight is a baseline; the same build read 1211 and 1280 MB five
   minutes apart.
3. The three levers in the residue block above, biggest first: the disposable
   CPU geometry (~213 MB, ~32 safe), the bake path's peak transient (~270 MB)
   and the town shadow proxies (~16 MB).
