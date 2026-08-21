# Handoff — `agent/enemies`

Owned: `src/characters/enemies/**`, `src/characters/rig/CreatureAnim.js`,
`src/characters/Enemies.js`, `tools/creaturecheck.mjs`.
Four commits on `agent/enemies`, branched from `main` @ `0be851f`.

| commit | what |
|---|---|
| `4a2721f` | the grounding **drift** fix + `tools/creaturecheck.mjs` |
| `c5b1c0f` | the 46 remaining **static** grounding failures |
| `571de91` | systemic surface pass: `detailUV`, rebuilt detail maps, sabertusk |
| `c8fa679` | deep rebuilds: goblin, iron giant, dualhorn/bloodhorn |

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
   from `Biped.js` and `Quadruped.js`. The older assign-style species set
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

## 2. `tools/creaturecheck.mjs` — the regression gate

**Please keep this wired into the check suite.** It is the gate for the whole
class of bug above, and it is what proves a sculpt change has not re-buried
anything.

```bash
node tools/creaturecheck.mjs                     # whole roster, every pose
node tools/creaturecheck.mjs --species sabertusk,irongiant
node tools/creaturecheck.mjs --hold 240          # frames to hold each pose
node tools/creaturecheck.mjs --tol 0.25          # fail above this |foot|, metres
node tools/creaturecheck.mjs --json out.json     # includes the calibration curves
PORT=5399 node tools/creaturecheck.mjs           # pick a free port
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
  `EnemyBase.js` rebuilt for that density — guard hairs / pores / folds, and
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

## 4. Gate status (all run on this branch, machine under load)

| gate | result |
|---|---|
| `npx vite build` | **pass** (also enforced by `.githooks/pre-commit` on all commits) |
| `node tools/creaturecheck.mjs` | **pass** — 207 poses, 0 failures |
| `node tools/integration.mjs` | **pass** — 18 pass, 0 wired-but-unproven, 0 not integrated |
| `node tools/orphans.mjs` | **1 orphan, not mine** — `src/world/map/MapRaster.js`, pre-existing on `main` @ `0be851f` |
| `node tools/combatloop.mjs` | **21/30 — pre-existing, not caused by this branch** |

**On `combatloop.mjs`: it is not 30/30 and it was not 30/30 before I started.**
I reproduced *exactly* the same nine failures with `git checkout 0be851f --
src/characters` in place, so no enemy change is implicated. The nine are
companion techniques, energy draw, spell craft, spell cast, raw elemancy,
nameplate HP, damage numbers, the Armiger gauge, and "kill an enemy -> EXP". The
diagnostic line on the nameplate check reads `menuOpen=true menusA=1.00
menu=controls`, i.e. **the controls menu is stuck open for the whole run**,
which plausibly explains most or all of the others (input is being eaten). That
is the thread to pull, and it is in `ui/**` / `game/**`, not mine.

---

## 5. Next steps, in priority order

1. **Chase the `combatloop.mjs` regression to 30/30.** Start from the stuck
   `menu=controls` in the nameplate check's diagnostic line. Owner: whoever has
   `src/ui/**`.
2. **Daemon night readability.** `bestiary_hobgoblin`, `bestiary_bussemand`,
   `bestiary_arachne` and `daemon_night` are near-black silhouettes with
   nothing but an eye glow to read. Decide first whether that is exposure
   (`Sky`/`PostFX`, not mine) or albedo (mine) — I did not get to measure it.
   Cheapest enemy-side lever: raise daemon albedo values and add a faint
   emissive rim, the way the iron giant's helm slit already works.
3. **Per-species art for the remaining 17**, in screen-presence order:
   `mt` (a thin dark stick at range, and it is in most Leide fights), then
   `axeman`/`sniper` (plate seams, rivets, panel wear), then `garula`/`anak`/
   `voretooth`/`coeurl` (coat pass plus head read), then `titan` (currently a
   boxy grey rock pile with orange seams).
4. **Sabertusk contrast is still soft.** The value structure is correct now but
   the flank is close to the saddle under a bright sun. Worth another pass with
   a wider spread between `FUR` and `FUR_DARK` in `Sabertusk.js`, checked in
   both a lit and a shadowed shot — I only ever checked a backlit one.
5. **Consider raising `DETAIL_TILES`** (`RigBuilder.js`, currently 7). At 7 the
   coat is convincing at 3 m but nearly invisible at 20 m. 9-10 would carry
   further; watch for shimmer.

---

## 6. Gotchas and dead ends — read this before touching anything

- **`blend()`/`mix()` and `Color.setHex`.** `setHex` runs `Math.floor` on its
  argument, so passing a `THREE.Color` where a hex literal is expected yields
  `NaN` and the surface renders **black, silently, with no error anywhere**.
  `Sabertusk.js` had exactly this in its head (`blend(blend(...), BELLY, ...)`)
  and the sabertusk's head has been black for as long as it has existed. I
  chased it for three capture rounds thinking my palette was wrong. `blend` in
  `Sabertusk.js` and `mix` in `Goblin.js`/`IronGiant.js` now accept a Colour at
  either end. **Any other species that starts nesting these needs the same
  guard** — `Dualhorn.js` has its own `mix` which already handles it.
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
  `GROUND_CAL_POSES` in `EnemyBase.js` documents this.
- **A creature that is meant to be underground needs `buriedBase`**, not a
  wider tolerance. Titan without it gets hoisted 3 m out of his arena by a
  correction that is doing exactly what it was asked to.
- **`RigBuilder.poseBoneMix` slerps from the *current* bone rotation** rather
  than being a per-frame absolute, so it converges instead of assigning. Only
  `MagitekArmour`'s battle-damage layer uses it and it saturates, so the
  behaviour is left alone — there is a comment at the site recording that a
  held pose therefore differs slightly from a live one.
- **Detail maps are baked lazily and shared.** `organicNormal()` etc. are
  module-level singletons in `EnemyBase.js`; the `tileable()` wrapper costs 4x
  the noise evaluations, paid once on the first enemy build.
- **The capture daemon reboots on any source edit** (`sourceStamp()`), so a
  `--cold` round after an edit is ~13 s of boot before the first shot. Batch
  edits before capturing; I burned real time shooting one species at a time.

---

## 7. Cross-boundary items — reported, not edited

- **`src/game/Shots.js` ~726-732** — the `KNOWN BAD` comment saying the Iron
  Giant shot is unfixable from there is **stale**. The shot works; the giant
  stands on the ground. Delete the comment.
- **`bestiary_titan` framing** — two black telegraph catenary lines run
  straight through the Titan's chest across the entire frame. The same lines
  cross `bestiary_bloodhorn`.
- **`src/world/props/Grazer.js`** — the ambient garula herds in
  `bestiary_sabertusk` and `bestiary_titan` are flat brown blobs with no coat.
  They do **not** go through `RigBuilder`, so `detailUV` did not reach them;
  the "grazers have no coat texture" note partly points here.
- **`src/world/map/MapRaster.js`** — orphaned module, `orphans.mjs` fails on
  it, pre-existing on `main` @ `0be851f`.
- **`tools/combatloop.mjs` 21/30** — see section 4. Pre-existing; the stuck
  `menu=controls` is the lead.
