# Lane 20 — The Meteor (plan item 28): the Disc as a glowing wound

Status: **in progress**. Started 2026-08-31.

Direction, chosen by the human and not open: **exposed molten-blue crystal
fissures in the crater, visible from the highway at night**, pairing with the
`lest_overlook_disc` judged shot.

---

## FOR LANE 21 — the framing for `lest_overlook_disc`, now measured

**Superseded twice. This version is from `probes/discview.mts`, which sweeps 24
bearings at five ranges plus the named road nodes and reports how much of the
mass cluster clears the terrain skyline from each. Numbers below are its
output.** The two stands I first named are blind and I photographed both to
find out — `tmp/l20/base-lest_night-on.jpg` (Lestallum lookout: a foreground
boulder and the dreadnought, no Meteor at all) and
`tmp/l20/base-spur_night-on.jpg` (the `n_disc` spur at eye height: the inside of
a rim block, because 824 m puts it *on* the 790–1060 m rim ring).

The cluster runs **foot −324 m, waist +80 m, crown +829 m** in world y, and the
terrain's own crater rim is at +173 m.

**Measured stands, `frac` = fraction of the cluster's height clearing the
skyline:**

| stand | at | eye y | range | frac | sees |
|---|---|---|---|---|---|
| **WNW ridge, bearing 150** | (-3618, -660) | 211 | 3000 | **0.50** | crown |
| Lestallum shelf | (-3060, -680) | ~134 | 2520 | 0.46 | crown |
| Lestallum lookout | (-2880, -760) | ~121 | 2328 | 0.42 | crown |
| south-west, bearing 180 | (-3420, -2160) | 126 | 2400 | 0.43 | crown |
| `zone_mencemoor` stand | (400, -1200) | 92 | 1714 | 0.28 | crown |
| `landmark_meteor` stand | (-1020, -3560) | 150 | 1400 | **0.09** | crown |
| **`n_disc` spur, 40 m up** | (-1220, -1360) | ~300 | 825 | **0.82** | crown, waist **and rim** |

Two things fall out of that table and both matter to you:

1. **`landmark_meteor` sees 9% of its own subject.** A foreground ridge eats
   everything below the crown. That is not a defect this lane can fix from
   inside the meteor group, and it is most of why the shot does not read as a
   meteorite — you cannot see the crater from it, at any time of day.
2. **Exactly one stand in the entire sweep sees the crater rim: the Disc
   overlook off the Cauthess highway, from about 40 m above the parking.** It is
   the only place in the world from which this landmark reads as an *impact*
   rather than as a rock, and it is on the highway, which is where the human's
   direction says the wound should be visible from.

### What I would pose

- **First choice, `lest_overlook_disc`:** `pos [-3618, 214, -660]`,
  `target [-1020, 340, -2160]`, **fov 39**, **time 21.2**, clear. Best `frac` in
  the sweep, high ground, and the Disc's west face — local −X in the meteor
  group's frame — square to camera.
- **If you want the Lestallum name to be literal**, the shelf at
  `pos [-3060, 142, -680]`, `target [-1020, 340, -2160]`, **fov 34**, time 21.2
  is only 0.04 worse and is actually on the shelf.
- **The shot I would fight for, if the corpus has room:** the Disc overlook,
  `pos [-1220, 300, -1360]`, `target [-1020, 200, -2160]`, **fov 55**, time
  21.2. It is the only framing that contains a crater. Two of this lane's six
  radial ground fissures are laid on the rim's own breaches at 1.9 and 4.6
  radians so that a stand looking in through a gap sees a crack leaving the
  crater rather than a wall.
- **Night, 21.0–21.6, on whichever you take.** `landmark_meteor` runs t 17.6 and
  `Props._night` returns **0** there; `zone_mencemoor` is 0 too. Both existing
  judged Disc shots are dusk shots, so this is the corpus's only night read of
  the human's direction.

Captures of all of these are in `tmp/shots/l20-night/`. Message the coordinator
if you want a face re-aimed; I would rather re-author the art than have the shot
fight it.

---

## The recorded story (why this lane is unusual)

`landmark_meteor` is judged, and the blind critic's verdict is that it **does
not read as a meteorite**. Three closed negatives precede this work and all
three failed the same way — the glow existed and nothing could see it:

1. `tintNorm` on the rock field (b921642, reverted): a uniform ×1.115 albedo
   lift wearing a normalisation's name.
2. Fissure glow ×40 (`probes/meteorglow.mts`, 3eef135): **not one lit pixel**.
   Cause is geometric — `_meteorParts` placed the 22 glow slabs at the
   *midpoint* of two mass centres, and with masses r 165–300 m at centres
   300–360 m apart every midpoint is inside both bodies.
3. Vertex-seated slab placement, built and reverted: still invisible at ×40.

**Do not re-run 1 or 2.** Brightness is not the variable.

## What I have verified by eye

- **Baseline `landmark_meteor` (`tmp/shots/l20-base/landmark_meteor.jpg`,
  read).** The Disc is a rounded blue-grey dome with a spiky crest, occupying
  the top third of the frame, **and a foreground ridge occludes everything
  below its crown** — no crater, no rim, no apron, no glow anywhere. This is
  the single most important fact for the lane: from the judged shot, *only the
  upper masses are visible*, so anything authored on the crater floor cannot
  help `landmark_meteor` and must be justified by the spur and Lestallum
  stands instead.

## Instrument

`src/tools/probes/discglow.mts` — the lane's own arbiter. Per stand it reports
containment (element sealed inside the rock), occlusion (eye→element ray
marched against a 12 m min/max height grid built from the merged stone mesh AND
against `Terrain.heightAt`), and photographs the frame twice off one boot with
the emissive zeroed and then as authored, so the lit-pixel count comes out of a
diff through the real post chain. No `Raycaster`: a probe is a function body in
a page with no bare-specifier map, so `import('three')` throws — borrow
constructors off live objects.

Stands: `landmark_meteor`, `zone_mencemoor`, the highway spur at `n_disc`
(-1220,-1360) at night and at dusk, and the Lestallum lookout at night. The
last three are injected via `SHOTS.__probe`, the `framecam.mts` trick, so this
lane never touches `Shots.ts`.

## Next step

Author the two layers, capture, read, iterate.

## Files owned / touched

- `src/world/props/Megastructures.ts` — `_meteorParts`, `megaMaterials`.
- `src/tools/probes/discglow.mts` — new, this lane's instrument.

**`Megastructures.ts` is in `GEO_SOURCES`: editing it deletes `geo.bin.gz` for
every lane until `node src/tools/texbake.mts --geo` is re-run.** Announced to
the coordinator.

---

## Measured, 2026-08-31 (all with `probes/discglow.mts`)

**The closed negative, reproduced.** On the tree as I found it: **19 of the 22
emissive slabs sealed inside the rock, the other 3 behind terrain, `visible = 0`
from all five stands** (`landmark_meteor`, `zone_mencemoor`, the highway spur by
day and by night, the Lestallum lookout). That is the entombment as a number
rather than a quotation. **verified.**

**Night is not where the corpus thinks it is.** `landmark_meteor` runs t 17.6 and
`Props._night` returns **0** there. `zone_mencemoor` is **0** too. Both judged
Disc shots are dusk shots. **verified.**

**`prep()` was deleting the vein attribute.** `PartBuilder.KEEP` is a delete
list and `aEmissive` was not on it, so the stamp was stripped at `B.add`, before
the merge, silently — the material declaring the attribute, the shader reading
it, and the geometry that reached the GPU never having had it. It would have
read back as "the veins are too dim" for as many rounds as anyone was willing to
raise the radiance. One name added (`09202c6`), cross-lane, reported.
**verified.**

**Half this landmark has been underground since it was built.** Sampling each
meteor mesh's vertices and subtracting `Terrain.heightAt`: the apron-and-rim
mesh has a **median of −70 m**, the ground fissures **−79 m**. `ground()`
returns a *relative* height, the group origin is sunk 90 m on purpose, and every
apron shard and rim block was placed at `ground() + a small lift` — which
composes to `seatY(here) − 90 + lift`. Right for a 585 m mass, total burial for
a 30–96 m shard or a 52–155 m rim block. **This is why no capture in this
project has ever shown a crater rim, and a crater with no rim is a hill.**
Fixed in `bf0b78a` with absolute `seatLocal()` / `coverLocal()` helpers.
**verified by measurement, not yet by eye.**

**The veins render and are seen.** With `aEmissive` surviving `prep()`, 1530 of
6051 sampled skin vertices were lit and **120 of them clear every occluder from
`landmark_meteor`, 190 from `zone_mencemoor`** — the first non-zero this
landmark's glow has ever produced from a judged stand. **verified.**

### What the frames showed

- `tmp/l20/v2-landmark_meteor-on.png`: the veins are unmistakably there and they
  read as **snow**. White patches lying on the crown, blotchy rather than linear.
  Three causes, all fixed in `bf0b78a` and **not yet re-captured**: a hairline
  octave whose band was ~3 m on a mesh with 7 m triangles (drawn as speckle, so
  deleted); a core colour of (0.62, 0.87, 1.00), which is a white with a blue
  bias and which a dusk exposure clips to flat white (now 0.26, 0.66, 1.00); and
  emissive landing on up-facing surfaces, which is exactly where the eye expects
  snow (now damped 72% by the vertex normal's y, so the wound is in the walls).
- The same frame shows a large dark faceted mass at screen left that the
  baseline did not have — an apron shard poking its top through the hillside,
  consistent with the −70 m median. Watch it after the seat fix: it should
  become talus rather than a blob.
