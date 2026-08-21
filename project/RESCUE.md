# Rescue ledger — the force-killed session `07642602`

Session `07642602` (coordinator) and its **7 subagents** were force-stopped: the
session had reached ~3 GB RSS and an ~80 MB transcript and had become unusable.
Every agent was told "hand off and prepare to exit", so `project/handoff/*.md` is
the *only* surviving record of what they were doing.

This file reconciles **what those handoffs claim** against **what is actually on
`main`**, verified by reading the source on 2026-08-21 — not by trusting the docs.
It is the checklist for closing that session out cleanly.

Read alongside `project/handoff/2026-08-21-coordinator.md` (the session's own
summary) and the seven per-agent handoffs.

---

## A. Already landed — verified in source, no action needed

Do not re-investigate these. Each was checked against the file and line.

| claim | verified |
|---|---|
| Black cutscene sky — `Dungeons._doEnter()` saves lighting **before** hiding the exterior | ✅ `src/world/dungeons/Dungeons.js:226-228`, with the explanatory comment at `:216` |
| Backwards finger curl — `Anim.js` no longer opens the hand | ✅ `src/characters/rig/Anim.js:565-566` now `+0.26 * rw` (was `-0.24`) |
| `Character.setGrip` exists and companions call it | ✅ `Character.js:198`, called from `PartyAI.js:125-127` |
| Iron Giant `KNOWN BAD` comment de-staled | ✅ `src/game/Shots.js:731` reads "Was KNOWN BAD" |
| `menu_map_wide` was **not** pointed at the unregistered `map_wide` screen | ✅ `Shots.js:218-220` still `menu: 'map'`; no `map_wide` exists in `src/ui`. The trap was correctly avoided |
| Party sinking (`bobY` unbounded `-=`) | ✅ per coordinator handoff §2, verified by eye that session |
| Disc of Cauthess meteor moved to its own zone centre | ✅ per coordinator handoff §2 |
| `PostFX._headObject()` racks focus onto the shot's `follow` subject | ✅ per coordinator handoff §2, verified on `ignis_closeup` |
| Weapons grip-at-origin geometry; companions carry sheathed | ✅ verified by eye that session (`tmp/shots/wp1/`) |
| Enemy grounding: 52/207 drifting poses → 0 | ✅ `creaturecheck.mjs` 207 poses / 0 failures |
| Regional terrain palette reaches the shader; 27 m mega-plates gone | ✅ verified by eye + LUT probe (worst error 0.007) |
| Grass LOD albedo bug, height contract, tint rewrite | ✅ verified by eye + instrumented measurement |
| Hero eye rebuild on all four heroes | ✅ verified by eye at 0.4 m |

---

## B. Abandoned mid-flight — the actual rescue list

Ordered by impact. Every item names the file, the owner directory, and how it was
verified as still outstanding.

### B1. `Party.snap()` — the determinism hole · **highest value**

**Status: not started. `Animator.rest()` exists at `Anim.js:279` and has ZERO
callers** (`git grep '\.rest()' -- src` returns nothing). It is dead code.

`agent/idles` stalled mid-sentence writing exactly this. The defect it leaves:
companions are still steering to their wandering formation slots when a shot
settles, so a camera anchored to a moving subject smears the **whole frame**
through TAA and motion blur. Worse, formation state carries across shots — the
same shot in a batch put the camera *inside another party member*. **All 47
`follow` shots are order-dependent**, which breaks the determinism guarantee the
entire capture harness rests on. Some framings previously judged "broken" may
simply never have settled.

Build `Party.snap()` — place each member on its slot, zero velocity and lag
state, call `member.character.anim.rest()` — then call it from `Game.applyShot`
(`Game.js:174`, coordinator-owned).

**Do not repeat two reverted fixes:** a re-anchor convergence loop (formation
drifts between iterations) and a long settle for follow shots (240 extra frames
× 47 shots, did not fix ordering). The fix belongs in `Party`.

Acceptance test, in the stalled agent's own words: *"a capture applied after five
other captures renders the same frame as one applied first."*

### B2. `agent/idles` was never looked at, at all

**Status: merged into `main` unverified.** The branch shipped a posture system —
`rig/Posture.js`, a rewritten `evalIdle` with weight bands, two inverted signs
fixed, `footYaw` finally read, `evalStance`/`evalGesture` — and **no capture
round was ever completed.** `npx vite build` passed; nothing else was run.

This is unverified code in the shipped game affecting every character in every
frame. Capture and look at: `hero_full`, `hero_face`, `combat_wide`,
`gladio_closeup`, `ignis_closeup`, `prompto_closeup`, `haven_dusk`. Confirm the
weighted hip rides *up*, the shoulder line counter-rotates against the pelvis,
and the combat stance actually differs from the field idle.

### B3. Noctis is left-handed, and his fist never closes

Two verified, unfixed, one-line-ish defects that `agent/weapons` reported across
an ownership boundary and nobody applied:

- **`src/combat/CombatSystem.js:32`** — `this.hand.position.set(0.30, 1.12, 0.12)`.
  The rig faces +Z with its right side at −X, and `CombatAnim.js:415` picks the
  arm with `local.x >= 0 ? 'L' : 'R'`, so a positive x puts the sword in his
  **left** hand. Also `CombatSystem.js:1181` and `REST_POS` at `:1367` (still
  `0.30`). Confirmed by eye that session in `tmp/shots/wp1/hero_face.png`.
- **`CombatAnim.lateUpdate`** never calls `setGrip`, so Noctis' hand stays open
  around a correctly-placed blade. One line next to the existing `weaponIK` call
  (`CombatAnim.js:116`): `this.player.character.setGrip(main, ikWeight);`

### B4. Blade material — every blade is a flat navy plane

**Status: unfixed. `STEEL = 0x8e97a1` is unchanged at `Weapons.js:106`.**

Geometry is rebuilt and good; the *material* is the remaining defect. At
`metalness 0.90` the diffuse term is ~0, so a blade takes its colour entirely
from the sky env map — uniform dark navy, no edge highlight, no bevel line, no
fuller shading, and the baked `groundBlade` gradient is invisible.

The prescription is written and specific: metalness → ~0.72–0.80, envMapIntensity
→ ~0.8, base roughness → ~0.34, and warm the `STEEL` palette so the sky tint is
cancelled rather than reinforced.

**Invariant:** all five weapon materials must stay configuration-identical —
`customProgramCacheKey` returns a constant and `CombatSystem._prebuildWeapons`
depends on one shared compiled program. Keep the maps module-level.

### B5. `combatloop.mjs` sits at 21/30 and nobody owns it

Nine failing checks: companion techniques, energy draw, spell craft, spell cast,
raw elemancy, nameplate HP, damage numbers, the Armiger gauge, and "kill an enemy
→ EXP". `agent/enemies` proved it is **pre-existing** by reproducing the identical
nine with `src/characters` reverted to `0be851f`.

The lead is concrete: the nameplate check's diagnostic reads
`menuOpen=true menusA=1.00 menu=controls` — **the controls menu is stuck open for
the whole run**, eating input, which plausibly explains most or all nine. Owner:
`src/ui/**` / `src/game/**`.

`project/SESSION-STATE.md` recorded 30/30 at some earlier point, so this broke and
went unnoticed — an argument for running the *full* gate suite at every merge.

### B6. Perf is unmeasured on a quiet tree — three agents deferred it

Every perf number from that session was taken with 6+ concurrent headless
Chromiums and is worthless. Specifically deferred:

- `agent/splat` never ran `perf.mjs` at all. `tf_stoch` adds ~4 texture fetches
  per pixel and is **the single unmeasured risk in the terrain change**. The
  pre-planned fallback if it does not pay: gate `tf_stoch` to `vTDist < 400 m`
  and single-tap beyond.
- `agent/grass` measured 73.6 fps mean / 39.1 worst under load **with no
  before-baseline** — an admitted mistake. Its own draw-call comparisons are
  sound (grass instances −18%, grass draws 164 → 128).
- `agent/heroart` never ran it; the eye rebuild adds ~+1.5 k tris/head.
- `gameplay.mjs` still fails the 60 fps `walk` gate (~57.5 fps best; shadow
  cascades ~22 ms dominate).

**Re-baseline everything on a genuinely quiet tree before judging any of it.**

### B7. Shots and zones never looked at

- **Five zones never captured** by `agent/splat`: `zone_weaverwilds`,
  `zone_malmalam`, `zone_cape_caem`, `zone_malacchi`, `zone_pallareth`; plus
  `zone_callaegh` captured but never opened. `weaverwilds` matters most — highest
  `green` entry (0.86), the most extreme test of the grass path.
- **`zone_galdin`** only exists as a backlit frame with a blown sky; its
  foreground reads as dark green meadow against an authored `green: 0.32`. Re-shoot
  in neutral light before retuning the table.
- **`zone_ravatogh`** frames a green valley with the cone at the top of frame
  rather than the volcano. `Shots.js:391`, coordinator-owned.
- **`agent/heroart` never re-shot the corpus** after its final edit. Baseline is
  `tmp/shots/ha0/`; that comparison was never made.
- **Grass must be re-judged against the new terrain.** `agent/grass` made every
  colour call against the *old ochre* ground and pulled `GROUND_BLEED` 0.32 → 0.22
  to compensate. Now that `agent/splat` has landed regional colour, that value may
  want to go back up. This is cheap and may invalidate other small calls, so do it
  first among the visual items.

### B8. `cine_opening` — four men push an invisible car

**Status: unfixed. `Opening.js:189/264` still uses the old broken `restoreCar`
pattern; `takeCar` is imported only by `Hammerhead.js`.**

There are two Regalias: `Props.regalia` (the static prop, hidden at init by
`RegaliaSystem`) and the sim's own root (overwritten from `body.pos` every tick).
`Opening.js` moves the invisible one, so the opening cutscene stages around empty
air with the real car parked 40 m up the road. `SceneKit.takeCar()`/`releaseCar()`
already solve this — `Opening.js` needs ~10 lines.

### B9. `cine_astral` — not started, but fully scouted

Still staged at the `layby` Ecology site, which the biomes merge turned into dark
closed-canopy forest, with a black slab (a clipped trunk) occluding ~22% of frame.

The replacement is measured and ready: stage at **(−1122, −1752)**, 420 m out on
the `disc_overlook` bearing, terrain 3.5 m. Crater floor is flat at 3–4 m from
300–500 m out; the Disc subtends ~31° of elevation and the rim wall rings the
horizon. Frame axis toward the crater centre (−1020, −2160) for awe beats, away
for faces. Use `poiPoint(ctx, 'disc_cauthess')` — do not hard-code. Also reconcile
the weather: `Shots.js` says `storm`, the scene sets `overcast`, and the scene
wins. Recommend `storm` in the scene.

### B10. UI work — entirely untouched

`agent/cineui` did **zero** work in `src/ui/**`. Outstanding:

- **BLINDSIDE doubling** — three compounding causes, none addressed: fractional
  `transform: scale(1.14 → 1.0)` resamples the glyph layer; `translate(-50%,-50%)`
  on an odd-width box lands off the pixel grid; `text-shadow: 0 2px 10px` reads as
  a second offset copy over bright desert (`ui.css:349`, `CombatHUD.js:476`).
  Fix by driving the punch from `letter-spacing` + `opacity`, snapping the box to
  integer pixels, and using a tight symmetric halo.
- **`map_wide` / `world` screens** — never registered. `BOX` is 1520×676 css px and
  `WORLD.size` is 8192 m, so fitting the continent needs ≤ 0.0825 px/m while the
  coarsest `ZOOMS` step is 0.118: **a new fit-all step is required**.
  `_regionLabels()` fades out above 0.205 px/m, which is why region names never
  appear.
- **Combat rail draws over the party panel's HP numbers** in `combat_wide`.
- **Type/panel pass** across `menu_*` / `hud_*`. `menu_main` is worst: nav and info
  column float on the terrain with no plate, 9 px sub-labels, four saturated
  portrait cards where FFXV's are near-monochrome.
- **Subtitles are not cleared when a scene is stopped by a new shot** — `menu_title`
  after a `cine_*` shot shows the previous scene's subtitle burned over the title
  card (`TitleScreen.js` / `Subtitles.js`).

**Project rule: no CSS transitions or keyframes in `src/ui`** — animate per frame
from `game.time`, or deterministic captures break.

### B11. Character art — one region of one feature is done

`agent/heroart` landed the eye and describes it honestly as *"better, not good —
it would still lose a blind side-by-side against FFXV."* Everything else in its
approved plan is **not started**, with findings recorded:

- **Profile head collapse** — "the worst frame in the game"
  (`tmp/shots/ha0c/ignis_profile.png`): no nasion, no mandible body, chin is a
  point, ear swallowed by hair, back of skull a glossy dome.
- **Hair** — the plan's diagnosis is *out of date*: `Cast.js` already carries
  `out: 0.6–0.87`, so this is **not** a direction-field problem and retuning `out`
  will not fix it. Each strand is a straight, wide, flat, faceted blade. The fix is
  in `ribbon()` (`Geo.js:591`): curved cross-section, real bend along length, several
  locks clumped per root.
- **Skin** — over-saturated orange at closeup, and the **neck is a different colour
  from the face** with a hard seam: the body uses `c.pore` at `repeat(22,34)` while
  the face uses `poreFine` at `repeat(9,13)`.
- **The caruncle is placed at the wrong canthus** on at least one side — fix or
  delete it (`Face.js`, `buildLid`, the `!upper` block, `cf = 0.05`).
- **Socket depth is parked at a working value, not a correct one.** See the
  DoubleSide trap in §C.
- Hands ("mittens"), outfits, `Cast.js` appearance data: untouched.

### B12. Enemies — 17 of 23 species got only the systemic pass

Deep-rebuilt and verified: `sabertusk`, `goblin`, `irongiant`, `dualhorn`/`bloodhorn`.
Everything else got `detailUV` + rebuilt detail maps only. In screen-presence order:
`mt` (a thin dark stick at range, in most Leide fights), then `axeman`/`sniper`,
then `garula`/`anak`/`voretooth`/`coeurl`, then `titan` (a boxy grey rock pile).

Also outstanding:
- **Daemon night readability** — `bestiary_hobgoblin`, `bestiary_bussemand`,
  `bestiary_arachne`, `daemon_night` are near-black silhouettes. Decide first
  whether it is exposure (`Sky`/`PostFX`) or albedo (enemies) — never measured.
- **Sabertusk contrast** still soft; only ever checked backlit.
- **Consider `DETAIL_TILES` 7 → 9–10** (`RigBuilder.js`) — convincing at 3 m,
  nearly invisible at 20 m. Watch for shimmer.
- **`bestiary_titan`** has two black telegraph catenary lines through the Titan's
  chest, also crossing `bestiary_bloodhorn`.
- **`src/world/props/Grazer.js`** — ambient garula herds are flat brown blobs;
  they bypass `RigBuilder`, so `detailUV` never reached them.

### B13. Trees and bushes — plan item F, not started

`agent/grass` scouted two specific leads and touched neither:
- `VegTextures.leafClusterTex('broad')` draws at `g = 66 + shade*62`. The leaf
  cards have **never had their albedo pinned**, so the tree LODs may carry the same
  3×-darkness class of bug the grass cards did. The `normalizeAlbedo` hook added
  for grass (`alphaTex`'s `albedo` option) is the right tool. **Check that before
  touching the ratios.**
- `Trees.js:288` and `:326` compose `shade * SPECIES_TINT[sp] * b.treeTint` with
  `shade = 0.62 + rng.next()*0.40` — up to 1.02 before either tint. Same
  "albedo over 1" shape as the grass tint bug.

Evidence: `tmp/shots/gr7/zone_malacchi.png` — candy-green canopy with blown, nearly
white highlights.

**Do not "fix" the Nebulawood and Malmalam interiors** — dark, humid and hazed is
correct for the brief.

### B14. Loose ends and hygiene

| item | detail |
|---|---|
| `creaturecheck.mjs` is not wired in | 207-pose grounding gate exists but no npm script runs it; `package.json` has only `dev`/`build`/`preview`/`shoot`. Its author explicitly asked for it to be kept in the suite |
| `src/world/map/MapRaster.js` orphaned | File exists, nothing imports it, pre-existing since `5fd2876`. Delete it or wire it |
| Probe directory is split | `src/tools/_probe/heads.mjs` vs `src/tools/probes/meteor.mjs`. `CLAUDE.md` documents `probes/`. Pick one |
| Gladiolus' stow needs tuning | Greatsword hangs a visible gap off his back — pull in along the socket's local −Z by ~4 cm, more diagonal |
| Weapon anchors never re-probed | Assert `weapon.tip()` is at the blade tip and the firearm muzzle is ~0.17 m from the fist (it was once 13 m up). No `probes/weapons.js` exists |
| Swing arcs never re-shot | Re-origining moved every weapon relative to every swing arc and trail anchor. `combat_wide`, `combat_armiger`, `warp_strike` unshot since. `Armiger.layout` was tuned against guard-origin geometry |
| Engine Blade guard | Reads as a rounded blob at distance; quillons want to be more angular and less deep in Z |
| `Anim.js:838` gaze pitch | `+0.11` compensated for an aperture that no longer exists; its justifying comment is now false. Suggest 0 |
| Hammerhead POI vs. built town | `WorldMap.js:249` anchors the POI to `n_hammerhead` at (60, 18); `Town.origin` is (576, 16, 10) — **516 m apart**. Fast-travel target, discovery radius and minimap label are all on the wrong spot |
| Floating blue pickup | ~2 m off the deck in Hammerhead's garage bay (`src/world/town/Hammerhead.js`); predates the branch |
| `caem_shore` fishing POI | (−2564, 1966) reportedly mis-authored; never verified by measurement |
| `_outcrops` RNG | Consumes its stream conditionally on local slope, so any height change anywhere reshuffles every later boulder. Worth decoupling |
| `/eval` cutscene harness | The five-frame contact-sheet trick (§6.5 of the cineui handoff) is worth promoting into `src/tools/` |
| Harsh-critic pass | Last score 4.5/10 and **predates** clouds, cartography, collision, menus, combat, the rebuilt bestiary, biomes, dressing and this entire session |

---

## C. Landmines carried forward — read before touching the relevant area

These cost real time once already. Each is measured, not suspected.

**Terrain / heightfield**
- The **chevron hatch** on conical peaks and the **horizontal "wood grain"** on
  Taelpar's walls are **heightfield normals, not the splat.** Proven by forcing
  `cliffAmt = bedThrough = runnelAmt = 0.0` and seeing no change. Owner is
  `Field.heightAt()` / `WorldMap` `biome.terrace`. **You cannot fix either from
  `TerrainMaterial.js`.**
- Dark near-ground in green zones is **pre-existing vegetation density + cloud
  shadow**, not the palette. The pre-change baseline has an identically dark
  foreground. Shoot the baseline before believing any regression in this shader.
- The zone blend dilutes small zones — Ravatogh holds only ~78% of its own weight
  at its centre. **Measure what actually arrives** via `surfaceAt()` before
  authoring a table entry.
- Zone centres are `cx`/`cz`, **not** `x`/`z`. Reading `zn.x` silently yields
  `undefined` and a full table of `NaN`.

**Characters / faces**
- **`Character.js:73` sets `faceMat.side = THREE.DoubleSide`, and a back-facing
  surface renders in front of the eyeball and hides it completely.** The socket
  depth therefore controls eye visibility **non-monotonically**: too shallow by a
  little and an inverted-winding *fold* covers the globe while the skull does not,
  which looks identical to a shading bug. The right fix is to stop the sculpt
  folding (widen the socket brushes toward `[0.048, 0.032, 0.058]`, add `pow: 1.6`)
  — and **verify with `DoubleSide` specifically**, because a `FrontSide` test passes
  while the shipped material still fails.
- **Do not "simplify" `skinSnap()` away.** Without it any socket change re-opens
  the lid-band bucket.
- The corpus closeups are not closeups — `hero_face` puts Noctis' head at ~100 px.
  **Face work must be judged through `framecam.mjs` at 0.4–0.6 m.**
- The tutorial hint card parks itself exactly over the subject's forehead in every
  face framing. `g.get('HUD').hints.root.remove()`. It is not the HUD and
  `shot.hud` does not suppress it.
- **Never `-=` on an idle layer.** That is how the party sank 10 m.

**Enemies**
- `Color.setHex` runs `Math.floor`, so passing a `THREE.Color` where a hex is
  expected yields `NaN` and renders **black, silently, with no error**. The
  sabertusk's head was black for its entire existence because of this.
- Strided vertex sampling **lies about depth** — under-reported by 0.33 m on a
  30 k-vertex mesh. The two-pass refinement in `poseFloor` is load-bearing.
- A creature meant to be underground needs `buriedBase`, not a wider tolerance.
- Do not calibrate the gaits — `groundLift` is indexed on `stateTime` while
  `approach`/`run` are driven by `gaitPhase`.

**Vegetation**
- **Do not consume `#include <project_vertex>`** in `VegMaterial.patchVeg`. Eat it
  and every leaf and grass card computes eye distance as `length(cameraPosition)`,
  flooding all vegetation over a km from Hammerhead to 100% sky inscatter. Check
  `vista_noon` and `zone_three_valleys` after any shader edit there.
- A shader local may not be called `cross` or `patch` — reserved words, failing at
  *link* time behind the useless `Shader Error 1282 - VALIDATE_STATUS false`.
- Backticks inside `/* glsl */` template literals terminate the string.
- Do not use a per-instance hash for per-clump wind — an instance in the blade ring
  is *one blade*, not one plant, and it shreds the tuft.

**Cutscenes**
- **The black sky does not reproduce unless a dungeon shot ran first in the same
  page.** A targeted re-shoot looks perfect. That ordering dependency is the bug.
- `Cinematics.seek()` **only walks forward** (`while (this.tl.t < t)`). Seeking
  backward silently returns the same frame. To review a cutscene:
  `stop()` → `play(def)` → `seek(t)` per beat. The live def is `cine.scene`, not
  `cine.def`.
- Hammerhead's apron is **3.2 m above `Terrain.heightAt`** — the town grades a pad.
  Anything snapped to the heightfield there ends up under the tarmac.
- Shoot from the sun side; `Opening.js:96-104` derives `side` from the live sun and
  is the pattern to generalise.

**Harness**
- **The machine saturates.** 6+ concurrent headless Chromiums make every
  measurement worthless *and* stall agents outright — that is what killed three
  agents last round. **Cap concurrency at ~4.**
- One `PORT` per worktree; the capture daemon takes `PORT+1`. Aiming `framecam.mjs`
  at the daemon port hangs for the full 300 s timeout.
- Toggling a light's `visible` recompiled 43 programs — a measured 9.5 s freeze.
- `constructor.name` is mangled in production builds.
- **Tell every agent to commit early and often, even unverified `WIP:` commits.**
  Three agents stalled last round with uncommitted work — ~280 lines, ~860 lines,
  and `Animator.rest()` — all recovered only by committing their worktrees directly.
  An ugly commit is enormously cheaper than a lost afternoon.

---

## D. Definition of done for the rescue

- [ ] `Party.snap()` written, called from `Game.applyShot`, and the order-dependence
      test passes: the same follow shot renders identically first and sixth in a batch
- [ ] `agent/idles`' posture work captured and **looked at** — it has never been seen
- [ ] Noctis holds his sword in his right hand, with a closed fist
- [ ] Blades read as steel, not navy planes
- [ ] `combatloop.mjs` back to 30/30, or the nine failures explained and owned
- [ ] `perf.mjs` and `gameplay.mjs` re-baselined on a genuinely quiet tree
- [ ] The six unviewed zones captured and opened
- [ ] `creaturecheck.mjs` wired into a gate script that actually runs
- [ ] `project/SESSION-STATE.md` rewritten to the true state — it currently claims
      7 agents are running and lists fixed bugs as open
- [ ] `project/claude-resume.md` points at a live session or is deleted
- [ ] A fresh harsh-critic pass, graded against shipped FFXV
