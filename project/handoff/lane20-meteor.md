# Lane 20 — The Meteor (plan item 28): the Disc as a glowing wound

Status: **in progress**. Started 2026-08-31.

Direction, chosen by the human and not open: **exposed molten-blue crystal
fissures in the crater, visible from the highway at night**, pairing with the
`lest_overlook_disc` judged shot.

---

## FOR LANE 21 — the framing I want for `lest_overlook_disc`

**CORRECTION, verified by capture — read this before you pose the camera.**
My first guess at this framing was wrong and I photographed it to find out.

- **The Lestallum lookout parking (-2880, -760) cannot see the Disc at all.**
  I stood a camera there at ground + 12 m, fov 30, aimed at (-1020, 340, -2160),
  and captured it: `tmp/l20/base-lest_night-on.jpg`. The frame is a foreground
  boulder filling the middle third, the Nifl dreadnought hanging in the sky
  behind it, and **no Meteor whatsoever**. The shelf and its own outcrops are in
  the way. Do not pose there.
- **The highway spur at `n_disc` (-1220, -1360) is inside the rock.** It is
  824 m from the impact centre, which puts it *on* the 790–1060 m rim ring, so
  the camera stands among 52–155 m rim blocks. `tmp/l20/base-spur_night-on.jpg`
  is a close-up of a rock face with a road sign in it.
- I have built `src/tools/probes/discview.mts` to answer this properly: it
  marches `Terrain.heightAt` from a candidate eye to the impact centre, turns
  the highest occluding sample into an elevation angle, and reports how much of
  the mass cluster clears it — crown only, down to the waist, or far enough to
  include the crater rim. **Run it (or ask me for its output) before you pose
  this shot.** A stand that sees only the crown gets a rock on a horizon; a
  stand that sees the rim gets a crater, and the crater is the subject.

What I want the shot to be, once the stand is a measured one:

- **Night, 21.0–21.6.** This is the whole point of the human's direction, and
  `landmark_meteor` cannot carry it: that shot runs t 17.6 and `Props._night`
  reports **night = 0** there, measured. `zone_mencemoor` is also night = 0. If
  only one shot in the corpus is a night read of the Disc, it has to be this one.
- **Target the waist, ~`(-1020, 300, -2160)`, not the crown.** The crater has to
  be in the frame or the shot is a picture of a rock.
- **fov 30–36 at 2.0–2.5 km**, which puts the 585 m cluster across a third of
  the frame with the rim still in.
- **The face:** the Disc's west face is exactly local −X in the meteor group's
  frame (group yaw 0.6). The vein network this lane authors runs all the way
  around the masses, so any bearing is served — but a west or south-west stand
  gets the strongest read against the last of the sky.
- **Aim to look down a rim breach.** The rim ring is deliberately broken at
  **1.9 and 4.6 radians** in the group's own frame, and this lane lays two of
  its six radial ground fissures on exactly those bearings, so a stand that
  looks in through a breach sees a glowing crack running out of the crater
  instead of a continuous rampart.

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
