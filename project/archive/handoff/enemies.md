# Handoff — `agent/enemies`

Owned: `src/characters/enemies/**`, `src/characters/rig/CreatureAnim.ts`,
`src/characters/Enemies.ts`, `src/tools/creaturecheck.mts`.

> **Sections 1, 2, 3 and 6 are the previous agent's and are still accurate** —
> the grounding fix, `creaturecheck.mts`, the systemic surface pass and the
> gotchas list. Sections 0, 4, 5, 7, 8 and 9 are this round's. Read **section 0
> first**: it revises two claims the older text makes that turned out to be
> false, and both of them were shipping visible bugs.

---

## 0. What this round found, and what it changes about the text below

**Two species recorded as "deep rebuild, verified by eye" were rendering half
black.** `Color.setHex` runs `Math.floor`, so a `THREE.Color` where a hex is
expected yields `NaN` and the surface renders black with no error. Section 6
says the sabertusk was the only casualty and that "`Dualhorn.ts` has its own
`mix` which already handles it". Neither is true:

- **Dualhorn/bloodhorn**: whole flank, whole head, all four legs flat black.
- **Coeurl**: whole torso.
- **Voretooth**: dorsal and skull.

And there is a second failure mode underneath the first that a type guard alone
does *not* fix: two module-level scratch registers cannot survive nesting. JS
evaluates arguments left to right, so in `mix(mix(A,B,s), mix(C,D,u), t)` the
second inner call overwrites the register the first just returned, and the outer
call blends a colour with itself. `Garula.ts` had already discovered this and
worked around it privately with `mix2`/`_c3`.

**Fixed properly**: new `src/characters/enemies/Palette.ts` — one blend for the
whole bestiary, with a type guard on both ends and a ring of eight scratch
colours, both arguments read into component scratch before an output register
is claimed. Safe at any depth. Coeurl, Voretooth and Dualhorn import it.

**If you add a species, use `mixc`/`colc` from `Palette.ts`.** Do not write
another local `mix`. Files still carrying their own are `Garula.ts` (has the
`mix2` workaround), `Goblin.ts`, `IronGiant.ts` and `Sabertusk.ts` (all guarded,
none nesting more than one deep) — they are correct today but they are four more
copies of a footgun.

**Second systemic finding: several species author patterns finer than their own
mesh can carry.** A vertex colour cannot represent anything shorter than the
vertex spacing, and a sweep's `th` term cannot represent more cycles than it has
segments. Three real defects came from this, all of them read as ugly hard-edged
streaking rather than as "slightly wrong":

| site | was | samples/cycle | now |
|---|---|---|---|
| `RigBuilder.weatherCoat` tick | 12 cm band | ~0.5 | dorsal gradient broken at ~0.7 m |
| `Garula` torso mane clumping | `sin(th*13)`, seg 20 | 1.5 | `sin(th*6)`, seg 26 |
| `Coeurl` flank bars | (was two merged blobs) | — | 5 bars, steps 26→34 |

**Rule of thumb that held every time: keep angular frequencies under ~6 cycles
on a 20-26 segment ring, and axial frequencies under ~4 cycles on a 26-step
sweep. Anything finer belongs in `organicNormal`, not in a vertex colour.**

---

## 1. The grounding bug — root cause, in full

**`Enemy.update()` returns on line 1 when `frozenPose` is set, so a posed
screenshot enemy never reached `_resetVisual()`.** `Enemies.update()` had its
own frozen branch that re-invoked `pose()` directly, once per settle frame:

```js
if (this.frozen) {
  for (const e of this.list) if (e.frozenPose) e.pose(e.frozenPose.state, e.frozenPose.phase, null);
  return;
}
```

The base classes written against `CreatureAnim` author the body transform
**relatively** — `Biped.stance()` does `this.visual.position.y -= drop`,
`poseLocomotion()` does `+= bob`, and `Quadruped`/`IronGiant`/`MTSoldier`/
`Garula`/`Dualhorn`/`Coeurl` all do the same — and are only correct because
`_resetVisual()` zeroes the transform first. That reset was **opt-in**
(`this.autoResetVisual = true`, set only by `BipedEnemy` and `QuadrupedEnemy`)
and the frozen path never called it. Every settle frame subtracted the crouch
again. The Iron Giant's telegraph crouch is ~0.1 m and a capture settles ~90
frames, so it shot from 8.4 m underground.

`MagitekArmour` writes `visual.position.y -= 0.24` for its phase-2 battle
damage and never opted in either, so **that one integrated in live play**, not
only in captures.

The fix:

1. `EnemyBase._resetVisual()` is now unconditional; `autoResetVisual` is gone
   from `Biped.ts` and `Quadruped.ts`. The older assign-style species set
   `visual.position`/`rotation` outright in every branch, so a zero beforehand
   is invisible to them, and the two conventions can no longer silently coexist.
2. New `EnemyBase.repose(dt, ctx)` — reset, `pose()`, `_postPose()` — is the
   single entry point for a held pose. `Enemy.freeze()` goes through it.
3. `Enemies.update()`'s frozen branch calls `e.repose(dt, ctx)`, **after** the
   ctx fields are filled in so a held pose still sees terrain and player.

| | before | after |
|---|---|---|
| poses that drift | **52 / 207** | **0 / 207** |
| worst drift | **-321.07 m** (irongiant/death) | **0.000 m** |
| irongiant/telegraph drift | -62.82 m | 0.000 m |
| mt/attack drift | -10.80 m | 0.000 m |
| total failures | 94 | **0** |

### The 46 static failures (commit `c5b1c0f`)

All were the same authoring mistake: a settle written as a *downward
translation* with a hand-picked constant (`visual.position.y = -0.80 * e`).
`visual` sits on the terrain, so rolling a corpse about it already swings the
body through the ground; subtracting a constant on top buried fifteen corpses
0.5-1.3 m and the magitek walker 1.7 m during a stagger. A corpse lingers six
seconds in live combat, so this was visible in play.

The correction is **measured, not guessed**, because constants cannot stay
right — the offset scales with the creature's size and silhouette, so every
sculpt change invalidates every number (and commits `571de91`/`c8fa679` then
changed sculpts, and the calibration re-measured itself with no edits).

- `Enemy.poseFloor()` — how far the *skinned* body reaches below the root. Two
  passes: a strided sweep to locate the low point, then an exhaustive sweep of
  the vertices around it. **Strided sampling alone under-reports depth by up to
  half a metre on a 30k-vertex machine**, which is exactly the error it is
  being used to correct. This cost one debugging cycle; do not "optimise" the
  refinement pass away.
- `Enemy.calibrateGround()` — runs each settle pose at twelve `stateTime`
  values on the frame a species first spawns, storing the shortfall as a curve
  (`groundLift`), per attack id where the pose depends on one. ~5 ms/species,
  once. Called from `Enemies.spawn` right after `attachVisual`.
- `Enemy.restBones()` — puts every bone back in bind rotation at four
  discontinuities: pool respawn, entering stagger, `die()`, and `freeze()`.
  `pose()` only writes the bones it cares about, which is wanted *within* a
  fight (a goblin's attack deliberately keeps the crouch its telegraph put in
  the legs) and wrong across a life.
- `GROUND_SINK = 0.05` — 5 cm of tolerated ground penetration, deliberately.
  Correcting to exactly zero makes everything look like it is hovering.

Two real bugs found on the way, both in `MagitekArmour`'s walk:
its gait never passed `rootDY` to `solveLeg`, so the IK aimed each foot at a
point measured from a hip it believed was still in bind pose and six tonnes of
machine paddled along 0.73 m inside the ground; and it asked the solver to
level its pastern near horizontal when its metatarsus is raked ~40 deg in bind
pose, swinging the foot down and back off the end of a 0.9 m segment.

---

## 2. `src/tools/creaturecheck.mts` — the regression gate

**Please keep this wired into the check suite.** It is the gate for the whole
class of bug above, and it is what proves a sculpt change has not re-buried
anything.

```bash
node src/tools/creaturecheck.mts                     # whole roster, every pose
node src/tools/creaturecheck.mts --species sabertusk,irongiant
node src/tools/creaturecheck.mts --hold 240          # frames to hold each pose
node src/tools/creaturecheck.mts --tol 0.25          # fail above this |foot|, metres
node src/tools/creaturecheck.mts --json out.json     # includes the calibration curves
PORT=5399 node src/tools/creaturecheck.mts           # pick a free port
```

It measures the **skinned** AABB — every vertex through `applyBoneTransform`;
`Box3.setFromObject` on a `SkinnedMesh` reads `geometry.boundingBox`, which is
the *bind* pose and is blind to a skeleton folded through the floor — for
**23 species x 9 poses = 207 poses**, driven through the real `freeze` +
frozen-`update` path so it measures the code that makes the bestiary shots.

Columns: `foot` (bbox.min.y - root.y), `bodyY` (what the pose wrote to the body
transform), `headroom` (`foot - bodyY`, i.e. the pose's clearance *before* its
own offset — the diagnostic that survives the correction), `roll`, `top`,
`height`, `drift` (change in `foot` between a 1-frame and a 240-frame hold;
**must be zero**).

Fails if any pose drifts, or if any non-exempt pose is more than `--tol` off
the ground. **Current: 207 poses, 0 failures, exit 0.**

### Exemption list (in the tool, by name, with reasons)

| species | poses | why |
|---|---|---|
| `titan` | all | Modelled from the pelvis up — the arena the player fights in sits at his waist, so tens of metres are below ground by design and there is no foot to measure. Confirmed by eye in `bestiary_titan`. Also flagged in source as `TITAN.buriedBase`, which opts him out of `calibrateGround` (without it the calibration hoisted the whole mountain 3 m out of its arena). |
| `necromancer` | idle, approach, run, telegraph, attack, flinch, stagger | A floating daemon; it hangs 0.3-0.7 m up and its robe trails. **Its death is deliberately not exempt** — that is the one pose where it comes down. |
| `hobgoblin` | approach, run | A leaping gait: airborne for most of the cycle on purpose. |

These are exemptions, not a lowered threshold — everything else is still held
to 0.25 m.

---

## 3. Surface work — what each of the 23 got

**Everything got the systemic fix** (`571de91`), because it lives in
`Rig.build`:

- **`RigBuilder.detailUV`** — every `Sculpt` primitive lays UV 0..1 across the
  whole part and no species passed a scale, so one tile of the shared hide map
  covered a Bloodhorn flank while the same tile covered a 0.4 m hoof: the torso
  came out as cottage cheese and the legs dead-smooth, on the same animal, from
  the same map. `detailUV` reads metres-per-UV-unit off the geometry itself,
  per axis, the way a tangent basis is derived, and rescales to a fixed
  `DETAIL_TILES = 7` tiles/metre. Tile counts are **rounded to integers**
  because u usually closes a loop around a limb and a fractional count puts a
  seam down the side of every leg.
- **`organicNormal`/`organicRoughness`/`metalNormal`/`metalRoughness`** in
  `EnemyBase.ts` rebuilt for that density — guard hairs / pores / folds, and
  brush / dishing / rivets / seams. Made periodic by cross-fading against
  shifted copies (`tileable()`): simplex and worley are not periodic and at 7
  tiles/m the seam repeats every 14 cm down every limb.

**Deep rebuild, verified by eye** (`571de91`, `c8fa679`):

| species | what changed |
|---|---|
| `sabertusk` | full re-value: dorsal saddle, ticked dun flank, cream throat/belly, black points on lower legs and tail, bandit mask through the eye with pale muzzle and cheek. Non-monotone limb radii. Eye 50 % bigger and much brighter. |
| `goblin` | local `paint()` per-vertex skin, lantern jaw + tusks + cheekbones, knobbly elbows/knees with pinched limb radii, torn rag wrap. |
| `irongiant` | warm oxidised palette, `roughness` 0.58->0.76 / `metalness` 0.4->0.22 / `normalScale` 0.22->0.65, local `aged()` rust streaking, greatsword ~50 % wider and thicker. |
| `dualhorn` + `bloodhorn` (shared prototype) | counter-shading corrected (it was inverted), fully articulated legs — elbow/carpus pinch, thin cannon, fetlock, pastern — black points, pale inner face. |
| `magitek_armour` | walk IK fixed (see section 1). Surface only via the systemic pass. |

**Systemic pass only, no per-species art** (17): `mt`, `voretooth`, `anak`,
`garula`, `coeurl`, `mesmenir`, `bandersnatch`, `deadeye`, `arachne`, `ronin`,
`axeman`, `sniper`, `bussemand`, `hobgoblin`, `necromancer`, `redgiant`,
`titan`.

---

## 4. This round's work, species by species

Everything below was captured and looked at. Shots live under `tmp/shots/`
(`tmp/` is git-ignored, so re-shoot rather than trusting they are still there).

| species | what changed | shot |
|---|---|---|
| **dualhorn**/**bloodhorn** | NaN fix. Was: brown hump, everything else black. Now a coherent brown bison-bull — flank, pale muzzle band, orange eye, counter-shaded belly, black lower legs. | `v1` → `v2/dualhorn.jpg` |
| **coeurl** | NaN fix, then re-marked. The tan "flank flashes" were two 0.15-wide gaussians that merged into one amber blot across the whole ribcage and read as a lens flare stuck to the animal. Now five broken bars; torso sweep 26→34 steps so they survive. | `v3/coeurl.jpg` |
| **voretooth** | NaN fix, then fully re-valued. It was a lilac-grey over an 82 %-value belly — a black-and-pink plastic toy at 6 m. Now a warm Leide hide, a saddle that reaches down the flank cut by cross bars, and a dark brow mask (the head is this species' whole read and was its least legible part). | `v3/voretooth.jpg` |
| **sabertusk** | Contrast, the open item from last round. The flank averaged a stop and a half off the saddle so the animal collapsed into one milk-chocolate silhouette. `FUR` 0x6f5e40→0x8b7750, `FUR_MID` 0x4c3e28→0x6b5936, `FUR_DARK` →0x1e180f, `BELLY` →0xc4b591. Dorsal, mask, cream throat and black points all read now. | `v2/sabertusk.jpg` |
| **garula** | Mane rebuilt (see below). Torso ring de-aliased. | `v8/garula.jpg` |
| **anak** | New `markings()` value pass. Half-lands — see section 5. | `v6/anak.jpg` |
| **all 7 daemons** | Albedo lift + Fresnel rim (see below). | `dn` → `dn2` |

### The garula mane — three rounds, and why

Worth reading before you touch any species that hangs geometry off a sweep.

The 26 mane locks were seeded on a *ring around the barrel* and aimed downward,
so every one of them lay across the **side** of the shoulder: 7 cm cones painted
`SHAG_LIT` (brighter than the hide behind them) and too thin to touch each
other. The animal wore two dozen hard ochre bars that read as claw marks — the
loudest defect on the whole roster, and the thing that made this look like a
`weatherCoat` bug when it was not.

Then: sinking them into the barrel traded that for three stray chips poking
through. Then two attempts at a topline crest, at 2.56 m and 2.74 m, stayed
buried.

**The measurement that ended it:** `rz` in a `sweep` node is the *vertical*
radius, so the barrel's topline is `p.y + rz` per node — and the mane term in
`shape` swells that by up to 26 % over the withers. That gives 3.45 m, which is
exactly the `top` column `creaturecheck` has been printing for garula all along.
The crest now interpolates a `RIDGE` table taken from the sweep's own node list.
**If you need to sit something on a sweep's surface, read `top` out of
`creaturecheck` first — it is a free, exact measurement.**

The crest reads now: a dark bristle ridge sweeping back over the withers,
breaking the silhouette. Still slightly sparse — sky shows between locks. Fatter
`r0` or 34 locks would close it.

### Daemon night readability — measured, and it was albedo

Section 5 of the old text asked whether this was exposure (`Sky`/`PostFX`, not
ours) or albedo (ours). **It is albedo.** Two measurements:

1. `tmp/shots/dn/bestiary_bussemand.jpg` — at 23:00 the terrain, grass, scrub
   and rock faces all read comfortably. The daemon standing in front of them is
   a flat black cut-out. The exposure is doing its job.
2. Isolation stage at the same hour: a **sabertusk** renders as a legible
   moonlit blue-grey with saddle and mask intact. The night rig lights a
   mid-value hide perfectly well.

The arachne's chitin sat at `0x131118` and its hair at `0x08080c` — 7 % and 3 %
reflectance, below anything that exists in nature and far under the ~30 % ground
it stands on. Every daemon lifted ~1.6×: hobgoblin, bussemand, arachne,
necromancer, mesmenir, ronin, red giant. Plus a **Fresnel rim**: new `rim`
option on `creatureMaterial`, patched into `enableVertexMaterial` right after
the vertex emissive. Fixed radiance, so it is invisible under the sun and is the
whole read at 23:00.

> **Watch the program cache key.** `enableVertexMaterial` now returns
> `'creatureVertexMatRim'` or `'creatureVertexMat'`. Sharing one key hands the
> rim shader to the entire roster, or the plain one to every daemon, depending
> on which compiled first.

Before/after: `tmp/shots/dn` vs `tmp/shots/dn2`. Draw calls unchanged at 567 on
`daemon_night` (budget 800); two extra shader programs.

---

## 5. Next steps, in priority order

1. **Anak needs a sculpt rebuild, not more paint.** It is 2,770 tris and the
   only species in the roster with **no `colorAt` anywhere** — it is built from
   `GeoKit` primitives with one flat `tint()` per part, which is why it is a
   single sheet of cream. The `markings()` pass added this round paints the
   three bands a gazelle has, and it only half-lands: the lateral stripe is
   largely occluded by the belly tube and the upper leg. Specific defects
   visible in `tmp/shots/v6/anak.jpg`: **legs end in round brown balls, not
   hooves**; the tail is a flat white card sticking out sideways; the
   shoulder/neck join is a visible box; the whole body is faceted. Port it to
   `CBuilder`/`sweep` the way `Sabertusk.ts` is built.
2. **Titan.** `tmp/shots/titan/bestiary_titan.jpg`. He reads better than the
   "boxy grey rock pile" note suggests — a dark basalt colossus with a spiked
   crown and a planted fist. But **a dozen `fissure()` wedges are floating free
   above the terrain**, in arcs around and in front of the hands, detached from
   the finger and palm geometry they are supposed to be rammed into. They are
   blinding orange rectangles hovering over dirt and they look like a UI glitch.
   The call sites are `Titan.ts:336`, `:342` (palm furnace), `:360`, `:361`
   (fingers) and `:368` — all positioned in absolute coordinates that no longer
   match the hand slabs. Fix by measuring the hand geometry, not by dimming
   them. His lower body is also one featureless matte-black mass.
3. **Coeurl and mesmenir are still boxy.** Both have a hard rectangular
   shoulder slab and a box neck where the sweep meets the limb blobs, and the
   coeurl's head is a dark blob with no eye read at 6 m. The value work on both
   is done; what is left is silhouette.
4. **Mesmenir** (`tmp/shots/v1/mesmenir.jpg`) — the blue flame mane and tail are
   genuinely good. The skull is a plain grey cylinder with a flat cut-off end,
   and the exposed ribs are painted-on cream ovals that read as decals.
5. **Voretooth head and neck** are still pale relative to the body; the mandible
   blades are the species' signature and barely register in `idle`. Worth a look
   in the `telegraph` pose specifically.
6. **`weatherCoat`'s `dust` has never been verified as visible.** Every organic
   species now passes it, but nothing in any capture obviously reads as ground
   dust up the legs. Either raise it or drop it — it costs a per-vertex branch
   on every species.

---

## 6. Gotchas and dead ends — read this before touching anything

- **`blend()`/`mix()` and `Color.setHex`.** `setHex` runs `Math.floor` on its
  argument, so passing a `THREE.Color` where a hex literal is expected yields
  `NaN` and the surface renders **black, silently, with no error anywhere**.
  `Sabertusk.ts` had exactly this in its head (`blend(blend(...), BELLY, ...)`)
  and the sabertusk's head has been black for as long as it has existed. I
  chased it for three capture rounds thinking my palette was wrong. `blend` in
  `Sabertusk.ts` and `mix` in `Goblin.ts`/`IronGiant.ts` now accept a Colour at
  either end. **Any other species that starts nesting these needs the same
  guard** — `Dualhorn.ts` has its own `mix` which already handles it.
  > **Correction, next round.** The last clause is wrong: `Dualhorn.ts` did
  > *not* handle it, and neither did `Coeurl.ts` or `Voretooth.ts`. All three
  > were rendering large parts of the body flat black. A type guard is also only
  > half the fix — see section 0. Blending now lives in `Palette.ts`.
- **Strided vertex sampling lies about depth.** See section 1, `poseFloor`. A
  480-sample stride over a 30k-vertex magitek under-reported by 0.33 m, which
  made the calibration curve produce a *wrong correction* that looked like a
  wrong pose. The two-pass refinement is load-bearing.
- **Calibration and runtime must see identical entry conditions.** The first
  version of `calibrateGround` measured from a fresh clone (bones at rest)
  while the tool measured a *pooled* instance carrying the previous pose's
  bones. Same pose, 0.33 m apart. That is why `restBones()` exists and why
  `calibrateGround` calls it per sample. If you add a calibrated pose, make
  sure every path into it rests the bones first.
- **Do not calibrate the gaits.** `groundLift` is indexed on `stateTime`;
  `approach`/`run` are driven by `gaitPhase`, so a curve read off `stateTime`
  would inject an arbitrary bob into the stride rather than remove a sink.
  `GROUND_CAL_POSES` in `EnemyBase.ts` documents this.
- **A creature that is meant to be underground needs `buriedBase`**, not a
  wider tolerance. Titan without it gets hoisted 3 m out of his arena by a
  correction that is doing exactly what it was asked to.
- **`RigBuilder.poseBoneMix` slerps from the *current* bone rotation** rather
  than being a per-frame absolute, so it converges instead of assigning. Only
  `MagitekArmour`'s battle-damage layer uses it and it saturates, so the
  behaviour is left alone — there is a comment at the site recording that a
  held pose therefore differs slightly from a live one.
- **Detail maps are baked lazily and shared.** `organicNormal()` etc. are
  module-level singletons in `EnemyBase.ts`; the `tileable()` wrapper costs 4x
  the noise evaluations, paid once on the first enemy build.
- **The capture daemon reboots on any source edit** (`sourceStamp()`), so a
  `--cold` round after an edit is ~13 s of boot before the first shot. Batch
  edits before capturing; I burned real time shooting one species at a time.

---

## 7. Cross-boundary items — reported, not edited

- **`bestiary_titan` catenary lines are still there** and still cross
  `bestiary_bloodhorn` — two black telegraph cables running the full width of
  the frame straight through the Titan's chest. Confirmed this round in
  `tmp/shots/titan/bestiary_titan.jpg`. Not in `src/characters/enemies/**`.
- **The party is now darker than the daemons at night.** In
  `tmp/shots/dn2/daemon_night.jpg` the four heroes in the foreground are the
  blackest shapes in the frame while the daemon pack behind them reads. Whoever
  owns `src/characters/Cast.ts` / the hero materials should apply the same
  measurement: compare hero albedo against the ~30 % ground.
- **`src/game/Shots.ts` ~726-732** — the `KNOWN BAD` comment on the Iron Giant
  shot is stale (repeat of last round's report; still unactioned).
- **`src/world/props/Grazer.ts`** — the ambient garula herds are still flat
  brown blobs with no coat, clearly visible in `bestiary_titan`. They bypass
  `RigBuilder`, so `detailUV`, `weatherCoat` and the rim never reach them.
- **`src/tools/creaturecheck.mts` is still not wired into any npm script.**
  Please add it; it is the gate for the whole grounding class of bug and it
  caught nothing this round only because nothing broke.

---

## 8. Gate status

| gate | result |
|---|---|
| `pnpm exec vite build` | **pass** (also enforced by `.githooks/pre-commit`) |
| `node src/tools/creaturecheck.mts` | **pass** — 207 poses, 0 failures |
| `node src/tools/integration.mts` | **pass** — 18 pass, 0 wired-but-unproven, 0 not integrated |
| `node src/tools/orphans.mts` | **pass** — 273 modules, 0 orphans (`MapRaster.ts` was deleted upstream) |

Draw calls measured at 505-567 across the daemon and titan shots; budget 800.
Triangle deltas this round: coeurl +288, garula +420. Two extra shader programs
for the daemon rim.

---

## 9. Reviewing a species without a bestiary shot

Only 13 of the 23 species have a shot in `src/game/Shots.ts`. The rest are
reachable through the dev suite's **isolation stage**, and it is far faster than
a corpus capture: `pnpm run dev`, `http://127.0.0.1:5410/?debug=1`, **F4**, then
`←→` asset, `↑↓` family, `,` `.` pose, `O` ok, `K` flag, `U` unreviewed.

For headless review this round used a throwaway script that drives the same
machinery — boot with `?q=ultra&debug=1` (**not** `shoot=1`; `src/main.ts:34`
hard-gates the dev suite off under the capture harness), wait for `window.DEV`,
then `DEV.reg.exec('assets on')`, `DEV.stage.spin = false`,
`DEV.browser.select(i)`, `GAME.settle(n)`, screenshot. It was left in
`tmp/creshot.mjs` — `tmp/` is disposable, so **rewrite it or promote it into
`src/tools/`**; a stage-capture tool is worth having permanently, because the
stage hides the world and shows you the model rather than the lighting.

Note the stage gives the subject a full sky hemisphere with no occluders, which
is exactly why a daemon reads on it and does not read in the world. Judge
*form* on the stage and *readability* in a real shot.
