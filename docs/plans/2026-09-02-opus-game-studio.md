# Game Studio — the second half of the build

Status: **SUPERSEDED (2026-09-02, opus)** by `2026-09-02-opus-game-studio-v2.md`,
which replaced the architecture; this plan's sections 3-6 (what the studio
contains) are still the reference. Originally: **IN-PROGRESS** — twelve decisions in §12. L1, L2a
and L2b are built, shipped and green (`pnpm run check` 23/23); L3–L7 and four of
the six sections are open. **`project/handoff/game-studio.md` is the live
state** — read it before picking this up.

The debug suite stopped being behind `?debug` in `6098da8`. That commit changed
a condition; this plan changes what the thing *is*. Today the suite is an
overlay you summon on top of a running game. It becomes a **mode you choose
instead of the game**: a Game Studio, with its own front door, its own menu, and
its own explorers over the same world the game runs in.

Two audiences, and they want the same tool for different reasons. The human uses
it to look at one thing at a time and file an atomic note about it. An agent
uses it to iterate on one thing at a time without booting a whole playthrough to
reach it. Both are "isolate one asset, judge it, change it, look again" — the
loop this repository already spends most of its wall clock on, done by hand
through `shoot.mts` and a contact sheet.

---

## 0. The ask, as given

> - The main menu should be a new one that's like a new "pre main menu" where
>   you choose between the game and the game studio
> - Remove phone demo from the main menu, i think the phone demo is dynamically
>   loaded at startup based on phone or laptop detection right?
> - The game studio is a brand new mode, it's like an asset explorer or game
>   explorer, it's not the actual game, you can't play the game
> - a new game studio main menu, "model explorer", "world explorer", and other
>   things as top level menus
> - The model explorer allows us to explore: main character model, enemy models,
>   weapon models, companion models, NPC models, chocobo / car models, any other
>   models etc.
> - The world explorer allows us to explore the actual world of the main game,
>   but it has basically a teleport fast travel menu, where you can go to all the
>   PoI or landmarks. You should be able to choose the most impressive /
>   exciting things to see first, and then further down the list here's more
>   stuff. When you select it loads the game world in that location / coordinate,
>   but it's a world explorer, so you can move around / fly around, you're not
>   playing as the main character, you're just exploring with the camera.
> - The game studio UI on mobile & desktop should definitely be different.
> - Landscape gate on mobile needs to be smarter, it needs to run JIT — after
>   hitting new game or continue, or after hitting the world explorer. So that
>   the main menu and model explorer work on mobile in portrait.

Answering the one question in it: **yes.** `engine/Device.ts` resolves
`demoActive()` once at module evaluation from a three-legged conjunction —
a touchscreen exists, the primary pointer is coarse, and nothing can hover — and
the demo decides the render tier, the vegetation radius and which texture
container a key lives in. The "Phone Demo" title row was never a destination;
it sets `?demo=1&touch=1` and reloads the page, because the decision it wants to
change was taken during `Game.init()` and the only way back to it is a boot.
§2.3 removes the row and says where that hatch goes instead.

---

## 1. What already exists — read this before estimating anything

**Most of the Studio's *capability* is already written**, in `src/dev/`, built
between 08-21 and 08-22 and then left behind a flag almost nobody typed. Most of
its *presentation* is not, and the mobile shell (§7.2) is genuinely new UI. Being
wrong about that split in either direction is the expensive mistake, so here is
the honest inventory.

| file | what it is | studio role |
|---|---|---|
| `Registry.ts` | cvar + command table; `deltas()` reports every value that differs from boot | **the substrate.** Every studio control registers here first and is surfaced second |
| `Console.ts` | backtick console over the registry, with help | Studio → Console (desktop only, §7.4) |
| `AssetBrowser.ts` | steps four families on the isolation stage, with a persisted `unreviewed/ok/flagged` verdict per asset | **Model Explorer, ~60% built** |
| `Stage.ts` | hides the world, leaves one asset against the sky, orbits it, drives the sun to a three-quarter key. **Adds no lights** — deliberately | Model Explorer's viewport |
| `Freecam.ts` | fly camera with `adopt`, `jump`, `lookAt`, `asShot()` | **World Explorer's camera, built** |
| `ViewModes.ts` | `scene.overrideMaterial` swaps: wireframe, unlit, normals, overdraw | a control strip shared by both explorers |
| `Inbox.ts` | press a key → frame captured *before* the panel opens → note lands as JSON+PNG via `POST /__review/note` | Studio → Notes (dev/preview only, §6.3) |
| `Report.ts` | `capture`/`gather` — the note payload, including registry deltas | unchanged |
| `StatsHud.ts` | fps / frame time / draw calls | the persistent studio status bar |
| `DevSuite.ts` | wires all of the above to keys; owns `_warp(id)`, bookmarks, shot tuning | **becomes the studio's system shell** |

### 1.1 The registries the explorers are views over — counted, not guessed

Every number below was read out of the source on 2026-09-02, because the last
person to write these down got one wrong and it has been wrong ever since.

| registry | count | note |
|---|---|---|
| `speciesKeys()` enemies | **23** | sabertusk goblin mt irongiant dualhorn voretooth anak garula coeurl mesmenir bandersnatch arachne ronin axeman sniper magitek_armour bussemand hobgoblin necromancer redgiant titan bloodhorn deadeye |
| `CAST` heroes | **4** | noctis gladio ignis prompto |
| `WEAPONS` | **5** | sword greatsword polearm daggers firearm |
| `NPC_CAST` | **17** | cindy cid takka dave trucker mechanic traveller dino iris wiz holly randolph sania navyth coctura verdough surgate |
| `POIS` | **139** | 12 types, breakdown below |
| `ZONES` | **19** | |
| `LANDFORMS` | **48** | mesa · butte · fin · spire · peak · crater · canyon · basin · terrace · volcano |
| `SHOTS` | **166** | the exact corpus `framecheck`, `drawcheck` and `nanscan` judge |

> **First grill finding.** `AssetBrowser.ts`'s own header says *"eight
> townspeople"*. `NPC_CAST` has **17**. The comment is stale by nine, and the
> Model Explorer must count the registry at runtime rather than trust a
> hand-written total anywhere. Any other count in this plan is a build-time
> assertion in `studiocheck`, not a constant.

POIs by type, which is what the World Explorer's second band renders:

```
  parking   25    haven     21    landmark  29    dungeon   11
  tomb      10    fishing    9    outpost    8    menace     8
  imperial   7    town       3    reststop   3    chocobo    2
```

### 1.2 Three constraints inherited from that code, each of which cost somebody a day

1. **`Stage` adds no lights, ever.** `engine/LightBudget.ts` pins the light
   counts because changing them changes every material's program key; one such
   toggle was measured recompiling 43 programs in a **9.5 s freeze**. The stage
   controls the *sun* through `Sky.setTimeOfDay` instead, which is free. Any
   studio lighting control obeys the same rule.
2. **`ViewModes` uses `scene.overrideMaterial`**, not per-material mutation, for
   the same reason. Nothing is mutated and turning a mode off restores the frame
   exactly.
3. **`game.paused` skips `update()` but not `lateUpdate()`**, and the dev suite
   registers itself **last**. That is what lets it freeze the world and keep
   running its own camera after `CameraRig` has written the transform. The
   Studio is built on exactly this and needs no change to `Game.ts` — which
   BRIEF rule 4 forbids editing anyway.

---

## 2. The Front Door

### 2.1 Shape

```
  Game.init() resolves
        |
        v
  +-----------------+
  |   FRONT DOOR    |         <- new. src/studio/FrontDoor.ts
  |                 |
  |  PLAY           |  ------>  TitleScreen (today's, minus one row)  --> the game
  |  GAME STUDIO    |  ------>  StudioShell                           --> §3
  +-----------------+
```

**It ships to everyone on the live URL** (decision 1). Hiding it behind a URL
parameter is precisely how `?debug` went unused for eleven days. The Studio row
reads as a deliberate "behind the scenes" feature, not a debug hatch.

The Front Door is **not** a third menu bolted in front of two. It is the title
screen's own machinery — attract camera, crest lockup, the damped row highlight,
the `↑↓ / Enter` footer — reused for a two-row choice, so the game gains a front
door without gaining a second visual language. `TitleScreen` already separates
"one menu row as authored" (`TitleItem`) from "one row as built" (`TitleRow`),
so the row renderer lifts out into something both screens call.

### 2.2 Where it is wired, and why not in `Game.ts`

BRIEF rule 4: **do not edit `src/game/Game.ts` or `src/game/Shots.ts`.** So:

- `src/main.ts` decides, after `game.init()` resolves, which door opens. It
  already owns exactly this kind of decision (the `!shoot` guard, the touch
  import, the suite import).
- `StorySystem.init()` currently calls `this.showTitle()` at the end of boot. It
  gains **one** condition: don't show the title if the studio owns the screen.
  A two-line change to a file the story lane owns, declared here so it is not a
  surprise.
- Everything else lives under a new `src/studio/`, which nobody else owns.

**Three doors must stay closed, and each already has a guard to reuse:**

| URL | today | must stay |
|---|---|---|
| `?shoot=1` | no title, no suite, no free-running frames | **no front door either.** Determinism is BRIEF rule 2 |
| `?scene=<x>` | plays a scene, skips the title | skips the front door |
| `?continue` | resumes straight into play | skips the front door |

Plus a new one: **`?studio=1` opens the Studio directly**, skipping the front
door. That is the door the harness and an agent use, and it is what makes the
studio testable by a gate at all (§11). `?shoot=1&studio=1` opens **nothing** —
shoot is checked first and independently.

### 2.3 Removing the Phone Demo row

Delete the row, the `'demo'` member of `TitleChoice`, and the `_titleChoice`
branch that reloads with `?demo=1&touch=1`.

The capability moves to **Studio → Device** (§6.4), next to the other things
decided at boot that can only be changed by one. That is a better home than the
front page of a shipped game: on a desktop it was a row offering to make the
game worse, and on a phone it was already suppressed. `?demo=0` and `?demo=1`
remain the documented doors, unchanged.

`uxcheck` asserts every main-menu row opens a screen or renders disabled, so the
row count moving is a thing a gate notices. Good.

### 2.4 Leaving the Studio is a reload

Exit calls `location.reload()` back to the Front Door (decision 2). Not because
in-place restore is impossible, but because the Studio pools enemies, hides
scene children, drives the sun and swaps `overrideMaterial`, and proving all of
that unwinds exactly is a bug farm whose failures surface later as phantom
rendering bugs in the *game*. A 6.5 s boot is a fair price for "the game you
return to is the game you booted".

`Registry.deltas()` being empty after exit is still asserted in §11 — a reload
makes that trivially true, which is the point.

---

## 3. Studio information architecture

Six top-level sections. The rule for what earns a top-level slot: **it must be
a distinct thing you go and look at**, not a control you use while looking at
something else. Wireframe mode is not a section; it is a control belonging to
both explorers.

```
  GAME STUDIO
  ├── Model Explorer   §4   portable models, one at a time, on a stage      [must]
  ├── World Explorer   §5   the real world, flown rather than played        [must]
  ├── Shot Gallery     §6.1 the 166 framings the nightly gates judge        [must]
  ├── Look Lab         §6.2 time of day, weather, quality tier, view modes
  ├── Notes            §6.3 the review inbox — dev/preview builds only
  └── Device           §6.4 what this build resolved at boot, and the doors back
```

`[must]` marks the three that survive any cut (decision 9). `Console` is the
seventh thing and deliberately **not** a section: a global overlay on desktop
(backtick, as today), absent on mobile where there is no keyboard to justify it.

### 3.1 The one rule the whole mode hangs on

**In the Studio, the game is not running.** `game.paused = true`, `Player`
control released, `Encounters` and `Enemies` held down, `StorySystem` never
started, HUD hidden. The world still *renders* — that is the whole point —
because `lateUpdate()` still runs and the studio's camera is the last thing to
write.

The ask states this explicitly ("it's not the actual game, you can't play the
game"), so it is a gate assertion (§11), not a comment.

### 3.2 What the Model Explorer holds and what the World Explorer holds

The boundary is **portability**, not asset type:

- **Model Explorer** — things that exist independent of any place: heroes,
  companions, enemies, NPCs, weapons, the chocobo, the Regalia. You can put one
  on a turntable and the turntable is not lying about it.
- **World Explorer** — things that only mean anything *where the ecology put
  them*: havens, towns, tombs, imperial bases, landmarks, vegetation, rock. A
  haven on a turntable does not show you that its canopy letterboxes the camera
  from the deck, which is a real bug this repo has (`_probe/w3bhaven.mts`).

Prop kits get **both** (decision 5): a synthetic-site stage view in the Model
Explorer *and* an in-situ view with an isolate toggle in the World Explorer.
They are the same builders seen two ways, and the pair is what makes "the model
is fine, the placement is wrong" a distinguishable answer. In-situ is the cheap
half and lands first (L6); the synthetic site is the expensive half and is last
(L7).

---

## 4. Model Explorer

### 4.1 Families

| section | source | count | state |
|---|---|---|---|
| Main character | `CAST.noctis` | 1 | in `AssetBrowser` |
| Companions | `CAST` minus Noctis | 3 | in `AssetBrowser` |
| Enemies | `speciesKeys()` | 23 | in `AssetBrowser`, 7 poses each |
| Weapons | `WEAPONS` | 5 | in `AssetBrowser` |
| NPCs | `NPC_CAST` | **17** | in `AssetBrowser`; its header says 8 — §1.1 |
| Chocobo | `buildChocoboPrototype()` | 1 + colour variants | **new, cheap** — a real factory exists |
| Vehicles | `VehicleBody` | 1 (Regalia) | **new, cheap** — a class, constructible off-world |
| Prop kits | `PoiKits` ×12, `Landmarks` ×7 | ~19 | **new, L7** — needs a synthetic site (§4.3) |

### 4.2 What you can do to a model

Everything `AssetBrowser` does today, kept: step within a family, step between
families, scrub the 7 animation states, and set a persisted `unreviewed / ok /
flagged` verdict with a filter to "only what I have not looked at". That verdict
is what makes it a review tool rather than a viewer — without it you inspect
whatever you happen to remember, and a pass over 40 assets never finishes.

Added:

- **Orbit, zoom, and a framing that is reproducible.** Pinch/drag on mobile,
  MMB/wheel on desktop, plus a "reset framing" that returns to the authored
  three-quarter key so two screenshots of the same model are comparable.
- **Copy this framing.** `Freecam.asShot()` already emits the exact shape
  `Shots.ts` stores.
- **The numbers, on screen**: triangles, draw calls, materials, texture memory,
  program key. This is the studio's most direct service to the phone budget —
  BRIEF rule 3 prices a handset at **250 draw calls** and **~2.5 M triangles**,
  and today the only way to learn what one model costs is `_probe/mobcost.mts`.
- **File a note on this exact model** (where Notes exists, §6.3), family/key
  pre-filled, so a note reads `enemies/bloodhorn` rather than "the horned one".

### 4.3 The synthetic site (L7, the hard one)

`PoiKits._haven`, `_town`, `_tomb` and the rest are not factories: they are
methods taking a `PartBuilder` and a `PoiSite`, and they build *into the world*
at a site the ecology chose. Staging one needs a fabricated `PoiSite` — flat
ground, a fixed seed, a plausible yaw — and the stage will necessarily lie about
how the kit meets real terrain. That is exactly why the in-situ view (§5.4)
exists and lands first: if L7 slips, prop kits are still inspectable where it
matters.

### 4.4 What it must not do

Not build the whole scene to show one model. `Stage` hides by walking
`scene.children` and clearing `visible` on anything that is not a light and not
the sky — by property, not by naming systems, because systems get added and
renamed. Keep that.

---

## 5. World Explorer

### 5.1 The teleport list, ordered by what is worth seeing

139 POIs sorted alphabetically is a phone book. The ask is explicit: *"the most
impressive / exciting things to see first, and then further down the list here's
more stuff."* So: **curated at the top, complete underneath**, in three bands.

```
  ── SIGNATURE ─────────────────  ~12, hand-ordered, each with an arrival framing

  ── BY TYPE ───────────────────  all 139, grouped by the 12 PoiTypeNames
     Landmarks 29 · Parking 25 · Havens 21 · Dungeons 11 · Tombs 10 ·
     Fishing 9 · Outposts 8 · Menace 8 · Imperial 7 · Towns 3 ·
     Rest stops 3 · Chocobo 2

  ── EVERYTHING ────────────────  19 zones, 48 landforms, and the 166 named
                                  shots as camera destinations
```

The Signature band is an authored `SIGNATURE: string[]` — ordered POI ids with a
one-line reason each, the way `Shots.ts` authors framings. **Authored, not
scored.** A "visual interest" heuristic over POI metadata would be a guess
dressed as a measurement, and this repository has a documented allergy to those.

**I pick the twelve by going and looking** (decision 4): fly the candidates in
the studio itself once L2 lands, capture a frame of each, and bring back a
shortlist with images to veto. Candidates worth visiting first, from the tables:
`longwythe_peak`, `insomnia_wall`, `angelgard`, `hammerhead`, `galdin_quay`,
`lestallum`, `costlemark`, `adamantoise_graveyard`, `threshold_stones`,
`saulhend_overlook`, `three_valleys`, `mencemoor_obelisks`, plus whichever
landform reads best from the air. Twelve is a starting guess, not a target.

Each Signature entry carries an **arrival framing** rather than a bare
coordinate, because `_warp`'s generic "stand off 90 m and look at it" is right
for a rest stop and wrong for a mesa. Reuse the `CameraBookmark` shape
(`{pos, target, fov}`) the bookmarks and shot tuning already speak.

### 5.2 Arriving

`_warp` already does the hard part, including the lesson in its own comment: do
not land on the exact point, because a zone centre is frequently inside whatever
landmark defines it, and dropping the camera on `cauthess` puts you inside a
meteor.

What is added is honesty about **streaming**. The world streams around the
camera; teleporting 3 km lands you in front of geometry that has not been built.
So arrival is a sequence, not a jump: fade → move the camera → hold until the
streamer reports quiet → fade in. `Props` already tracks how many POI subtrees
it has packed (`_poiPacked` against `poiKits.built.length`), a real "is it done"
signal rather than a fixed timer. Without this the World Explorer's first
impression is a grey field, every time.

### 5.3 Flying, not playing

`Freecam` handles it: WASD + mouse-look on desktop, throttle on the wheel.
Mobile gets the same camera under a different rig (§7.3). The player character
is not spawned, not controlled and not followed; `CameraRig` is not running, so
it cannot fight the freecam for the transform.

Controls a fly-through actually needs, all cheap on top of `Freecam`: a speed
decade (2 m/s to inspect a fence, 400 m/s to cross Leide), "stick to ground at
eye height" for judging scale as a person sees it, and a compass + coordinate
readout so a note can say *where*.

### 5.4 In-situ prop inspection

At any arrival, an **isolate** toggle hides terrain, vegetation and distant
props, leaving the kit that belongs to this POI standing against the sky — the
`Stage` trick applied to a subtree instead of the whole scene. Plus the same
numbers the Model Explorer prints, scoped to that subtree.

This is the view that catches placement bugs a turntable cannot: a canopy that
letterboxes the camera from the tent deck, a prop sunk into its own apron, a kit
whose draw count is fine alone and ruinous next to its neighbours.

---

## 6. The other three sections

### 6.1 Shot Gallery *(must-have)*

The 166 entries in `SHOTS` as a grid; tap one, the camera goes there.
`DevSuite._shot` already steps them with `next`/`prev` and persists per-shot
camera overrides to `localStorage` (`dev.tuning`).

Beyond convenience: **it is the fastest possible answer to "does this change
move the corpus?"** — go and look at the exact frame the gate looks at, before
spending 200 s on `framecheck`.

### 6.2 Look Lab

Time of day, weather, quality tier and the four view modes in one place. None of
it is new machinery: `Sky.setTimeOfDay`, `WEATHER_NAMES`, `QUALITY_TIERS`,
`ViewModes`.

The value of putting them together is the **taint watermark** that
`Registry.deltas()` already drives: the most expensive failure mode of a debug
suite is chasing a bug that turns out to be a leftover toggle, so the studio
watermarks itself the moment anything differs from boot. Make it impossible to
miss on a phone, where the overlay is smaller.

### 6.3 Notes — dev and preview builds only

`Inbox` writes through `POST /__review/note`, registered by
`vite-plugin-review` on the dev and preview servers. **That endpoint does not
exist on the deployed URL**, so the section is hidden there entirely (decision
6) rather than shipping a button that silently downloads JSON into a phone's
Files app.

The section adds the half `Inbox` lacks: **what have I filed, and what is still
open** — a list read back from `.review/inbox/`, grouped by area, each with its
captured frame. That is exactly the shape the `drain-inbox` skill consumes, so
a human's review session and an agent's fix pass look at one artifact.

### 6.4 Device

What this build actually resolved at boot, and the doors back — the honest
version of the row §2.3 deleted:

- `demoActive()` and **the three legs that decided it** (touch / coarse pointer
  / no hover), because "why am I in the demo" is otherwise unanswerable from
  inside the page.
- `touchActive()`, render tier, device pixel ratio, GPU string.
- Reload links for `?demo=1&touch=1`, `?demo=0`, `?q=<tier>` — spelled as what
  they are: a reload, because the decision was taken during `Game.init()`.
- `BOOT_PROFILE`, already on `window`, as the boot breakdown.

---

## 7. Mobile and desktop are two shells over one core

The ask calls this out and it is the part most likely to be done badly, because
the tempting move — one layout that shrinks — produces a tool that is cramped on
desktop and unusable on a phone. **`hover: none` is not a small screen.** It is
no keyboard, no right-click, no MMB, no wheel, no cursor to hover for a tooltip,
a thumb instead of a pointer, and a hand covering the bottom third.

So: **one core, two shells.** The core is the six sections, the registry and the
explorers' behaviour. The shell is navigation, layout and input, and there are
two, picked once at studio open from `touchActive()` — the same predicate the
game already trusts, resolved once, never re-asked.

### 7.1 Desktop shell — dense, keyboard-first, side-by-side

```
 ┌─────────────────────────────────────────────────────────────┐
 │ GAME STUDIO   Model  World  Shots  Look  Notes  Device      │  tab bar
 ├──────────────┬──────────────────────────────────────────────┤
 │ Enemies  23 ▾│                                              │
 │  arachne   ok│                                              │
 │ ▸bloodhorn ⚑ │              viewport                        │
 │  dualhorn    │         (stage, or the world)                │
 │  goblin      │                                              │
 │ Heroes    4 ▸│                                              │
 │ Weapons   5 ▸├──────────────────────────────────────────────┤
 │ NPCs     17 ▸│ 4 812 tris · 11 draws · 6 mats · idle ◂1/7▸  │  numbers
 ├──────────────┴──────────────────────────────────────────────┤
 │ 61 fps · 8.2 ms · 214 draws          ⚠ DEBUG STATE MODIFIED │  status
 └─────────────────────────────────────────────────────────────┘
```

- Persistent left list + viewport. You see the list *and* the thing.
- Keyboard primary: `1`–`6` sections, `↑↓` within a list, `[` `]` between
  families, `` ` `` console, `F8` fly, `Enter` verdict.
- Hover reveals secondary detail. Wheel zooms. MMB orbits.

### 7.2 Mobile shell — one thing at a time, thumb-reachable

```
 ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
 │ ‹  Model Explorer │   │ ‹  Enemies    23  │   │ ‹  bloodhorn  ⚑   │
 ├───────────────────┤   ├───────────────────┤   │                   │
 │  Main character   │   │  arachne       ok │   │                   │
 │  Companions    3  │   │  bloodhorn      ⚑ │   │     viewport      │
 │  Enemies      23  │→  │  dualhorn         │→  │   (drag = orbit   │
 │  Weapons       5  │   │  goblin           │   │    pinch = zoom)  │
 │  NPCs         17  │   │  hobgoblin        │   │                   │
 │  Chocobo          │   │  ...              │   ├───────────────────┤
 │  Regalia          │   │                   │   │ 4812 tri · 11 dr  │
 ├───────────────────┤   ├───────────────────┤   ├───────────────────┤
 │ ▣ ▤ ▥ ▦ ▧ ▨       │   │ [only unreviewed] │   │ ◂ idle ▸  ok  ⚑ ✎ │
 └───────────────────┘   └───────────────────┘   └───────────────────┘
   section grid            list, big rows          viewport + bottom bar
```

- **A drill-down stack, not panels.** One screen at a time with a back
  affordance, because a 390 px viewport cannot hold a list and a subject.
- **Controls at the bottom**, in the thumb arc. Never the top corners.
- **Touch targets ≥ 44 px**, and the row *is* the target, not a chevron in it.
- **Direct manipulation instead of a cursor**: drag orbits, pinch zooms,
  two-finger drag pans, double-tap resets framing. No hover state anywhere.
- **Swipe left/right steps** to the next asset or shot — the gesture the review
  loop actually wants: look, judge, next.
- No console. Everything reachable without one.

### 7.3 The World Explorer's mobile problem, and the JIT landscape gate

Flying needs 6 degrees of freedom and a phone has no WASD. Reuse
`src/ui/touch/` rather than inventing: `Stick`, `TouchButton`, `VirtualPad` and
`RotateGate` are built, and `touchcheck` already drives them. Left stick
translates, right drag looks, a vertical pair rises and falls, and the speed
decade is a bottom-bar segmented control rather than a wheel.

**The rotate gate fires just-in-time, never at studio open** (decision 8,
sharpened by the human). Portrait is fully supported for the Front Door, the
studio menu, Model Explorer, Shot Gallery, Look Lab, Notes and Device — a phone
held one-handed can browse every model in the game. `RotateGate` appears at
exactly two moments, both of them the start of a genuinely landscape activity:

1. committing to **New Game / Continue** from the title screen, and
2. entering **World Explorer flight** after picking a destination.

Not on opening the World Explorer's *list* — that is a menu and reads fine in
portrait. The gate is a threshold on the activity, not a tax on the section.

### 7.4 What is deliberately *not* on mobile

Said out loud rather than discovered:

| | desktop | mobile | why |
|---|---|---|---|
| Console | ✓ | — | no keyboard; every command has a control |
| Shot tuning / bookmark save | ✓ | — | authoring, not reviewing |
| Overdraw / normals view | ✓ | ✓ | cheap, and the phone is where fill rate bites |
| Prop kits (L7) | ✓ | ✓ if it fits the budget | some kits will not build inside 250 draws |
| Notes capture | ✓ (dev) | ✓ (dev) | absent on the deployed build for both, §6.3 |

### 7.5 The phone build has less in it

On `demoActive()` the world is cut down — vegetation radius, texture container,
content. **The Studio opens on the phone demo** (decision 7), lists only what
*this* build actually contains, and labels itself as the phone build. A studio
that lists 23 enemies and fails to build 9 of them is worse than one that lists
14 and says why. This is how the phone build gets reviewed on a phone, which is
the whole reason the mobile shell exists.

### 7.6 Look

BRIEF's UI voice: thin white/pale-blue type, generous letterspacing, low-opacity
dark panels, angular corner cuts, restrained, never chunky. The Studio uses
**the same language, denser** (decision 10) — same typeface, palette and corner
vocabulary as the game, tighter rows and more information per screen than a HUD
would carry. It must not look bolted on by a different project, because it will
end up in screenshots.

---

## 8. Constraints this must not break

1. **BRIEF rule 1 — no network, no binary assets.** Procedural like everything
   else. No icon font, no image sprites.
2. **BRIEF rule 2 — determinism.** `?shoot=1` sees no front door and no studio.
   Checked first, checked independently of every other flag.
3. **BRIEF rule 3 — budgets.** The studio must not cost the *game* anything: a
   separate async chunk, imported after `start()`, not in the frame when the
   game runs. Its own frame cost is bounded (§11.6).
4. **BRIEF rule 4 — `Game.ts` and `Shots.ts` are not ours.** New files under
   `src/studio/`, wired from `main.ts`, registered last.
5. **BRIEF rule 5 — no page errors.** A family that fails to build reports; it
   does not throw.
6. **BRIEF rule 6 — `anycheck` holds `any` at zero.** 746 files, ceiling 0.
7. **The light budget.** No studio control adds or removes a light. Sun only.
8. **`pnpm run check` stays inside 290 s** (`project/check-baseline.json`).

---

## 9. Files

```
src/studio/
  FrontDoor.ts        the two-row pre-menu; shares TitleScreen's row renderer
  StudioShell.ts      mode lifecycle: pause the game, own the screen, exit=reload
  Sections.ts         the six sections as data; both shells render from it
  Signature.ts        the authored World Explorer highlights + arrival framings
  desktop/Shell.ts    tab bar + list + viewport, keyboard map
  mobile/Shell.ts     drill-down stack, bottom bars, gestures, JIT rotate gate
  ModelExplorer.ts    families over AssetBrowser + Stage, plus the new ones
  WorldExplorer.ts    teleport list, arrival sequencing, fly rig, isolate toggle
  studio.css

src/dev/              stays, and keeps working under `?debug`
  DevSuite.ts         gains an `openStudio()`; loses nothing
```

Two rules for the split: **the studio owns presentation, `src/dev/` owns
capability.** A control that does something new registers in `Registry` first
and is surfaced by a shell second — the lesson `Registry.ts`'s own header states,
and the reason the console, the keybinds and the repro line in every review note
come out for free.

And `src/dev/` keeps working standalone: the overlay suite under `?debug` is how
you inspect a *running game*, which the studio by definition cannot do.

---

## 10. Build order — each lane ships to the live URL as it lands

Decision 8: ship per lane, not one big deploy. You get to look at real progress
on your phone and redirect early.

| lane | what | depends on | risk |
|---|---|---|---|
| **L1** | Front Door + `StudioShell` + `?studio=1` + remove the demo row | — | low |
| **L2** | Desktop shell, six sections wired to what exists today | L1 | low |
| **L3** | Mobile shell: drill-down, gestures, JIT rotate gate | L2 | **medium** — the genuinely new UI |
| **L4** | Model Explorer: chocobo + Regalia families | L2 | low |
| **L5** | World Explorer: arrival sequencing, fly rig, Signature list picked by looking | L2 | medium |
| **L6** | World Explorer: in-situ prop inspection + isolate toggle | L5 | medium |
| **L7** | Model Explorer: prop kits on a synthetic site | L4, L6 | **high** — §4.3 |

L1 first and alone: it is the only lane touching files another lane owns
(`TitleScreen`, `StorySystem`), and on a shared trunk that wants to be one small
commit that lands and is done.

---

## 11. Definition of done — against instruments

No dates. Each bar is a thing that can be run, and it fails loudly.

1. **`pnpm run check` is green**, `anycheck` still at zero, suite inside its
   290 s budget.
2. **`shoot.mts` is unchanged.** A full-corpus capture is byte-identical to
   before the studio existed — the determinism bar, and the proof that `?shoot=1`
   never sees the front door. `imgdiff.mts`'s floor is 1.5/255, measured.
3. **A new gate, `studiocheck.mts`**, following `uxcheck`'s shape — drive the
   real page, assert on live state:
   - `?studio=1` opens the studio, and **`?shoot=1&studio=1` does not**;
   - all six sections open and render (three on the deployed build: Notes hidden,
     §6.3);
   - **the game is not running**: `game.paused`, no player input accepted, no
     encounter spawns over 600 frames;
   - every Model Explorer family builds every key **it counts at runtime**, with
     no console errors, reporting triangles and draws per asset;
   - every Signature POI arrives and the streamer reports quiet inside a bound;
   - the registry-count assertions of §1.1, so the next stale comment fails a
     gate instead of a plan.
4. **`touchcheck` extended** to the mobile shell: every control reachable, every
   target ≥ 44 px, the drill-down stack navigable to a model and back, **and the
   rotate gate absent in portrait everywhere except the two JIT moments** (§7.3).
5. **`devicecheck` extended**: the studio opens and is usable on all 10 device
   profiles it already decides, phone demo included.
6. **Frame cost bounded.** Studio overlay ≤ 1 ms of frame time on desktop; on
   the phone profile the World Explorer holds the locked 30 with the studio
   open. Measured, not asserted.
7. **Deployed and looked at.** Live on <https://ff15-xv-opus.vercel.app>, opened
   on a real handset and a real desktop, and **the frames read** — per BRIEF,
   structural correctness is not the bar.

---

## 12. Decisions taken (2026-09-02, with the human)

| # | decision | |
|---|---|---|
| 1 | Front Door ships to everyone on the live URL | §2.1 |
| 2 | Exit from the Studio is a page reload | §2.4 |
| 3 | Phone Demo row deleted; the hatch moves to Studio → Device | §2.3 |
| 4 | I pick the ~12 Signature places by flying there and looking, then you veto | §5.1 |
| 5 | Prop kits get **both** a synthetic-site stage view and an in-situ world view | §3.2, §4.3, §5.4 |
| 6 | Notes is hidden on the deployed build — dev/preview only | §6.3 |
| 7 | The Studio opens on the phone demo build, labelled, listing only what it has | §7.5 |
| 8 | The landscape gate fires JIT — entering the game, and entering world flight — never at studio open | §7.3 |
| 9 | Must-haves if it runs long: Model Explorer, World Explorer, Shot Gallery | §3 |
| 10 | Same UI language as the game, denser | §7.6 |
| 11 | Ship each lane to the live URL as it lands | §10 |
| 12 | Live URL renamed to `ff15-xv-opus.vercel.app` | done, `b6c4efb` |

### Still open

- **How many Signature places.** Twelve is a guess; the answer is however many
  are genuinely worth seeing first, decided by looking (L5).
- **Is `src/dev/`'s overlay retired once the studio exists?** No, per §9 — but
  the duplication is real and worth revisiting once L3 lands.
- **Does the Studio get its own attract camera** or open on a black screen? A
  studio that opens onto a live world it is already flying is a much better
  first impression, and `Freecam` plus the title's ping-pong cosine is most of
  it. Decide during L2.
