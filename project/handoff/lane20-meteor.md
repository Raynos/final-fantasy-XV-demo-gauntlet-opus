# Lane 20 — The Meteor (plan item 28): the Disc as a glowing wound

Status: **in progress**. Started 2026-08-31.

Direction, chosen by the human and not open: **exposed molten-blue crystal
fissures in the crater, visible from the highway at night**, pairing with the
`lest_overlook_disc` judged shot.

---

## FOR LANE 21 — the framing I want for `lest_overlook_disc`

Read this before you pose the camera. **not verified** yet — it is the framing
this lane is authoring *toward*; I will update it with a captured example.

- **Stand:** the Lestallum lookout parking, `lestallum_lookout` in
  `WorldMap.ts:644`, world **(-2880, -760)**, eye ~12 m over the apron so the
  shelf edge is in the bottom of the frame rather than the whole foreground.
  It is 2.33 km from the impact centre **(-1020, -2160)**.
- **Target:** `(-1020, 340, -2160)` — the waist of the mass cluster, not its
  crown. The crater has to be in the frame or the shot is a picture of a rock.
- **fov 30.** At 2.33 km a 42–50° lens makes the Disc a thumbnail; 30 puts the
  585 m cluster across a third of the frame and still keeps the crater rim.
- **Time: night — 21.0–21.6.** This is the whole point. `landmark_meteor` runs
  t 17.6, which is dusk (`Props._night` is driven off sun elevation), and the
  human's direction is explicitly the night read. If only one of the two
  pairing shots can be night, make it this one.
- **What it should read against:** the Disc's **west face is exactly local −X**
  in the meteor group's frame (group yaw 0.6), so that is the face this lane
  authors its strongest vein trunks onto. The silhouette wanted is the cluster
  of angular peaks *dark* against the last of the sky, with the fissure network
  the only chroma in the frame — cool white-blue cores, a warmer halo — and the
  crater floor's radial gashes visible through the rim breach.
- **Do not** put the camera on the meteor's own radial 1.9 or 4.6 rad breach
  lines by accident: those are where the rim ring is deliberately broken, and a
  stand that looks straight down a breach sees the moat floor instead of a rim.

Message the coordinator if you need this re-aimed; I would rather re-author a
face than have the shot fight the art.

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
