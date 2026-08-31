# Phone demo — handoff

**Live, shipped and green: https://dist-three-rho-86.vercel.app**

One build, **no query parameters**. A desktop gets the full game; a phone or
tablet is detected and gets the demo. That is the link to hand a person.

`pnpm run check` is **23/23**. Baseline recorded at 290 s.

---

## What it is

The **whole world** on a phone, not a slice — `?q=low`, touch controls, and the
far half of the map evicted behind you. An earlier plan fenced the demo into a
1200 m disc; that was dropped once the two things turned out to be orthogonal.
Every byte came from container deferral and the disc only bought ~2.8 s of init.

| | session start | now |
|---|---|---|
| download, first frame | 78.1 MB | **15.3 MB** |
| boot (`GAME.ready`) | 25.8 s | **4.6 s** |
| draw calls | 540 | **208** |
| triangles | 6 400 667 | **2 239 089** |

The full account is `project/archive/plans/2026-08-31-opus-mobile-10x.md`.

---

## The five things a fresh agent will otherwise get wrong

1. **The two container formats have DIFFERENT BYTE LAYOUTS.** `baked/*.bin.gz`
   is four byte planes; `baked/m/*.bin` is interleaved RGBA. `TexEntry.interleaved`
   is the flag and `compactTexBake` must carry it. This cost an afternoon and
   four wrong diagnoses. `LANDMINES.md` has it.
2. **WebP beats gzip 3x on textures and LOSES on terrain** (23.7 vs 17.2 MB
   lossless). Textures are pictures; a delta-coded heightfield's low byte is
   noise. `_probe/terrsize.mts` reproduces it.
3. **A canvas round trip is lossy for DATA at every quality setting** —
   premultiplied alpha, and `toBlob('image/webp', 1)` is lossy q100 because
   Chrome exposes no lossless-WebP path. Data textures go `raw`.
4. **`drawcheck` parses its budget out of BRIEF.md rule 3 by regex.** Reword
   that line and the gate goes VOID rather than passing. I did this and misread
   the VOID as machine contention twice.
5. **The `#hud` offsets in `touch.css.ts` are ZOOMED units**, not screen px —
   `#hud` carries `zoom: uiScale()`. Two attempts in a row parked the party bars
   on top of the minimap because of this.

## Controls, briefly

`src/ui/touch/` drives everything through a synthetic `PadLike` folded into
`Input.padSource`, plus synthesised keys for the two verbs with no pad binding
(`Digit6` chocobo, `KeyF`/`Digit7` car). No gameplay system knows it exists.

- Left stick drawn, right side is drag-anywhere to look. Sprint is the left
  stick's rim.
- CHOCOBO and CAR are four-state and read live. **The Regalia can be summoned
  now** (`RegaliaSystem.summon()`, `Digit7` on desktop) — it was the one thing
  in the world you had to walk back to.
- Portrait gets a rotate gate with a "play anyway" escape, because rotation lock
  is common and a web page can neither read nor change it.
- `touchcheck` (20 rows) drives it all through real pointer events.

## Open, in the order I would take them

1. **Nobody has played it on a handset except the human, briefly.** Every bug
   that mattered this session — the camera drag sliver, the quality
   overcorrection, the channel scramble — reached a real phone before any of 23
   gates or any desktop capture saw it. This is the biggest gap and no
   instrument here closes it.
2. **Draw calls on real hardware.** "208 draws is CPU-bound on a mobile driver"
   is an inference, not a measurement. The next round of optimisation targets
   the wrong thing if it is wrong.
3. **Tiled terrain streaming.** The only remaining download lever: `h` is
   5.59 MB of irreducible lossless heightfield and ~10 MB is the floor for a
   whole-world 4 km² field shipped as one file. Getting past it means sixteen
   512² tiles, a tile fetcher, and `Field.heightAt` surviving a missing tile
   without a hole in the ground. Real work, not a tweak.
4. **The party-wipe root cause.** A watchdog ships and the cause does not
   reproduce — `_probe/wipe.mts` resolves it in six frames. If the watchdog's
   console line ever fires in a real session, that is the reproduction nobody
   has. See `HUMAN_REVIEW.md`.

## Escape hatches worth knowing

`?demo=0` full game on a phone · `?demo=1` demo on a desktop · `?touch=0/1`
controls · `?webp=0` plane containers · `?nobake=1` generators ·
`?rs= ?dens= ?veg= ?fps=` one knob each.

Four theories about the speckled sky died to `?webp=0` rendering it perfectly in
one reload. Reach for a control before a hypothesis.
