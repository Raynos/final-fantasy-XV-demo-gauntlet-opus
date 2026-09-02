# Game Studio — handoff

**Live: <https://ff15-xv-opus.vercel.app>** · `pnpm run check` **24/24** ·
plan: `docs/plans/2026-09-02-opus-game-studio-v2.md` (v1's plan is superseded
for architecture, intact for information architecture).

Deploy with **`node src/tools/deploy.mts`**, never a bare `vercel deploy` —
read that file's header first.

---

## The one thing to understand

**The studio does not boot the game.** That is the whole architecture, and
`studiocheck.mts` asserts it on a real page:

| | booted |
|---|---|
| front door | **0 systems** |
| Model Explorer | **0 systems** |
| World Explorer | **exactly 5** — Sky, Terrain, Water, Vegetation, Props |
| characters in either scene | **none** |

v1 got this wrong in a way worth remembering: it promoted `src/dev/`'s *debug
overlay* into a mode. An overlay is summoned while you play, so every assumption
in it — spawn the enemy through the game's pool, hide the world by walking
`scene.children`, steal the camera from `CameraRig` — is right for an overlay
and wrong for a mode. The symptoms all followed from that: 6.5 s of boot before
a two-row menu, the party standing in the menu shot, `holdWorld()` and
`pumpWorld()` existing at all.

## What is built

| lane | state |
|---|---|
| V1 boot profiles, front door before any boot | **done** `360d22f` |
| V2 Model Explorer standalone (`ModelStage`, own factories) | **done** |
| V3 World Explorer on the 5-system profile | **done** |
| `studiocheck.mts` gate, in the suite | **done** |
| V4 list engine — reconcile, search, scroll retention | **not started** |
| V5 command palette (Cmd+K) | **not started** |
| V6 thumbnails + tile view | **not started** |
| V7 mobile shell over the new core | **skeleton only** |
| V8 Shot Gallery, Look Lab, Device | **placeholders** |

Shot Gallery is a must-have and is the largest hole. The mobile shell renders
chrome but no section, so the studio is menu-only on a phone.

## Six things that will bite you

1. **Nothing may be drawn mid-boot.** The studio renders on its own rAF from the
   moment it opens; the game never does, because `Game.init()` finishes before
   `Game.start()`. But `game.add()` registers a system *before* its `init()` is
   awaited, so a frame drawn mid-boot caught `Sky` sampling a `Terrain` whose
   height field was unallocated and `Field.rawHeightAt` threw every frame.
   `StudioShell._booting` gates the loop. Found by the gate, not by looking.
2. **`studiocheck` cannot be a probe.** `probe.mts` drives a `?shoot=1` page and
   `?shoot=1` routes straight into the game, so a probe measures 33 systems its
   own harness booted. The gate opens its own `?studio=1` page in play mode.
   It is also the only thing that can screenshot the studio as a person sees it
   (`--shot <dir>`).
3. **`StudioBoot.ts` duplicates eight lines of `Game.init()`'s prologue.** BRIEF
   rule 4 forbids editing `Game.ts` and `init()` has no seam. If that prologue
   changes, the studio drifts silently. This is the plan's top risk.
4. **The five-system subset works because every cross-dependency is guarded.**
   `Vegetation` null-checks Player/Party/Enemies/Weather, `Water` checks Menus,
   `Props` falls back to `new Ecology(...)`, `Sky` early-returns without
   Terrain. Verified in source; the gate pins the set.
5. **A rotation written once does not stick.** A held animation drives the root
   every frame, like `EnemyBase.freeze` does from `heading`. `pinFacing()` runs
   per frame. And the party rig faces **+Z** — measured off Noctis's eye meshes
   at local z = +0.073, after two by-eye attempts contradicted each other.
6. **Never write a registry count down.** Three sources said 8, 17 and 18 for
   `NPC_CAST`. Everything counts at runtime.

## Known gaps beyond the unbuilt lanes

- **One scene per page.** `PostFX` binds its scene in its constructor, so
  visiting World *then* Models leaves a world that must be hidden rather than
  un-built. `showWorld(false)` toggles five system roots — cheap, and a no-op on
  the common path where no world was ever made.
- **Exit is still `location.reload()`.** With no game booted it could be a
  front-door re-render; the reload is now merely lazy rather than necessary.
- **The Signature twelve are a first draft picked off the map.** They are meant
  to be chosen by flying there and looking. `_probe/studioworld.mts` writes the
  contact sheet; nobody has judged it.
- **Gladio is 289,294 triangles** — the heaviest asset, against BRIEF rule 3's
  ~2.5 M phone budget. Not a studio bug; a finding the studio exists to surface.

## Tools

- `src/tools/studiocheck.mts` — the gate. `--shot <dir>` for real frames.
- `_probe/studiov2.mts` — pictures only. Its system counts are meaningless (see
  gotcha 2) and it says so.
- `_probe/studioworld.mts` — flies the Signature band.
- `_probe/rigforward.mts` — which local axis is a rig's front, by eye-mesh
  centroid. Re-run before believing anything about facing.
- `_probe/studiodoor.mts`, `_probe/herofacing.mts` — v1-era, kept: the first
  drives the old title flow, the second records why measurement replaced looking.
