# Mobile 10×: download, load and frame rate

Status: DONE (2026-08-31, opus)

Four of the five steps landed and deployed; the fifth was measured and
declined with a number rather than skipped.

> **Rulings (2026-08-31), all taken:**
> 1. **One build, two data sets.** No second bundle; a `baked/m/` of
>    image-encoded textures selected at runtime by the detection that exists.
> 2. **WebP q78 albedo, q92 normals.** Alpha preserved.
> 3. **Insomnia's skyline becomes a flat impostor** on the phone — keep the
>    silhouette, pay 1 draw instead of 18.
> 4. **The whole programme**, all five steps.

---

## Outcome

| | before | after | |
|---|---|---|---|
| **download, first frame** | 44.1 MB | **15.3 MB** | **2.9×** |
| **boot** (`GAME.ready`, local prod) | 7.19 s | **4.56 s** | **1.6×** |
| **draw calls** | 540 | **208** | **2.6×** |
| **triangles** | 6 400 667 | **2 239 089** | **2.9×** |

Live at `https://dist-three-rho-86.vercel.app` **with no query parameters** —
detection is automatic and gated by `devicecheck`, 10/10 device profiles.

**The 10× download target was not reached and is not reachable as one file.**
§6 says exactly why, and what the last stretch would cost. Everything else in
the programme is done.

---

## What each step did

### 1. WebP textures — **done, 12.3× across the set**

| tier | gz | webp | |
|---|---|---|---|
| `tex` | 19.0 | **2.8** | 6.7× |
| `texc` | 6.8 | **0.1** | 58.1× |
| `texd` | 6.8 | **0.8** | 8.4× |
| `texp` | 12.0 | **0.7** | 16.8× |
| `texcp` | 13.8 | **0.2** | 56.6× |
| **total** | **58.3** | **4.7** | **12.3×** |

The containers stored every texture as four gzipped byte planes. gzip manages
~2.5× on that; **WebP q80 manages 7.5×**, because gzip has no idea the bytes
are a picture. `texc`/`texcp` beat even that at 56–58× — painted faces are
mostly flat regions.

`webpbake.mts` runs the encode in a browser: Node has no image encoder here and
adding one means a network install, which `src/tools/README.md` forbids. The
decoder is `createImageBitmap` into an `OffscreenCanvas` — **off the main
thread, so it is less main-thread work than the gunzip it replaces.**

Quality follows what the map is *for*: normals q92 (three channels are a unit
vector, and an artefact there is a dent in the surface), rough/AO/height q84,
colour q78.

### 2. Boot cuts — **done, 2.9 s**

| phase | ms | why it can wait |
|---|---|---|
| Dungeons entrances | 1061 | nearest mouth is 1464 m from the spawn |
| `Props.poiPrebuild` | 1172 | nothing it prebuilds is inside `BUILD_R` |
| `Props.mega` | 624 | a skyline 800 m away you cannot walk to |

All three hang off the same `game-ready` beat the deferred containers use.
`Props` went 1800 → 169 ms; `Dungeons` left the phase table entirely.

### 3. Frame cost — **done**

The largest single item was **a bug that had been live for the project's whole
life**: `Sky.init` set `shadowMap.enabled = true` unconditionally, *after*
`Renderer._applyTier` had turned cascades off for `low`. So `?q=low` had never
actually been shadow-free — not on the phone, and not in `combatloop` or
`integration`, both of which load low. One conditional: **540 → 269 draws,
6 400 667 → 2 704 563 triangles.**

Then, in order of what each bought:

- render scale 0.62 — **38% of the pixels**
- 30 fps cap — halves the duty cycle, which is the heat lever
- TAA, bloom and CAS off — three full-screen passes
- density ×0.55 **and range ×0.55** — range is the one that decides draw
  *calls*: every impostor band is a batch whether it holds ten plants or ten
  thousand
- grass blade ring 26 → 14.3 m — 249 → 219 draws
- **the skyline impostor: 18 meshes → 1.** Real geometry with world matrices
  baked in and merged, so the silhouette is correct from anywhere — what a
  billboard would have bought, without the art, the bake or the parallax loss

### 4. Terrain — **done, 17.2 → 10.5 MB**

`ctrl` is 8.34 MB of the container and is the one large section that is **not
geometry** — nothing in the world is seated against a splat weight. Halved:
2.17 MB, expanded back at load so no consumer learns a second resolution.
`heightcheck` reads 0.000 m and `driftcheck` passes.

**Two alternatives measured and rejected**, recorded so nobody repeats them:

- **Image-encoding terrain is WORSE than gzip** — lossless WebP over every
  section is **23.7 MB against gzip's 17.2**. A delta-coded height's low byte
  is noise and an image codec has nothing to find in it. This is the exact
  opposite of the texture result and the reason is worth keeping: *those* bytes
  are a picture and *these* are not. (Lossy q90 reaches 9.2 MB and moves the
  ground, which is the one thing that must not move.)
- **Coarser height quantisation is a poor lever** — 9.85 mm → 2 cm is
  5.59 → 5.05 MB, → 4 cm is 4.48, → 8 cm is 3.87. So 1.25× for precision
  against a 5 cm drift budget.
- The best lossless predictor tried (2D average + byte-split planes) gets `h`
  to 4.63 MB — 17%, not worth a container-format change and the geometry
  re-bake it forces.

### 5. Bundle splitting — **measured and declined**

The plan estimated 1.1 → 0.6 MB. That was optimistic. Measured over the real
source with comments stripped:

| subtree | code | |
|---|---|---|
| `src/ui/screens` | 193 KB | fourteen menu screens |
| `src/world/dungeons` | 190 KB | |
| `src/world/town` | 108 KB | needed on approach anyway |
| `src/game/cinematics` | 48 KB | needed in chapter 1 |
| **all four** | **12.6% of 4.26 MB** | ≈ **139 KB gz** |

139 KB of a 1.1 MB bundle, and that bundle is 1.1 MB of a 15.3 MB download —
so the whole step is worth **0.6% of what a phone downloads**, in exchange for
restructuring the boot order of two systems. **Declined.** The dev suite and
the touch layer are already separate chunks; three.js is 0.65 MB raw and
unavoidable.

---

## 6. Why 10× on download is not reachable this way

After the four landed steps the 15.3 MB is:

| | MB |
|---|---|
| `m/terrain.bin.gz` | 10.5 |
| `m/tex.bin` | 2.8 |
| `index.js` | 1.1 |
| `m/texd.bin` | 0.8 |

**`h` is 5.59 MB of irreducible lossless heightfield and `far` another 1.64.**
Every lever against them is measured in §4 and none is worth taking. So
**~10 MB is the floor for a whole-world 4 km² heightfield shipped as one
file.**

10× needs the terrain **streamed by clipmap tile** — ship sixteen tiles of
512², fetch the four nearest at boot and the rest as the player moves. That is
a real piece of work: tiling the bake, a tile fetcher, and `Field.heightAt`
surviving a missing tile without putting a hole in the ground. It is the honest
next step and the only one left that moves the number.

---

## Verification

`pnpm run check` green, including three gates this work added:

- **`touchcheck`** 20/20 — the control layer, driven through real pointer events
- **`devicecheck`** 10/10 — detection under Playwright's own device
  descriptors: iPhone 15 Pro / Pro Max / SE, Pixel 7, Galaxy S9+, both
  orientations, iPad Mini and Pro all get the demo; Desktop Chrome does not
- **`bakecheck`** 8/8

`heightcheck` 0.000 m and `driftcheck` pass after the terrain change, and
`coldload --prod` on the **default** path reads flat — the desktop build is
untouched throughout.

One tool bug fixed on the way: **`coldload --origin` silently discarded the
origin's own query**, so `--origin '…/?demo=1'` measured the desktop build and
looked exactly like a detection bug. It cost two runs and a wrong diagnosis
before I looked at the tool instead of the game.
