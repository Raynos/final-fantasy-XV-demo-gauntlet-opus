# Lane 19 — City hubs (cold-start brief)

Owns: `src/world/town/` (new `CityHub.ts`, `Shops.ts`), `Quests.ts` rows
(AFTER lane 17's spine), `src/characters/npc/Npcs.ts` + `NpcCast.ts` +
`NpcDialogue.ts`, and ONE first commit in `PoiKits.ts` (H2 anchors — lane
18 queues behind it). Not yours: `ShopScreen.ts`/`HuntBoardScreen.ts`
(lane 10), `Game.ts` boot order (two-line explicit-pathspec commit),
`Shots.ts` (lane 3→21).

## Formats (copyable)

**H2 anchor export.** `KitResult` at PoiKits.ts:200-215; `_town`
:1377-1459. Transforms computed and discarded: plaza disc :1407, stall
ring :1415-1445 (`place` matrix :1439, a=(i/6)·2π, radius 7.5), light
spheres :1444 (r 10.5, y 4.4). **Meta rides bakedParts → JSON.stringify
(GeoBake.ts:214) — anchors must be PLAIN NUMBERS, never Vector3.** Store
kit-local (post-yaw, pre-position):
```ts
// KitResult:
  anchors?: Record<string, [number, number, number]>;
// _town, inside the stall loop after `place`:
  A[`stall${i}`] = lp(new THREE.Vector3(0, 0.5, -cd/2 - 1.1).applyMatrix4(place));
  A[`light${i}`] = lp(new THREE.Vector3(Math.cos(a)*10.5, 4.4, Math.sin(a)*10.5).applyMatrix4(world));
// once: A.plaza / A.plazaN; return { cast: false, r: 58, anchors: A };
```
Publish: `BuiltSite` (:236-260) gains anchors, set in `_make` (~:2856);
add `PoiKits.anchorAt(poiId, name, out)` returning world-space (group pos
+ anchor) or null until built. Hammerhead comparison: `anchors!` at
Hammerhead.ts:118, written :573-910, `local()` :277-284.

**Registration (CityHub copies Hammerhead.ts:996-1110).**
`_registerScreens`: `add(key, Screen)` early-returns if
`menus.screens[key]` exists — **the guard that makes a second caller
safe; keep it**. `_registerInteractables`:
```ts
const openShop = (id) => { const s = menus?.screens?.shop; if (s?.setShop) s.setShop(id); ix.openScreen('shop'); };
this._handles.push(ix.register({ id: 'lest_market', pos: A.stall0, radius: 2.8, priority: 1,
  verb: 'Shop', label: 'Partellum Market', hint: 'Ingredients & gemstones', yOffset: 1.5,
  handler: () => openShop('partellum') }));
```
InteractableSpec: Interactables.ts:72-85 (pos may be number[]).

**TOWN_SHOPS entry (Shops.ts:37-130).** ShopDef: id, name, sub, owner,
ownerRole, hue, greeting, buyLine, brokeLine, emptyLine, tabs[] (last is
always Sell), EITHER `stock: Record<tab,string[]>` OR `filter:
Record<tab,(def)=>boolean>`, sellCategories[]. `ShopScreen.setShop`
SILENTLY returns on an unknown id (:146).
```ts
  forge: { id: 'forge', name: 'Forge & Filigree', sub: 'Lestallum · Smithy',
    owner: 'Randolph', ownerRole: 'Weaponsmith', hue: 12,
    greeting: 'Steel worth the name.', buyLine: 'Carry it like you mean it.',
    brokeLine: 'Come back with gil.', emptyLine: 'I take steel and stones.',
    tabs: ['Weapons', 'Accessories', 'Sell'],
    filter: { Weapons: (d) => d.category === 'weapon' && d.price > 2500 && !d.tags.includes('royal'),
              Accessories: (d) => d.category === 'accessory' && d.price > 1500 },
    sellCategories: ['weapon', 'accessory', 'treasure', 'catalyst'] },
```
**Culless cap — Shops.ts:125, one line:** `d.price > 0 && d.price <= 2500`.

**Lodging (Stats.ts:110-136).** All four rows EXIST: leville_std
1000/×1.5, leville_deluxe 3000/×2.0, galdin_std 5000/×2.0, galdin_pearl
10000/×3.0. Entry: `rpg.restAt(id, {wakeHour?, recipe?})`
(RpgSystem.ts:685) → DayCycle.rest (:355) spends the gil itself, returns
{ok, …} or {ok:false, reason}. **Copy the caravan dialogue wholesale from
Hammerhead.ts:1116-1177**; two lodgings = one extra choice row.

**NPC body spec.** NpcPlacement (Npcs.ts:228-243): key, seed, pos, face
(a POINT), posture (lean|wrench|counter|folded|pockets|seated), task
(wrench|chop|inspect), route[], pause[], speed, sit, talkRadius. _spawn
:395. Talk registers only if talkRadius AND an NPC_DIALOGUE[castKey]
entry exist (:459-487) — **talkRadius without a script silently registers
nothing**. POI-anchored bodies: RemoteNpc rows (:165-217), streamed at
420 m. Cast: copy trucker (:251) or traveller (:310) and change six
numbers (profile, look.seed, skin, iris, hairSet, outfit colours);
**archetype is cached per castKey (NpcRig.ts:111) — reusing one key
across many bodies is the perf strategy**. Sania = lab-coat jacket;
Navyth = trucker frame folded at the rail; Verdough/Surgate = one
merchant archetype, two seeds.

**Dialogue.** DialogueScript/Node/Choice: Dialogue.ts:41-93. Helpers at
NpcDialogue.ts top: rpgOf :21, questStatus :22, openShop :23, openHunts
:29, hub :32, **takeQuest(game,id,who,okNode,noNode) :48-55** (accept +
track + notify('talk') in one). Model city scripts on wiz (:466-530).
Hand-ins without takeQuest: notify('fetch',{target,count}) then
notify('talk') — Cid :322-340 pattern. Quest rows: helpers at
Quests.ts:163-176 (kill/fetch_/reach/talk/photo/craft/rest/fish);
`at()` THROWS at load on unknown POI ids.

**Hunt board #2 = one ix.register, no table work.** ledgers() derives
tabs from Quest.tipster → TIPSTERS[x].tome; `lestallum` (Tony, Duscae
ledger) and `galdin` (Coctura, Coastal ledger) ALREADY exist with hunts —
board needs only `handler: () => ix.openScreen('hunts')` (model
hh_huntboard, Hammerhead.ts:1030-1035).

**String lights.** _town draws six unconnected M.lamp spheres (:1444);
`M.lamp = glowMaterial(0xffe6b4, 0.5, …)` (:473). **Night ramp EXISTS:
PoiKits.update sets `M.lamp.emissiveIntensity = 0.3 + night*1.15`
(:2893).** Build catenary runs between the stall poles with bulbs on
M.lamp and they light at dusk for free. Want brighter? Add an `M.festoon`
with its own ramp line — do NOT mutate M.lamp (six kits share it).

**Fish premium caveat:** sell price is global
(`Inventory.sellPrice` :752-756); ShopScreen has no per-shop hook —
Coctura's 1.4× needs a `sellMult` on ShopDef honoured in
ShopScreen.rows()+accept(), **which is lane 10's file** — negotiate or
drop the premium.

## Mechanism notes
- Boot order (Game.ts:276-315): Interaction → Town → Npcs → Director.
  CityHub must init after Interaction, before Npcs: `step('Cities', …)`
  between :309 and :310 + a SystemRegistry line (:46-95). Two-line
  cross-lane commit.
- Npcs.init falls back to five bodies when Town lacks anchors (:273-280)
  — city bodies go through REMOTE-style POI anchoring or a new branch
  reading poiKits.anchorAt, NOT town.local.
- `_apron` runs before the kit and anchors have the same timing — nothing
  can read them until _make has streamed the site. **CityHub must
  poll/late-bind, not read at init.**
- Both city POIs are one merged volume; poi.x/z is the footprint centre —
  REMOTE places Iris/Dino at the PARKING POIs for this reason.

## Commands
```
node src/tools/probe.mts src/tools/probes/standingroom.mts
node src/tools/probe.mts src/tools/probes/npcdraws.mts --set __SHOT__=lest_market_day
node src/tools/probe.mts src/tools/probes/questaudit.mts
node src/tools/probe.mts src/tools/probes/huntboard.mts
node src/tools/texbake.mts --geo          # MANDATORY after PoiKits.ts
node src/tools/drawcheck.mts lest_market_day galdin_pier_sunset
node src/tools/check.mts && pnpm typecheck && pnpm typecheck:tools
```

## First commits
1. **PoiKits anchors ONLY** (KitResult.anchors + _town writes +
   BuiltSite.anchors + anchorAt) → `texbake --geo` → push immediately;
   announce so lane 18 unblocks.
2. CityHub.ts skeleton: one shop + one rest per city off the anchors.
3. Shops.ts: Culless cap + five vendor rows.
4. Game.ts two-line registration (own pathspec).
5. NpcCast archetypes → Npcs placements → NpcDialogue scripts →
   Quests.ts rows (LAST, after lane 17).

## Landmines
- **PoiKits.ts is in GEO_SOURCES — touching it stales geo.bin.gz
  (30 MB)**; re-bake or every POI rebuilds live and captures drift.
- **Anchors must survive JSON** — a Vector3 comes back method-less from a
  warm cache; the bug only shows on the SECOND run.
- ShopScreen.setShop silently no-ops on a typo'd id.
- at() throws at boot on a bad waypoint — game down, not quest broken.
- **Objective targets must match real keys** (`magitek_trooper` matched
  nothing once; `mt` is the bestiary key). Verify every kill/fetch target.
- CollisionWorld.blocked() lies inside buildings (standingroom header) —
  never place a body from a collision query alone.
- SKIP_IDS/_exclude memoise on first call — register city origins before
  the first _make.
- Quests.ts: 17 → 18 → 19 order; Shots.ts untouchable until lane 3
  releases.
- Iris programs: Materials.ts:369 bakes iris hex as a GLSL literal —
  give the ~20 ambient bodies ONE shared iris (reuse trucker's 0x5b6a55);
  resurrect the uniform-dedup only if npcdraws still fails.

## Done-when
anchorAt('lestallum','stall0') and ('galdin_quay','plaza') return world
points; standingroom reports all 29 bodies on open pavement; walk-up
offers 5 Shop + 2 Rest per city + 1 Hunts + Galdin pier verbs; the two
ledger tabs appear with ZERO TIPSTERS rows added; restAt leville_deluxe/
galdin_pearl spends 3000/10000 and banks ×2.0/×3.0; Culless caps at
2500 and Forge carries the rest; all 8 city quests load (questaudit) and
accept in one conversation; npcdraws ≤60 colour draws per city, no eye
mesh past 25 m, ≤12 bodies per framing; drawcheck ≤800 on city shots;
geo.bin.gz re-baked and committed.
