# content-wire — phase 4, the quest chain and the verbs

Owner: content agent, worktree `agent-a8b20380c9b8154e3`, `PORT=5450`.
Contract: `docs/plans/2026-08-22-opus-phase4-content-and-gameplay.md`.
Predecessors in this lane, all of whose work is still true and still passing:
`agent-a430ca1362dc1cf7e` (the quest chain), `agent-a7340f8d11756a846`
(WS-4/WS-5) and `agent-af853a3898f7c38cd` (WS-0/WS-1). **Do not re-audit
whether the RPG layer is orphaned, whether the E key works, whether the main
line reaches chapter 5, or whether the pre-8 km coordinate tables were fixed.**
They were.

---

## 1. The headline

**The game has a non-combat verb.** Ten `type: 'fishing'` POIs have been on the
map since it was authored — a jetty, a tackle shack and a boat built at each by
`PoiKits._fishing`, three species named in each one's `does:` line — and not
one of them did anything. The lane before this one cut the `fish` objective
rather than tick it off a keypress, on the grounds that "a `fish` objective
that ticks off a keypress is not fishing, it is a lie with a trout in it". That
was right, and this is the thing it was waiting for.

Four other things went with it: dungeon doors that stood up to 2.8 km from
their own map pins, a complete Elemancy model with no screen, `BossFight.
resolveStrike` executing for the first time in its life, and a way to
photograph anything a probe can drive.

Eight commits, `527fe72..4dc4e2b`. **`npm run check`: 11/11 green** on a tree
with nothing else running. `integration` **27** (up from 26, with the new one
ablated -- §9), `combatloop` 31/31, `uxcheck` 93/93, `anycheck` 0,
`questaudit` 0 unsatisfiable objectives, `mainchain` chapter 1 to the end of
chapter 5, 0 failures.

## 2. Fishing

`src/game/fishing/` — `Fishing.ts` (the system), `FishTable.ts` (the species
and the holes), `FishingHud.ts` (the overlay), `fishing.css.ts`.

**Where it lives.** Owned and ticked by `RpgSystem`, exactly like `HavenCamp`,
for exactly the same reason: `Interaction` boots six systems after `Rpg`, so
the handles cannot be taken in `init()` and are taken on the first frame
instead. `Game.ts` is the coordinator's file and a new system cannot register
itself there. `RpgSystem.lateUpdate` is new and exists for two reasons named in
§8.

**The loop.** `cast → flight → wait → bite → fight → landed | lost`.

- **cast** — hold `E`; a power meter sweeps 0 → 1 → 0 at 0.85/s and release
  picks the distance. Far water bites sooner and rolls toward the rare end of
  the hole, so a full-power cast is a timing skill with a payoff.
- **wait** — striking at nothing costs you the wait over again. That is the
  only thing that makes waiting a decision rather than a loading bar.
- **bite** — 0.85 s on `E`.
- **fight** — the fish alternates runs and rests. Reeling through a run loads
  the line fast enough to break it; reeling through a rest is nearly free.
  `A`/`D` lean the rod: against a run bleeds tension and tires the fish faster,
  with it loads the line. Past 0.82 tension a strain timer runs and running it
  out parts the line. A third of runs start as a **surge** — telegraphed on the
  frame it begins — which is the reason to leave headroom on the gauge. Below
  0.06 tension a **slack** timer runs and the hook comes out.

The catch is an **ingredient in the bag**. Ten new fish joined `INGREDIENTS`,
every one of them a name the map was already advertising. Landing one banks
EXP, pays the `fishing` activity that had sat in `AP_RULES` since the Ascension
grid was written with nothing ever calling it, and notifies `fish`.

### 2.1 The difficulty curve, because it is a measurement

`tmp/fishtune.mts` plays all eleven species twelve times against five ways of
playing. The **first** run said the minigame was solved — `skilled` landed
12/12 on everything, because tension was a perfectly predictable integrator and
"reel under 0.6, lean against the run" could never lose. Three changes fixed the
shape, and each was measured before and after (see `a0e097d`). Where it landed:

| way of playing | result |
|---|---|
| **mash** — hold the reel down | 0/12 on every species, in 1.4–1.8 s |
| **idle** — never reel | 0/12: slack, or spooled on the Devil |
| **timid** — reel only on rests, never watch the gauge | 0/12 |
| **reads the gauge, leans against runs** | lands everything: 10 s for a trout, 36 s for the Devil of the Cygillan |

So every way of *not* playing it loses and learning it is what wins. That is
the right shape for a demo; it is not a twitch test. **A disciplined player
will not lose a fish**, and if that is wrong for the game it is one number —
the surge probability at `Fishing._tickFight`.

### 2.2 Three holes, not ten, and why

`Water` is a **single global plane at y = -6.5**. A basin below it gets a
surface and everything else is dry ground, so a fishing pin standing at 68 m of
elevation can never have water under it no matter what its `does:` line says.
`probes/fishwater.mts` prints the survey:

```
galdin_pier          14.1 m   waterline 70 m out    sea_bass, allural_sea_bass, murk_grouper, barramundi, sea_bream
alstor_dock          -2.2 m   waterline 26 m out    alstor_trout, alstor_bass, chocobo_carp
vesperpool_dock      13.3 m   waterline 19 m out    vesper_gar, pink_jade_gar, cygillan_devil
caem_shore           95.0 m   DRY -- no water within 170 m
crestholm_reservoir  88.7 m   DRY
swainsmere           68.4 m   DRY
malacchi_pond        20.0 m   DRY
archaeans_mirror     38.4 m   DRY
maidenwater          39.2 m   DRY
rachsia_bridge      126.4 m   DRY
```

`Fishing._survey` walks 36 rays out from each pin, finds a genuine waterline
within 170 m, stands the player on the bank facing the water, and **drops a pin
it cannot find water for** rather than registering a rod over dry rock.

**This is the biggest open content question in the lane and it is not mine to
answer.** Two fixes, both outside `src/game/fishing/`:

1. **Per-basin water levels in `src/world/Water.ts`.** The surface is one flat
   quad at `this.level` and `surfaceAt` is a bounding-box test. A `WaterBody`
   already carries its own `cx/cz/w/d`; giving each its own `level` would let a
   tarn sit at 68 m. It is the honest fix and it is a rendering job.
2. **Move the seven pins onto the four water bodies** in `WorldMap.ts`. Cheap
   in principle — fishing POIs contribute nothing to the corridor field or the
   settlement pads, so the heightfield does not change — but **`WorldMap.ts` is
   in `bake.mts`'s `SOURCES`, so editing it invalidates the terrain cache**,
   and the cache is a symlink shared by every worktree. Do it from `main`, with
   a re-bake, on a quiet tree, or not at all.

Meanwhile the bream and the barramundi were **moved from Caem to Galdin** —
they are sea fish, Galdin is the sea, and at Caem they had no source at all and
their two recipes were unreachable. The Caem entry stays in `HOLES` for the day
that shoreline gets water.

### 2.3 What it feels like, having played it

Better than expected, and the reason is the run/rest rhythm rather than the
gauge. The moment it works is watching the chevron flip and getting off the reel
before the tension does — that is a real read, and the surge makes greed cost
something. It is *not* tense on a trout: ten seconds, two rests, done. It is
tense on a gar.

The weakest part is **the wait**. 1.5–5.2 s of a bobbing float with nothing to
do is the right length in a game with ambient sound and water noise, and here
it is nearly silent — the cues are `ui` and `warp` borrowed from the SFX bank.
A proper reel-click, a splash and a line-out whine would carry it.

### 2.4 What is verified, and how

- `probes/fishwater.mts` — the survey, plus "every catch is a cookable
  ingredient" and "the party starts with the Tranquility Rod".
- `probes/fishloop.mts` — **the whole loop on real key events**: walk up, hold
  E, watch the meter run, release, watch the float settle, strike early and pay
  for it, take the bite, play the fish properly and land it, find it in the bag
  as an ingredient, then cast again and lose one by mashing the reel. 18
  checks, all passing.
- **`integration`'s new `a fish can be caught and cooked with`** — the same
  loop, folded into the gate suite, and **ablated**: comment out the
  `inventory.add` in `Fishing._land` and it reports `landed, but the bag went
  0 -> 0` while the other 26 stay green. Three checks were found passing on
  lies last session; this one is not one of them.
- Looked at all six stages (`tmp/shots/fish6/`). §8 lists the six defects that
  only the pictures found.

One thing worth knowing about writing gates here: the fishing check resets the
play state before it runs (`Director.play`, no screen, no cutscene, HUD out of
menu mode). Twenty-five probes run before it, any of them can leave a screen or
a paused Director behind, `Interaction` suppresses the verb for all three, and
the resulting failure reads as a broken rod. That is exactly what its first run
reported.

## 3. Dungeon doors

All three carried literal `x`/`z` written against the 3 km world:

```
keycatrich  pin (110, -1460)   door (-113, -229)   1 251 m apart
balouve     pin (2784, 1146)   door (294, -232)    2 846 m apart
fociaugh    pin (-1720, -1420) door (110, 356)     2 550 m apart
```

`EntranceDef` carries a `poi` id now; `entranceAt` resolves it through
`WorldMap` and **throws** on an unknown id or a POI that is not a dungeon. All
three are 0–1 m from their pins, and `probes/dungeondoor.mts` **asserts** that
rather than printing it — the old numbers were printed every run and stayed
quiet for months.

**`origin` deliberately did not move.** Twelve authored shots in `Shots.ts`
frame these interiors by absolute world coordinate. Nothing requires the two to
agree (a fade, a redirected `heightAt`, interior-built daylight, and no frame
ever containing both) and there is a note on `KEYCATRICH.origin` saying so.

One rough edge, measured: **Fociaugh's approach grade is 1.26** where the other
two are 0.13 and −0.25. The cave mouth is walkable and the probe enters, loots
and leaves through it, but the kit does not cut itself a shelf and the old flat
site was kinder to it. Keycatrich has a dead tree growing through the middle of
its ramp — the entrance kit does not suppress vegetation on its pad, which was
invisible while the door stood in open badlands.

## 4. Elemancy

`RpgSystem.craftSpell` was called from exactly one place in the repository:
`src/tools/combatloop.mts`. `side_elemancy_lesson` passed the quest audit
because both `draw` and `craft` have notifiers, and was uncompletable in play.

`src/ui/screens/ElemancyScreen.ts` is the door: four rows (fire, ice,
lightning, catalyst), arrow keys dial them, and the right-hand panel is
`elemancy.preview()` recomputed every frame against Noctis' live Magic stat.
Enter spends real energy and a real catalyst through `RpgSystem.craftSpell`.
Added to `ScreenMap`, to `FOOT`, and as a row in the pause menu.

`probes/elemancydoor.mts` drives it on real keys: stand at the Hammerhead Verge
deposit, press T fourteen times (0 → 53 fire), open the pause menu and read the
row labels off the DOM, open the screen, arrow to 30 units, press Enter. Out
comes a Fire with 3 casts in quick-cast slot 0. Eleven checks, all passing.

**Still missing, and reported rather than built.** The *draw* half has a door
but an invisible one. `KeyT` draws from any deposit within 12 m; the twelve
deposits have no geometry of their own — they sit on existing POIs and are
found by standing in the right place and guessing. A "Draw" prompt would fix
discovery, but **a prompt with no visible subject is the phantom-prompt defect
a blind judge ranked 2nd of eight in the corpus**, so it wants a visible vent
first: a low ring of scorched/frosted rock with an emissive core and motes
tinted by element, built on approach at 420 m the way `Npcs.REMOTE` is. That is
about 60 lines in `src/world/props/` plus a `DepositDraw` installed off
`RpgSystem` next to `Fishing`. **This is the next content job.**

## 5. Titan's fist

`BossFight.resolveStrike`, `slamAt` and `_handPos` had been in the tree for
months, typed, compiling, and never once executed. One line was missing:
`EncounterDirector.resolveStrike` now gives the active boss fight first
refusal. `BossFight.resolveStrike` returns true only when it really handled the
blow, so every ordinary enemy still falls through to the generic sweep.

`probes/titanfist.mts` measures it through `Enemies.onStrike` — the live route
`EnemyBase` uses on the active frame:

```
hand is 13.1 m from the root; the generic sweep reaches 14.0 m from the root
BossFight.resolveStrike claimed the blow 1x
slamAt ran 1x, 0.00 m from the hand
Noctis, standing under the fist: 4877 -> 4365 HP
an ordinary enemy still falls through to the generic sweep
```

**Delete the `BossFight.resolveStrike` row from `LANDMINES.md`'s dead-code
table.** `CameraRig.setLockOn` is still dead and still correct there.

## 6. `probe.mts --shot`, and what it does to §7.3

The old §7.3 said a live staged fight cannot be photographed: `framecam`
applies its shots *after* the probe returns and `applyShot` runs a Director
scenario that clears the encounter, so every attempt came back as empty grass.

`node src/tools/probe.mts <probe> --shot out.jpg` grabs the frame **where it
stands**, with no shot applied, and `await window.__shot('name')` from inside a
probe grabs it mid-run — the binding is async, so the page's JS thread is idle
while Node takes the frame. All six stages of a fishing cast come out of one
boot. It screenshots the **page**, not the canvas, because half of what a probe
is worth photographing is DOM.

`tmp/shots/titan2/` is a live Titan set piece with the combat HUD up, the
technique rail live, the nameplate on him and Noctis at 4 365/4 877 from a slam
that had just landed. That is the frame §7.3 said was impossible.

**What is still wanted from `Shots.ts` (the coordinator's), and the design.**
`--shot` solves *looking*; it does not put a live set piece in the **corpus**,
which is what a regression diff needs. The shot table wants one new field:

```js
// in SHOTS
boss_titan_live: {
  doc: 'Titan mid-slam: the fist down, the crater open, the HUD live',
  time: 16.4, weather: 'clear',
  setPiece: 'titan',        // <-- new: routes through EncounterDirector.startSetPiece
  settleFrames: 90,         // let the fight reach a slam before the shutter
  pos: [...], target: [...], fov: 48,
},
```

and `Game.applyShot` wants, where it currently calls `Director._bossScenario`:

```js
if (shot.setPiece) {
  const enc = this.get('Encounters');
  enc.startSetPiece(shot.setPiece);          // real fight, real AI, real HP
} else if (shot.scenario) { ...existing... }
```

The whole of the difference is that `_bossScenario` spawns and freezes the
enemy directly, which is precisely why `boss_field` / `boss_imperial` /
`boss_astral` have never exercised `BossFight`. `probes/stagecam.mts` is three
lines from working the moment `setPiece` exists.

**Framing note for whoever authors that shot: Titan is enormous.** A camera
150 m back and 46 m up, aimed at the root, is still *inside his forearm*. Start
at 300 m and 120 m up.

## 7. What is still broken, ranked

1. **Seven fishing pins have no water.** §2.2. The largest single content hole
   left, and it is a `Water.ts` or a `WorldMap.ts` + re-bake job, not a fishing
   one. **This is the most likely thing to break a 30-minute playthrough now**,
   because the world map's `Fishing` filter lists all ten. Measured at two of
   them: `swainsmere` is at 68.4 m of elevation under closed forest canopy and
   `malacchi_pond` at 20.0 m, and both answer `prompt=none` — a player who fast
   travels there on the strength of the map finds a jetty on a hillside and
   nothing to press. Until the water question is settled, a cheap mitigation
   inside `src/ui/screens/WorldMapScreen.ts` would be to draw a fishing pin the
   live survey does not know about as unavailable, the way `MainScreen` draws a
   screen a build did not register.
2. **The energy deposits are invisible.** §4. Next content job.
3. **Fishing is nearly silent.** §2.3. A reel click, a splash and a line whine.
4. **Fociaugh's cave mouth sits on a 1.26 bank** and Keycatrich's ramp has a
   tree through it. §3.
5. **The `boot` hint card draws over menus.** `Hints._poll` returns early when
   a menu is open but does not dismiss what is already showing, and `#hints` is
   `z-index: 4`, above the menu layer, on purpose. In real play the card has
   faded by the time anyone opens a menu; in every capture taken in the first
   twenty seconds it sits over the screen. Cheap fix, someone else's file to
   decide.
6. **Carried forward and still true**: `hammerheadPan` flattens desert at
   (60, 40) with the town at (576, 10) — moving a landform re-bakes terrain
   under other lanes, so **leave it**. `hunt_zu` spawns a renamed bandersnatch.
   Four waypoints sit on ground steeper than 0.42 because the *place* is steep.
   The haven pad reads as concrete rather than rune-cut rock.

## 8. Traps this cost real time to find

- **A `THREE.Line` is one pixel wide, always.** `linewidth` is a no-op on every
  WebGL renderer, so the fishing line was invisible in three consecutive
  captures while the probe reported the correct endpoints every time. It is a
  scaled cylinder now. **If you cannot see a thin thing you drew, check the
  primitive before you check the maths.**
- **`attach.handR` is a bone, and its world matrix is stale during `update`.**
  The rod tip read during `RpgSystem.update` was the previous frame's pose, so
  the line left Noctis at chest height and lay flat in the grass. That is what
  `RpgSystem.lateUpdate` is for.
- **`Menus` boots after `Rpg`, so `hud.setMenuOpen(true)` written in `update`
  is overwritten in the same frame.** The field HUD stayed at full brightness
  under the fishing gauges for three captures. Same `lateUpdate` fixes it.
- **A local Euler on a bone socket is a spear through the character's head.**
  Whatever looks right in one pose is wrong in the next. Write the *world*
  quaternion and divide the parent's out.
- **Physically correct is not legible.** A 7.5 cm float at 20 m on moving water
  cannot be found in a 1600×900 frame. It is 15 cm and lit from inside now.
- **White type on sunlit grass is unreadable**, which is the whole reason to
  take a capture at all. The gauges sit on a plate.
- **The default camera distance is wrong for a minigame.** At 5.6 m the rod is
  a stub and Gladiolus stands in a third of the frame. A cast pulls the camera
  to 3.4 m and widens the formation slots; both restore on `_end`.
- **Titan's hand bone moves several metres between frames.** Comparing a slam
  point against a hand position read four frames earlier measures the
  animation, not the wiring. The first run of `titanfist.mts` reported 3.90 m
  off and looked exactly like a real defect.
- **`icon()` falls back to the `items` glyph for an unknown key, silently.**
  There is no `magic` icon. Same class as everything in `LANDMINES.md`'s
  "names nothing ever verified".
- **A gate that prints instead of asserting is a comment.** The dungeon-door
  distances were printed every run for months.
- **`--shot` on a probe screenshots the page, not the canvas.** A canvas-only
  grab silently drops every DOM layer, which is most of what a UI probe is for.

## 9. The probes, and what each is for

New this session, run with
`PORT=5450 node src/tools/probe.mts src/tools/probes/<name>.mts [--shot out.jpg]`:

| probe | answers |
|---|---|
| `fishwater.mts` | which fishing pins have real water, and where the rod stands |
| `fishloop.mts` | can a player cast, hook, play and land a fish — and lose one? **Start here.** |
| `elemancydoor.mts` | can a player reach spell crafting from inside the game? |
| `titanfist.mts` | does Titan's fist land where the hand is? |

Changed: `dungeondoor.mts` (asserts the pin distance, prints the approach
grade), `questaudit.mts` (understands `fish`, and asks the live survey rather
than the item table), `ingredients.mts` (fishing is a supply line).

Inherited and still right: `mainchain.mts`, `setpiece.mts`, `rankcurve.mts`,
`outposts.mts`, `photoshot.mts`, `phantom.mts`, `standingroom.mts`,
`poses.mts`, `boardanchor.mts`, `slice.mts`, `huntmark.mts`, `reachall.mts`,
`dens.mts`, `camploop.mts`, `regioncard.mts`, `dmgnum.mts`, `havenloc.mts`,
`questchain.mts`.

`tmp/fishtune.mts` is the difficulty matrix and is deliberately in `tmp/`: it
is a tuning instrument, not a gate, and it reaches into `Fishing._tickFight`
directly so it would break the moment the fight is refactored.

## 10. The exact next step

1. **Give the seven dry fishing pins water**, or move them. §2.2 — decide which
   of the two fixes, and do it from `main` if it touches `WorldMap.ts`.
2. **A visible energy deposit, then a "Draw" prompt on it.** §4.
3. **`setPiece` in `Shots.ts` and `applyShot`**, so a live boss fight is in the
   corpus and not only in `tmp/`. §6 has the diff.
4. **Fishing audio.** §2.3.

## 11. Files touched

`src/game/fishing/{Fishing,FishTable,FishingHud,fishing.css}.ts` (new) ·
`src/game/rpg/{RpgSystem,Inventory,Quests,PartyState}.ts` ·
`src/game/encounters/{EncounterDirector,BossFight}.ts` ·
`src/ui/screens/{ElemancyScreen,MainScreen}.ts` · `src/ui/Menus.ts` ·
`src/world/dungeons/{Keycatrich,Balouve,Fociaugh,Dungeons}.ts` and
`src/world/dungeons/kit/Dungeon.ts` · `src/tools/probe.mts` ·
`src/tools/probes/{fishwater,fishloop,elemancydoor,titanfist}.mts` (new) and
`{dungeondoor,questaudit,ingredients}.mts`.

**Not touched, deliberately**: `src/game/Game.ts`, `src/game/Shots.ts`,
`src/world/map/WorldMap.ts` (it is a terrain-bake source), `src/world/Water.ts`,
`project/TODO.md`.
