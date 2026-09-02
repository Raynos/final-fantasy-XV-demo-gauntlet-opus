# Model Explorer — View Animations

Status: PROPOSED (2026-09-02, opus)

Built on `project/archive/plans/2026-09-02-fable-game-studio-v3.md`, whose
architecture — three boot profiles, **no game in the studio** — is not
negotiable here and is the constraint that shapes every lane below. Read
`project/handoff/game-studio.md` first; its five gotchas are still live and one
of them (`Freecam.apply` is a no-op while `enabled` is false) will make an
animation look broken when the animation is fine.

## 0. What is actually there today, measured

Nine facts, all of them read off the code rather than remembered. Six of them
contradict how the feature is described.

**0.1 · The hero rig is never ticked, so no hero pose has ever rendered.**
`ModelExplorer.applyPose` (`src/studio/ModelExplorer.ts:244`) calls
`m.character.play(pose, { hold: true })`, which sets `Animator.action`
(`src/characters/rig/Anim.ts:474`) and nothing else. The action is evaluated in
`Animator.evalAction`, reached only from `Animator.update`
(`src/characters/rig/Anim.ts:503`), reached only from `Character.update`
(`src/characters/rig/Character.ts:387`) — and **nothing in `src/studio/` calls
it.** `ModelExplorer.update` (`:265`) is `stage.update` plus `pinFacing`, and
`StudioShell`'s loop calls only that (`src/studio/StudioShell.ts:187`).
`Character.build` never ticks the animator either. So every hero in the Model
Explorer stands in the bind A-pose, and all seven `ACTIONS` entries and the
whole idle/breath/blink/contrapposto stack are dead.

The old `dev/AssetBrowser` — the thing v2 replaced — *did* tick it
(`src/dev/AssetBrowser.ts:263`: `m.character.update(dt, { speed: 0, velocity:
null, turnRate: 0 })`, and `:264` for NPCs). The rewrite dropped the one line
that made the pose visible. This is the single largest defect in the feature
and it is one call.

**0.2 · `ACTIONS` is seven combat clips, not an animation set.**
`src/characters/rig/Anim.ts:210` — `attack_slash`, `attack_thrust`,
`attack_overhead`, `guard`, `hit`, `cast`, `warp`. Each is an `Action`
(`:135`): a `dur`, a bone `mask`, and a list of `{ t, pose }` keyframes in XYZ
Euler radians. Keyframed, evaluable at any `t` by `evalAction` (`:949`), which
walks to the bracketing pair, `smooth`-interpolates and applies a blend
envelope. **Nothing in that path needs a game.** Walking, running, idling,
breathing and blinking are *not* in `ACTIONS` at all — they are the procedural
layers around it.

**0.3 · Locomotion is a parameter blend on one number, and that number is
`AnimState.speed`.** `Anim.ts:503-537`: `norm = speed / rig.dims.s`, four gait
parameter sets `IDLE_G`/`WALK_G`/`JOG_G`/`SPRINT_G` (`:33-47`) blended by
`norm`. `rig.dims.s = profile.height / 1.80` (`src/characters/rig/Skeleton.ts:95`).
The blend has **exact anchors**, which is what makes this instrumentable:

| gait | reached at | why |
|---|---|---|
| `IDLE_G` | `norm ≤ 0.25` | `moveW = clamp01((norm − 0.25)/0.85)` |
| `WALK_G` | `norm = 1.10` | `blendG(WALK_G, JOG_G, (norm−1.1)/1.1)` at t=0 |
| `JOG_G` | `norm = 2.20` | same expression at t=1, and the `else` branch at t=0 |
| `SPRINT_G` | `norm ≥ 5.20` | `blendG(JOG_G, SPRINT_G, (norm−2.2)/3.0)` at t=1 |

`Character.update(dt, { speed, velocity, turnRate })` is public and standalone;
foot IK is skipped entirely unless `st.terrain` is supplied (`Anim.ts:1053`,
`if (!terrain) return`), and a `GroundSampler` is a two-method interface
(`Anim.ts:163`) that a flat floor satisfies in one literal. **Walk, run and
sprint are fully reachable with no Player, no CameraRig and no Terrain.**

**0.4 · A hypothesis the gait anchors hand us for free.** `Player.walkSpeed =
3.6` and `runSpeed = 7.4` (`src/characters/Player.ts:170-171`). Noctis is
1.775 m (`src/characters/Cast.ts:73`), so `s = 0.986` and a *walk* is
`norm = 3.65` — which lands **48 % of the way from `JOG_G` to `SPRINT_G`**, and
a run is past the sprint clamp. `WALK_G` is reached at `speed = 1.08 m/s`,
which is NPC territory (`src/characters/npc/Npcs.ts` route speeds run 1.05 to
1.9). If that arithmetic holds when measured, the player has never used the
walk gait and the four parameter sets are really "NPC walk / unused / player
walk / player run". Lane A4 settles it with a number rather than leaving it as
a paragraph.

**0.5 · The enemy scrub value is not a phase, and it drives one clip in ten.**
`ModelExplorer.phase` is documented "Frozen animation phase, 0..1"
(`ModelExplorer.ts:105`) and initialised to `0.45` (`:127`). It is passed to
`Enemy.freeze(state, phase, ctx)` (`EnemyBase.ts:2015`), which assigns
`this.phase = phase` — and `Enemy.phase` is **"Animation clock, seconds. Never
resets"** (`EnemyBase.ts:496`). The units are wrong, and worse, three different
clocks drive three different clip families:

| clip family | driven by | reached by `freeze`'s `phase` argument? |
|---|---|---|
| `idle` | the `t` argument to `pose()` | **yes** |
| `approach`, `run`, `walk` | `anim.gaitPhase`, advanced by `stride(this._dt, this.moveSpeed, …)` (`Biped.ts:245`, `CreatureAnim.ts:319`) | no |
| `telegraph`, `attack` | `this.stateTime` via `attackEnvelope` (`Biped.ts:279`, `:299`) | no |
| `flinch`, `stagger`, `death` | `this.stateTime` via `hitCurve` / raw (`Biped.ts:317`, `:325`) | no |

`freeze` never touches `stateTime`. `repose(0)` passes `dt = 0`, so
`stride(0, …)` cannot advance `gaitPhase`, and `moveSpeed` is 0 on a
standalone instance (`EnemyBase.ts:740`) so the stride amplitude is at its
minimum anyway. **Today, moving the studio's scrub value changes exactly one
of the ten pose names, and the locomotion poses are frozen mid-nothing at zero
speed.** Both existing callers already know this and work around it by hand:
`src/tools/creaturecheck.mts:222` sets `e.stateTime = 0.42` *before*
`e.freeze(pose, 3.1)`, and `src/game/Director.ts:549-563` sets `stateTime`
separately for each of its three sabertusks.

**0.6 · `ENEMY_POSES` is a second copy and it is short by three.**
`ModelExplorer.ts:86` hard-codes seven names. The registry
`POSE_NAMES` (`EnemyBase.ts:65`) has **ten**: `run`, `walk` and `pounce` are
missing from the studio. `creaturecheck` already drives nine of the ten across
every species — its `expect` string is `'207 poses, 0 failures'`
(`src/tools/check.mts:231`), which is 23 species × 9 — so we know every species
answers all of them without throwing. The file's own header says counts are
read live because "three sources once said 8, 17 and 18 for the same list"; the
pose list is the one place in the file that did not get the memo.

**0.7 · The clip list is wider than `POSE_NAMES`, because two poses are
per-attack.** `POSE_PER_ATTACK` (`EnemyBase.ts:2082`) is `{telegraph, attack}`,
and `calibrateGround` already enumerates `` `${pose}:${a.id}` `` over
`this.attacks` (`EnemyBase.ts:1006`) for exactly this reason. `attacks` comes
off the type (`:722`), so it is on a standalone instance. There are 53 attack
definitions across 20 species files. A species' real clip count is
`8 + 2 × |attacks|` — about 13, against the 7 the studio offers.

**0.8 · The studio never calibrates ground, and the game always does.**
`Enemies.spawn` calls `e.calibrateGround()` once per species
(`src/characters/Enemies.ts:224`). `ModelExplorer._enemy` does not. `repose`
adds `groundLift(pose)` to `visual.position.y` (`EnemyBase.ts:2041`) and
`groundLift` returns 0 until the calibration has run (`:1042`). **Every
creature on the turntable is therefore posed at a different height than the
same creature in the game**, on exactly the settle poses (`idle`, `telegraph`,
`attack`, `flinch`, `stagger`, `death`) the calibration exists for. A reviewer
flagging a floating or sinking creature here is looking at a studio artefact.

**0.9 · `pounce` is a pose name no species implements.** Every `pose()` switch
— `Biped.ts:155`, `Quadruped.ts:210`, and the eighteen species overrides —
routes `run`/`walk`/`approach` to locomotion and falls through to `poseIdle` on
`default`. None has a `case 'pounce'`. `Director.ts:553` calls
`lunge.freeze('pounce', 3.1)` and separately writes `root.position.y += 1.15`,
which is where "airborne" actually comes from; `creaturecheck` lists `pounce`
in `AIRBORNE` and exempts it from the ground check. Offering `pounce` as a clip
is offering an idle in a different hat. Lane A2 lists it and marks it, from a
measurement, not from this paragraph.

## 1. The shape of the answer

One headless controller, `src/studio/ModelAnim.ts`, that owns the clock for
whatever is on the turntable, and two thin renderings of it. Nothing in
`src/characters/**`, `src/combat/**` or `src/game/**` is edited — every hook
this needs is already a public field or method, which §0 establishes call by
call. That is not a stylistic preference: BRIEF rule 2 makes two `shoot.mts`
runs byte-identical, the corpus is 166 shots, and a plan that touches `Anim.ts`
to add a studio feature is a plan that re-shoots the corpus to find out.

### 1.1 A clip is a name and a clock, and the clock is per family

```
ClipId          how the studio drives it                         seek by
enemy  idle             e.phase                                   assign
       walk|run|approach e.moveSpeed + e._dt -> anim.gaitPhase     assign gaitPhase
       telegraph:<atk>  e.attack = def; e.stateTime               assign
       attack:<atk>     e.attack = def; e.stateTime               assign
       flinch|stagger|death  e.stateTime                          assign
       (then, every frame: e.repose(dt, null))
hero   action:<ACTIONS key>  anim.action.t                        rest + step
       gait:idle|walk|jog|sprint  st.speed = s * {0, 1.1, 2.2, 5.2}  rest + step
npc    same as hero — NpcBody owns an Animator (NpcRig.ts:254, :273)
choco  gait:stand|walk|run   ChocoboAnim.update(dt, {speed,…})     converge + _ph
weapon reveal            Weapon.setReveal(u)                       assign
```

`e.repose(dt, ctx)` is exactly what the game runs on a frozen enemy
(`src/characters/Enemies.ts:449`), and it is safe to loop: `pose()` writes
through `poseBone`, which is `rest.copy().multiply(q)` — absolute, not
accumulating (`RigBuilder.ts:323`) — and `_resetVisual` clears the body
transform first (`EnemyBase.ts:2039`).

### 1.2 Seek is reset-plus-replay, never "drift forward"

Half the stack integrates: `Spring` (`Anim.ts:302`), five impact springs on
`CreatureAnim`, `THREE.MathUtils.damp` on `combatW`, `_speed`, `_gait`,
`_lean`, and `gaitPhase` itself. Landing on `u = 0.42` by dragging is not the
same state as landing on it by playing, and a URL that cannot reproduce a frame
is a URL nobody can file a bug against.

So seeking is: **restore the clip's origin, then advance a whole number of
fixed 1/60 steps.** Every family already has the origin call, and each was
written for this exact reason:

- heroes / NPCs — `Animator.rest()` (`Anim.ts:444`), whose own comment is *"A
  posed capture applied after five other captures therefore renders the same
  frame as one applied first"*.
- enemies — `freeze(clip, 0)` re-runs `restBones()` and `_resetVisual()`; the
  five impact springs take the `.reset()` loop `EnemyBase.ts:858` already
  spells out.
- chocobo — `ChocoboAnim.converge()` (`ChocoboAnim.ts:88`), written against
  the identical determinism bug on `Player.converge`.
- weapons — `setReveal` is a pure assignment; there is nothing to reset.

Playback uses the same fixed 1/60 accumulator, so a scrub, a play and a capture
all walk the same integer step sequence. Longest clip is under 3 s, so a worst
seek is ~180 `repose` calls — sub-millisecond territory, to be confirmed by
A6's instrument.

### 1.3 Clip length is measured, not tabulated

Some durations are stated by the data — `_timing('telegraph')`,
`_timing('attack')`, `_timing('recover')` (`EnemyBase.ts:1436`),
`type.staggerDuration`, `Action.dur`. Others are buried in per-species
constants: `hitCurve(this.stateTime, 0.34, 0)` in `Biped.poseFlinch` and
`0.35` in `Quadruped`'s. Tabulating those in `src/studio/` recreates
`ENEMY_POSES` with better manners.

Instead: on first open of a (subject, clip), step from the origin at 1/60 and
watch the drawn bounding box; the duration is where it stops changing (Δ <
1e-4 m held for 0.2 s), clamped to [0.05, 8]. Where the data states a length,
that value is used and the probe is skipped. The measured table is printed by
the gate, so it is a number in the log rather than a constant in a file.

## 2. Lanes

Each lane is one concern, one commit, one instrument. None touches `Game.ts` or
`Shots.ts` (BRIEF rule 4), and none touches `src/characters/**`.

### A1 · The tick that was never there

Add `ModelAnim`, and call it from `ModelExplorer.update` before `pinFacing` —
before, because `Animator.update` ends with `char.root.updateMatrixWorld(true)`
(`Anim.ts:546`) and `footIK` reads world matrices after it, so a facing pin
written afterwards leaves the matrix a frame stale. Widen the `Made` union
(`ModelExplorer.ts:69`) from `plain` to `npc | weapon | chocobo` so the driver
can dispatch; `dev/AssetBrowser` already carried a `kind === 'npc'` arm.

**Instrument.** `studiocheck`: select `noctis`, read
`character.rig.byName.spine03.quaternion`, play `action:attack_slash` to
u = 0.4, read again. Assert the angular delta > 0.15 rad. Report the same
number for the current build in the same run — it is exactly **0.000**, and
that zero is the lane.

### A2 · The clip list comes from the registry, always

Delete `ENEMY_POSES` (`ModelExplorer.ts:86`). `clips(subject)` is computed on
the live object: `POSE_NAMES` for an enemy, expanded over `e.attacks` for the
two names in `POSE_PER_ATTACK`; `Object.keys(ACTIONS)` plus the four gait
entries for a hero or an NPC; three gait entries for a chocobo; `reveal` for a
weapon.

Mark, do not hide, the clips a subject does not really have: `pounce` resolves
to `poseIdle` on every species (§0.9) and a clip that is secretly an idle must
say so in the row rather than be quietly dropped — dropping it is how the
studio would come to disagree with `creaturecheck`, which drives it.

**Instrument.** Three assertions. (a) The enemy clip list for every species is
a superset of `POSE_NAMES`, computed in the page from `POSE_NAMES` itself, not
from a list retyped in the gate. (b) `clips('sabertusk').length === 8 + 2 *
e.attacks.length`. (c) A source assertion in the same style as `anycheck`: no
string literal from `POSE_NAMES ∪ Object.keys(ACTIONS)` appears anywhere under
`src/studio/`. The gate prints total clips across the roster, before and after;
the before is 7 per enemy and 7 per hero, and the heroes' seven do not render.

### A3 · One normalised `u`, mapped onto whichever clock the clip actually has

Replace `ModelExplorer.phase` with `ModelAnim.u`, 0..1, mapped per §1.1 and
§1.3. This is the lane that makes the existing scrub value mean anything: today
it moves `idle` and nothing else (§0.5).

**Instrument.** For every species × clip, sample the drawn bounding box at
u = 0, 0.25, 0.5, 0.75 and count clips with ≥ 2 distinct boxes — *"clips that
move when you scrub them"*. Assert ≥ 95 % after; print the before. The
predicted before is 1 of 10 pose names per species (`idle` only) and 0 of 7
hero actions, so the expected reading is roughly **23/230 → ≥ 300/306**. If the
before is not ~10 %, §0.5's reading of the three clocks is wrong and this lane
stops until it is understood.

### A4 · Locomotion, at the anchors the blend actually has

Walk / jog / sprint as three gait clips per hero and NPC, driven by
`st.speed = rig.dims.s × {1.1, 2.2, 5.2}` (§0.3) — the anchor speeds, so the
studio shows the *parameter set* rather than an arbitrary blend of two. A
flat `GroundSampler` (`{ heightAt: () => 0 }`) is passed as `st.terrain` so
foot IK runs and the feet plant; without it the solver returns immediately
(`Anim.ts:1056`) and a walk floats. Enemies get locomotion by
`e.moveSpeed = type.stats.speed × {0.35, 1.0}` with `e._dt = dt`, which is what
makes `stride()` advance `gaitPhase`. Chocobo gets stand / walk / run from
`ChocoboAnim`'s own `speed / 5.5` gait blend (`ChocoboAnim.ts:98`).

**Instrument.** Two numbers. (a) At each anchor, assert `anim.g` equals
`WALK_G` / `JOG_G` / `SPRINT_G` field-for-field within 1e-9 — an exact
assertion, because the blend arithmetic is exact. (b) Print `norm` for
`Player.walkSpeed` and `Player.runSpeed` against each of the four heroes, and
the gait blend fraction each lands on. §0.4 predicts the walk sits ~48 % of the
way from jog to sprint and that `WALK_G` is unreachable at player speeds. That
prints as a table whichever way it comes out, and a **measured negative is a
result** — if it holds, it belongs in the standing backlog as a gameplay
finding, not fixed from a studio plan.

### A5 · The transport, on both shells

`Transport` state lives on `ModelAnim` — `playing`, `u`, `rate`, `loop` — and
both shells render it, the way `ShotGallery` / `LookLab` / `DeviceReport`
already work.

**Desktop** (`src/studio/desktop/Shell.ts`, extending the `onKey` block at
`:592`): `Space` play/pause, `,` / `.` step one 1/60 frame, `[` / `]` clip
(already bound to `stepPose`), `-` / `=` rate, `Shift+drag` on the scrub bar for
fine seek. The bar goes in the `st-ctl` row beside the pose stepper (`:501`)
and reads `u`, seconds and the measured duration. Every key is also a clickable
control — the shell's own rule at `:35`, *"the keyboard accelerates rather than
gatekeeps"*.

**Mobile** (`src/studio/mobile/Shell.ts`, in `drawModelSheet` at `:382`): a
transport row of `<button>`s — every one a real `<button>`, per gotcha 5 — at
≥ 44 px, then a **full-width scrub band** ≥ 48 px tall. This is not the control
`LookLab.ts:28` rules out: that objection is to *"a drag inside a 44 px track
over a 24-hour range"*, and this track is the whole 390 px width over a ≤ 3 s
clip — about 8 ms of clip per pixel. Rate is chips (`.st-chips`, `:539` in
`studio.css`), because a rate has five useful values and no in-between.
The band lives in `.st-sheet`, which is a sibling of `.st-grab`
(`mobile/Shell.ts:191-195`), so a scrub drag never reaches the orbit handler.

**Instrument.** `studiocheck`'s phone phase, tapped through the real DOM:
tap play, settle 500 ms, assert `u` advanced by 0.5 s × rate ± 15 %; tap pause,
settle, assert `u` unchanged to 1e-9. Assert every new control's
`getBoundingClientRect()` is ≥ 44 px on both axes, and that the scrub band is
≥ 320 px wide. Desktop: dispatch `Space`, `,`, `]` and assert the state each
one changes.

### A6 · Determinism, and a URL that names a frame

Fixed 1/60 accumulator. Seek is reset-plus-replay (§1.2). Deep link
`?studio=1&m=<family>/<key>&clip=<id>&u=<0..1>&paused=1`, read in
`StudioShell` where the section is opened — `main.ts:81` already routes
`?studio` and already refuses it under `?shoot` (`main.ts:74`, *"`?shoot=1&studio=1`
opens nothing"*), so the shoot guard costs nothing new and only has to be
re-asserted. `Thumbs` captures whatever frame is on screen
(`StudioShell.ts:195`); it must only fire while paused at the clip origin, or
every tile in the grid is a different random moment of a different stride.

**Instrument.** Four. (a) Seek to the same `u` from two different histories —
once from 0, once after playing to 0.9 and dragging back — and assert the max
angular difference over every bone is < 1e-6, across the whole roster × clips.
(b) `?shoot=1&studio=1` boots 0 systems and no `#studio` element, unchanged.
(c) `pnpm run shoot` twice, byte-identical, per BRIEF rule 2 — this lane's real
guard is that nothing under `src/characters/**` was edited, and the diff proves
it faster than the corpus does. (d) A deep link is opened cold and the resulting
bone set matches the same state reached by hand, to 1e-6.

### A7 · Calibrate the ground, so the turntable poses what the game poses

`ModelExplorer._enemy` calls `e.calibrateGround()` after `attachVisual`, as
`Enemies.spawn` does (`src/characters/Enemies.ts:224`). It is a per-**type**
cache (`type._groundCal`), so it is paid once per species per session, the same
as the prototype cache the file already reproduces.

**Instrument.** Per species, at clip `death`, u = 1: assert
`type._groundCal` is populated and that `groundLift('death')` is non-zero for
at least the species `creaturecheck` records a curve for. Print the measured
`visual.position.y` delta between the calibrated and uncalibrated studio — that
number is how far every creature review to date has been off. And time
`calibrateGround()` for the worst species (Titan, 2 attacks × 12 samples), and
assert the selection frame it happens in stays under 100 ms.

### A8 · The three families that report `poses: () => []`

The brief asks whether that is true or unimplemented. Measured, per family:

- **NPCs — unimplemented, and it is the cheapest lane here.** `NpcBody`
  *implements `AnimTarget`* and constructs its own `Animator`
  (`NpcRig.ts:154`, `:254`), with `update(dt, state)` at `:273`. It has every
  `ACTIONS` clip and the entire gait, identically to a hero. `poses: () => []`
  in `ModelExplorer.ts:138` is simply wrong. NPCs get the hero clip set.
- **Chocobo — unimplemented.** `ChocoboAnim` (`src/characters/chocobo/ChocoboAnim.ts:54`)
  is `new ChocoboAnim(rig, visual)` + `update(dt, { speed, turnRate, effort,
  ridden, normal })` and reads no game at all. `buildChocoboPrototype` returns
  `{ ...built, rig, colours }` (`ChocoboRig.ts:816`) where `rig` is the
  `RigBuilder` — which has `byName` and `rest`, i.e. it *is* a `PosableRig`
  (`RigBuilder.ts:298`). `ChocoboSystem._makeBird` builds one the long way only
  because it clones per instance (`ChocoboSystem.ts:241-267`); the studio has
  one bird and can pass the prototype's own rig. Three gait clips, plus
  `effort` and `ridden` as toggles and `turnRate` as a lean. One caveat:
  `ChocoboAnim` writes `visual.position.y` and `visual.rotation.x/z`
  (`:148-151`), so the group must be parented under a wrapper rather than
  staged directly, or the bounce fights `_chocobo`'s `position.set(0,0,0)` and
  `ModelStage`'s framing.
- **Weapons — true, and it is one clip, not none.** `Weapon` has no per-frame
  animation; its only animated property is `setReveal(0..1)`
  (`src/combat/Weapons.ts:838`), the warp-in materialise, which drives a shader
  uniform and is a perfect scrub axis. One honest clip, named `reveal`. The
  swing arcs in `WEAPON_CLASSES` belong to the wielder, not the weapon — see
  A9.

**Instrument.** After the lane, `families_()` reports non-empty `clips` for
five of five families, and A3's "clips that move when you scrub them" covers
NPCs, chocobo and weapon `reveal` at the same ≥ 95 %.

### A9 · The measured negative: the player's combat body is not reachable, and here is the price

`ACTIONS`' seven clips are the **companion and NPC** combat layer. What the
player actually does on screen is `CombatAnim`
(`src/characters/rig/CombatAnim.ts:77`), and it is not reachable from the
`none` profile:

- its constructor takes `game` and resolves `game.get('Combat')` and
  `game.get('Player')` (`:92-95`);
- `lateUpdate` returns immediately without both plus `player.character`
  (`:126`);
- the swing *is* the weapon anchor — `poseSwing` reads `combat.comboStep` and
  `weaponIK` solves a two-bone IK onto `combat.weapon.root` (`:213`, `:471`).
  There is no arc without a `CombatSystem` computing one.
- `poseDodge`, `poseWarp`, `posePhase`, `poseStasis`, `poseParry`,
  `poseLanding` and `poseHitstop` all read `combat.state` and `combat.stateTime`.

**Cost to reach it.** A fourth boot profile carrying `Player`, `Collision`
(`Player.ts:180` registers one), `Combat`, and — because `CombatSystem`
resolves them in `init` (`CombatSystem.ts:324-327`) — `VFX`, `Enemies` and
`Terrain`. That is six or seven systems, it puts a `Player` object into the
scene, and it fails `studiocheck` assertion 2 ("model explorer boots no game
systems") and assertion 3 ("no character or enemy object in the model scene") —
the two counts that *are* the studio's architecture, and the exact thing v2
exists to have deleted. **Declined.** The Shot Gallery already declines
`follow` shots on the same reasoning and says why in the row
(`project/handoff/game-studio.md`, "What is not built"); the animation view
does the same — the combat clips are listed, dimmed, with the sentence *"the
player's swing follows the weapon anchor, and there is no combat system here."*

**What is reachable and worth doing instead:** stage a hero with a `Weapon` in
`character.attach.handR`. `_palmSocket` is built in `Character.build`
(`Character.ts:266`), `new Weapon(key)` is standalone, and `setGrip`
(`Character.ts:315`) closes the fist — all three with no game. The seven
`ACTIONS` then play with a blade in hand, which is most of what a reviewer
wants from "combat animation" and costs zero systems.

**Instrument.** Assert the dimmed rows exist and carry the reason string;
assert `window.GAME.systems.length === 0` with a weapon staged in a hero's
hand; assert the weapon's grip origin is within 2 cm of the palm socket's world
position.

## 3. Order

A1 first and alone — it is one call, and until it lands nothing about the hero
half of this feature can be seen or measured. A3 next, because A2's clip list
is meaningless while nine of ten clips ignore the scrub. Then A2, then A7 (it
changes what every enemy frame looks like and should land before anyone
re-reviews the roster). A4 and A8 are independent of each other and can be
taken in either order. A6 before A5, so the shells are built against a
transport that already seeks deterministically rather than one retro-fitted to.
A5 last, both shells in one pass. A9 is a paragraph and an instrument, not a
build.

## 4. Risks

**The biggest one: three clocks, and only the enemy family is documented.**
§0.5 is the load-bearing finding in this plan and it was assembled by reading
`Biped.poseTelegraph` and `Quadruped.poseLocomotion` line by line. Eighteen
species override `pose()` and any one of them may read a fourth clock the base
classes do not. A3's instrument is designed to catch precisely that — a clip
that does not move when scrubbed fails, whatever the reason — but the *fix* for
a rogue species may be per-species and is not budgeted here. **Mitigation:**
run A3's box-sampling probe as the first thing built, before any UI, over all
23 species × all clips, and read the failure list before committing to A5's
scope.

**Second: `calibrateGround` inside a selection frame.** It re-poses the whole
skeleton 12 times per pose per attack and reads the mesh. Titan is the worst
case. A7's instrument times it; if it exceeds the 100 ms budget it moves to a
yielded task and the first frame of a newly-selected creature is uncalibrated,
which must then be visible in the readout rather than silent.

**Third: gotcha 1 will fire again.** `ModelStage.update` returns early unless
`spin` or `_needFrame` (`ModelStage.ts:205`), and `Freecam.apply` no-ops while
`enabled` is false. The first time a playing animation "looks wrong", check the
lens before the rig — that is what cost v3 two findings that were one bug.

**Fourth: thumbnails.** A grid of tiles each captured at a random frame of a
random clip is worse than an empty grid. A6 pins the capture to a paused
origin; if that turns out to make tiles never appear (because a reviewer never
pauses), the fallback is to capture on selection, before the transport starts,
and never again.

## 5. Definition of done

Written against instruments. No dates.

- `pnpm run check` green, with `studiocheck` extended by every assertion above
  and its `expect` string in `src/tools/check.mts` updated to the new count.
- **Clips that move when scrubbed ≥ 95 %** of every (subject, clip) pair in the
  roster, sampled at four `u` values by bounding box (A3). The same number is
  printed for the pre-change build in the same run.
- **Hero bone delta > 0.15 rad** between `u = 0` and `u = 0.4` of
  `action:attack_slash` on `noctis` (A1). Today: 0.000.
- **Gait anchors exact**: `anim.g` matches `WALK_G` / `JOG_G` / `SPRINT_G`
  within 1e-9 at `norm` = 1.1 / 2.2 / 5.2, and the `Player.walkSpeed` /
  `runSpeed` blend table is printed for all four heroes (A4).
- **No pose-name literal under `src/studio/`**, and the enemy clip list is a
  superset of `POSE_NAMES` read from the page, for all 23 species (A2).
  `ENEMY_POSES` is deleted, not commented out.
- **Seek reproducibility < 1e-6** max angular bone difference between two
  arrivals at the same `u` from different histories, across the roster (A6).
- **`?shoot=1&studio=1` boots 0 systems and renders no `#studio`**, and
  `pnpm run shoot` is byte-identical over two runs (A6). The diff touches no
  file under `src/characters/`, `src/combat/` or `src/game/`.
- **Every new mobile control ≥ 44 px** on both axes under a real iPhone
  descriptor, driven by real taps; the scrub band ≥ 320 px wide; play advances
  `u` and pause stops it, both measured (A5).
- **All five families report a non-empty clip list**, and the reason a weapon's
  is exactly one is in the row, not in this file (A8).
- **`type._groundCal` populated for every staged species**, and the
  studio-vs-game `visual.position.y` delta at `death` is under 1 mm; the
  pre-change delta is printed (A7).
- **The combat rows that cannot exist are listed, dimmed, and say why**, with
  `systems.length === 0` asserted while a hero holds a weapon (A9).
- `studioshots.mts` frames on both descriptors show a hero mid-stride with feet
  planted and a creature mid-telegraph, and `docs/plans/` has this file moved
  to `project/archive/plans/` with its `Status:` line updated.
