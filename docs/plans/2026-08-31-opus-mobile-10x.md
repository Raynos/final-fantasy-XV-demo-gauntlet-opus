# Mobile 10×: download, load and frame rate

Status: **APPROVED — all four rulings taken, building.**

> **Rulings (2026-08-31):**
> 1. **One build, two data sets.** No second bundle; a `baked/m/` of
>    image-encoded textures selected at runtime by the detection that exists.
> 2. **WebP q78 albedo, q92 normals.** Alpha preserved.
> 3. **Insomnia's skyline becomes a flat impostor** on the phone — keep the
>    silhouette, pay 1 draw instead of 18.
> 4. **The whole programme**, all five steps.

## Results so far — measured, deployed

| | before | now | note |
|---|---|---|---|
| **first frame** | 44.1 MB | **15.3 MB** | **2.9×** |
| `tex` + `texc` | 25.8 | **2.9** | WebP, 8.9× |
| `terrain` | 17.2 | **10.5** | half-splat |
| bundle | 1.1 | 1.1 | not yet split |
| draws | 540 | **249** | the `Sky` shadow bug, then range cuts |
| triangles | 6 400 667 | **2 525 636** | same |

**Two measurements changed the plan and are worth carrying forward.**

*WebP wins on textures by 12.3× overall* — better than the 7.5× the sample
predicted, because `texc`/`texcp` (painted faces, large flat regions) hit 56–58×.

*WebP LOSES on terrain.* Lossless over every section is **23.7 MB against
gzip's 17.2** — a delta-coded height's low byte is noise and an image codec has
nothing to find in it. Lossy q90 reaches 9.2 but moves the ground. Coarser
quantisation is also a dud: 9.85 mm → 4 cm buys only 5.59 → 4.48 MB against a
5 cm drift budget. So the terrain win came from halving `ctrl` (splat weights,
not geometry) instead: 8.34 → 2.17 MB, invisible to `heightcheck`.

**Where the remaining gap is.** `h` is 5.59 MB of irreducible lossless
heightfield at 2048², and `far` another 1.64. Best lossless predictor tried
(2D average + byte-split planes) gets `h` to 4.63 — 17%, not enough to justify
a container-format change and the geo re-bake it forces.

**So ~10 MB is the floor for a whole-world 4 km² heightfield shipped as one
file, and 10× on download needs the terrain streamed by clipmap tile rather
than fetched whole.** That is the honest next step and it is a real piece of
work, not a tweak.

---

The ask: **10× less to download, 10× faster to load, 10× the frame rate**, with
two builds and two URLs on the table if that is what it takes.

Short answer: **the download target is reachable and priced. The load target
follows from it. The frame-rate target is not literal — 10× of 30 fps is not a
thing — but the honest version of it, "a locked 30 that never drops and does
not cook the phone", is reachable and the levers are measured.**

And a recommendation up front: **do not build two bundles.** Split the *data*,
not the code. §6.1 says why.

---

## 1. Where we are, measured

`coldload --origin …/?demo=1` and `_probe/mobcost.mts` on the demo path:

| | value |
|---|---|
| to first frame | **44.1 MB** in 5 requests |
| deferred after first frame | 32.6 MB in 4 |
| first frame, live origin | 16.9 s (desktop, fast line) |
| draw calls | **269** |
| triangles | **2 704 563** |
| backing store | 0.55 Mpx (render scale 0.62) |
| frame cap | 30 |

The 44.1 MB, itemised:

| file | wire | raw | what |
|---|---|---|---|
| `tex.bin.gz` | 19.0 | 39.8 | 85 procedural textures — 82 props, 3 sky |
| `terrain.bin.gz` | 17.2 | 32.5 | 2048² heightfield + 2048² control + far grid |
| `texc.bin.gz` | 6.8 | 22.4 | the painted hero faces |
| `index.js` | 1.1 | 3.3 | the whole game |

---

## 2. The measurement the download plan rests on

`_probe/webpsize.mts` re-encodes the resident texture index through the
browser's **own** codecs — the same decoder a phone would use — over a
39-texture sample:

| encoding | size | ratio vs raw |
|---|---|---|
| raw RGBA8 | 5.77 MB | 1× |
| **gzip (what ships today)** | — | **~2.5×** |
| WebP lossless | 2.27 MB | 2.5× |
| **WebP q80** | **0.77 MB** | **7.5×** |
| JPEG q82 (no alpha) | 0.18 MB | 32× |

**gzip is close to the worst possible codec for this data.** It has no idea the
bytes are a picture. That single fact is where most of the 10× lives.

A worked example from the sample, `dgn/mineRock/map` at 512²: **1024 KB raw →
122 KB WebP q80 → 18 KB JPEG q82.**

---

## 3. Download: 44.1 MB → ~4.7 MB

### 3a. Textures as images, not as gzipped pixel planes — **the big one**

`tex` + `texc` are 25.8 MB of the 44.1. Encode per channel *semantics* rather
than one codec for everything, because the three kinds compress very
differently:

| kind | encoding | why |
|---|---|---|
| albedo / colour | WebP q78 | lossy is invisible at 256²–512² on a 390 px screen |
| roughness / AO / height | three single channels packed into one RGB WebP q80 | three maps become one file and one fetch |
| normal maps | 2-channel, z reconstructed in the shader, WebP q92 | the one kind lossy actually hurts; still ~6× |

Estimated: **`tex` 19.0 → ~2.5 MB, `texc` 6.8 → ~1.0 MB.**

Decode is `createImageBitmap`, which is off the main thread — so this is also
**less** main-thread work than the current gunzip-and-index path, not more.

### 3b. Half-resolution terrain on the phone

`terrain.bin.gz` is 17.2 MB and a `?q=low` page does not use the resolution it
is paying for: the clipmap draws from a 2048² field it never samples that
finely at 0.55 Mpx.

A 1024² `h` + 1024² `ctrl` is **4× less data**, and `ctrl` as a lossless WebP
rather than gzipped planes is another ~2×.

Estimated: **17.2 → ~2.0 MB.**

This is the one item that needs a genuine second bake artifact.

### 3c. The bundle

1.1 MB gz for a bundle that includes the dungeon kits, the city hub, fourteen
menu screens and the dev suite. Route-split the three the demo does not touch
in the first minute.

Estimated: **1.1 → ~0.6 MB.**

### Total

| | now | after |
|---|---|---|
| textures | 25.8 | 3.5 |
| terrain | 17.2 | 2.0 |
| bundle | 1.1 | 0.6 |
| **first frame** | **44.1** | **~6.1 MB** |

That is **7.2×**. To close the last stretch: drop the hero faces to 512² on the
phone (−0.4), and stream `ctrl` by clipmap ring rather than whole (−1.0).
**~4.7 MB, i.e. ~9.4×.** Call it 10×.

---

## 4. Load time follows, but not linearly

On LTE at ~8 Mbit effective, 44.1 MB is ~45 s of transfer alone. 4.7 MB is
~5 s. But the current 16.9 s to first frame is **not** all transfer — a good
chunk is `Game.init()` doing work.

So the plan has a second half: **`bootprof` the phone path and cut the top
three phases.** Two are already known to be avoidable on the demo:
`Props.poiPrebuild` (1172 ms building city compounds nobody is near) and
`Props.mega` (624 ms of Insomnia skyline). Neither is needed before the first
frame.

Estimate: **16.9 s → 4–6 s**, of which ~5 s is the download. Roughly 3×, and
transfer-bound after that — which is the right place to be.

---

## 5. Frame rate: what "10×" can honestly mean

10× of 30 fps is 300 fps. What is actually being asked is *"stop it stuttering
and stop it cooking"*, and that is a budget problem with three named costs.

**Already landed**, and worth stating because they are large:

- **Shadows were on at `?q=low` for the whole life of the project.**
  `Sky.init` set `shadowMap.enabled = true` unconditionally, after
  `Renderer._applyTier` had turned it off. Fixing one conditional:
  **540 → 269 draws, 6 400 667 → 2 704 563 triangles.**
- Render scale 0.62 — **38% of the pixels**.
- 30 fps cap — halves the duty cycle, which is the heat lever.
- TAA, bloom and CAS off on the demo — three full-screen passes.
- Vegetation and props to 0.55 of the low tier's own cut.

**What is left, in order of expected win:**

| lever | now | target | note |
|---|---|---|---|
| **draw calls** | 269 | **< 80** | mobile GL drivers cost ~0.05–0.1 ms per draw, so 269 draws is plausibly **13–27 ms of CPU per frame on its own** — very likely the actual bottleneck, ahead of pixels or triangles |
| triangles | 2.70 M | < 0.9 M | grass 0.73 M, one prop `Group` 0.92 M, clipmap 0.42 M, megastructures 0.25 M |
| clipmap rings | 7 | 4 | the outer rings are below a pixel at 0.55 Mpx |
| megastructures | 0.25 M / 18 objects | 0 on phone? | Insomnia's skyline, visible from everywhere — see §6.3 |

The draw-call number is the one to chase first, and it is the one I would want
to **instrument on a real handset before touching**, because "the CPU is the
bottleneck" is currently a plausible inference and not a measurement.

**Honest expectation:** a locked 30 with headroom, and a phone that stays cool.
Not 300 fps.

---

## 6. Three decisions

### 6.1 Two builds, or one build and two data sets?

**Recommendation: one build.** Everything above is a bake *variant* plus
runtime branches that already exist behind `demoActive()`. A second
`index.html` means a second bundle to keep in sync with 22 gates and every
future change, and the failure mode is silent drift — the mobile build quietly
rotting while the desktop one is the only thing anybody looks at. Splitting the
*artifacts* (a `baked/m/` of WebP textures and a half-res terrain) gets the
whole win with none of that.

### 6.2 How much texture quality are you willing to spend?

q78 albedo is invisible at these sizes on a phone and is most of the win. Going
further — JPEG-class ratios — means dropping alpha and would be visible on
foliage cutouts. **I would take q78 and stop.**

### 6.3 Does the phone keep Insomnia's skyline?

0.25 M triangles and 18 draws for a city on the horizon you cannot visit.
Cutting it is free frame rate. Keeping it is a real part of the world's sense
of scale, and scale was the thing you said was best about the demo. **Your
call, not mine.**

---

## 7. Order of work

1. **WebP texture pipeline** (§3a) — biggest download win, no gameplay risk.
2. **`bootprof` the phone path**, cut prebuild + mega (§4) — biggest load win.
3. **Instrument draw calls on a real handset**, then batch (§5).
4. **Half-res terrain variant** (§3b) — needs `heightcheck` and `driftcheck` to
   pass against a second artifact, so it goes last of the big ones.
5. **Bundle splitting** (§3c) — smallest win; do it while something else bakes.

Every step is independently shippable and independently measurable. Nothing
here needs to land as one piece.
