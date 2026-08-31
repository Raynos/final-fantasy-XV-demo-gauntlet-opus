# Phone demo — handoff

**DONE and DEPLOYED.** https://dist-three-rho-86.vercel.app/?demo=1&touch=1

That URL is the one to hand a person. Auto-detection covers a real phone
(`maxTouchPoints` && `pointer: coarse` && `min(screen) <= 500`), but the
explicit flags mean it cannot be wrong on a device that fails one leg.
`?demo=0` / `?touch=0` are the way back out of either half.

## What it is

The **whole world**, at `?q=low`, with on-screen controls and 34.1 MB moved off
the first frame. Not a slice — an earlier plan fenced the demo into a 1200 m
disc, and that was dropped once the two things turned out to be orthogonal:
every byte came from container deferral and the disc only bought ~2.8 s of
init. What the disc really gave was a memory bound, and POI-kit eviction gives
that without fencing anything off.

## Measured (after the 10x programme, 2026-08-31)

| | start | now | |
|---|---|---|---|
| download, first frame | 44.1 MB | **15.3 MB** | 2.9x |
| boot (`GAME.ready`) | 7.19 s | **4.56 s** | 1.6x |
| draw calls | 540 | **208** | 2.6x |
| triangles | 6 400 667 | **2 239 089** | 2.9x |

The full account is `docs/plans/2026-08-31-opus-mobile-10x.md` (archived when
DONE). Three things from it that a future agent needs and will not guess:

- **WebP beats gzip 3x on textures and LOSES on terrain.** Textures are
  pictures; a delta-coded heightfield's low byte is noise. Lossless WebP over
  the terrain container is 23.7 MB against gzip's 17.2. Do not retry it.
- **`?q=low` had shadows on for the project's whole life** — `Sky.init`
  overwrote `Renderer._applyTier`. That one conditional was worth more than
  every deliberate optimisation next to it.
- **~10 MB is the floor** for a whole-world heightfield shipped as one file.
  10x needs tiled terrain streaming, which nothing here does.

## Measured (original phone-demo lane)

| | before | after |
|---|---|---|
| first frame, `?demo=1` (local prod) | 78.1 MB / 5 req | **44.0 MB / 5 req** |
| first frame, live origin | — | **44.1 MB / 5 req**, first frame 16.9 s |
| first frame, default page | 78.1 MB / 5 req | **78.1 MB / 6 req** — flat to the byte |

`pnpm run check` 22/22 (incl. the new `touchcheck`), `bakecheck` 8/8.

## The container tiers, because this is the part to understand first

Five texture/terrain containers now, in three classes:

- **boot, everybody** — `tex`, `texc`, `terrain`
- **deferred, everybody** — `texd` (`dgn/*`; nothing reads it until a cave)
- **deferred on `?demo=1`, boot elsewhere** — `texp` (`map/*`, `town/*`),
  `texcp` (`face/npc/*`)
- **fetched only above `?q=low`** — `terrainl` (the six PBR layers)

The third class is the idea worth keeping: a tier is a claim about *when a
given page needs the bytes*, not about what they are. Folding `texp` into
`texd` would have put 6.8 MB of dungeon back in front of the desktop's first
frame.

`terrainl` was pure waste rather than a trade — `Terrain.init` picks a 256
layer size at low and the bake is 512, so a low page has always decoded those
texels, found them the wrong size and thrown them away.

## Landmines this work stepped on

- **`Hammerhead` allocates `anchors = {}` at the top of its own init**, long
  before `_build` fills it, so `!town.anchors` cannot distinguish "no town"
  from "town not built yet". `Npcs` populated at boot anyway and repainted nine
  1024 faces from scratch. Check `town._deferred` first.
- **A built `PoiSite` is a different object from its queue entry.** `_make`
  spreads it into a new record. Eviction has to clear `group` on the *queue*
  entry or the kit never comes back; `BuiltSite.site` is the back-reference.
- **`setPointerCapture` throws `NotFoundError` on a synthetic pointer id**
  rather than no-opping, and the throw lands before the press reaches the pad.
  Every touch button was inert under the gate while looking correct.
- **`Input.gpDown` is `pressed && !_gpPrev`, and `_gpPrev` is refreshed in
  `endFrame`.** So (a) an edge is invisible from outside `game.frame()` — count
  them by wrapping `endFrame`; and (b) auto-repeat must publish a real one-frame
  *release*, because a button that never reads low can never produce a second
  rising edge however often it re-latches.
- **`--extra` was in `HARNESS_FLAGS` but not `HARNESS_VALUE_FLAGS`**, so a tool
  with its own parser ate both words as arguments. Fixed.
- **`compactTexBake` had only ever run at boot**, before any deferred container
  existed. It now runs when they land, and skips entries that already own their
  buffer.

## What is not done

- **Menu rows are not tappable.** The d-pad drives them, which is the path
  `uxcheck` already covers. Tagging rows `data-i` (one line per screen) plus
  ~20 lines of delegated `pointerdown` on `Menus.root` is the follow-up.
  `WorldMapScreen._bindPointer` already uses real pointer events — confirm
  rather than build.
- **Pinch-zoom.** Camera distance is `mouse.wheel` and has no touch equivalent.
- **Fishing tilt** is `KeyA`/`KeyD` only — you can cast and reel but not steer.
- **The party wipe's root cause.** See `HUMAN_REVIEW.md`; a watchdog ships, the
  cause does not reproduce.
- **Nobody has played it on a real handset.** Every number here is a headless
  Chromium at 844x390 or a desktop on a fast line.

## Files

`src/engine/Device.ts` · `src/ui/touch/{TouchControls,VirtualPad,Stick,TouchButton,layouts,touch.css}.ts`
· `src/tools/touchcheck.mts` · `src/tools/_probe/{tiercheck,uiscale,demoboot,evict,ctxloss,wipe,wipewatch}.mts`
· four `ui-shoot` scenes named `touch_*`.
