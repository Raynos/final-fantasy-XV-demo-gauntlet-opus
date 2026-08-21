# Weapons — handoff

Owned files: `src/combat/Weapons.js`, `src/combat/GeoKit.js`,
`src/characters/rig/Character.js`, `src/characters/ai/PartyAI.js`.

> **Branch note — read first.** The branch `agent/weapons` is checked out by an
> abandoned worktree (`.claude/worktrees/agent-a67f9e2cac4a04ddf`, at `06d4030`)
> and git refuses a second checkout of it, and this agent is worktree-isolated so
> it cannot `git worktree remove` another path. All work therefore landed on
> **`worktree-agent-a2244f760607da5b8`**, which is `06d4030` + `main` + this doc.
> It is a strict fast-forward of `agent/weapons`. To land it:
> `git worktree remove --force .claude/worktrees/agent-a67f9e2cac4a04ddf`
> then `git branch -f agent/weapons worktree-agent-a2244f760607da5b8`.

---

## 1. The float bug — root cause, and what is *not* the cause

**The socket wiring was never broken. Do not re-investigate it.** An in-page probe
of `handR` bone / socket / `weapon.root` world positions returned three identical
vectors for every companion:

```
gladio   handR bone (-2.161, 8.960, -0.775)
         socket     (-2.146, 8.926, -0.746)
         weaponRoot (-2.146, 8.926, -0.746)   parent: "handR"
```

`PartyAI._equip` → `character.attach.handR` works exactly as documented.

**The actual cause was the geometry origin.** Every geometry function authored the
**crossguard at `y = 0`**. Measured local bounding boxes before the rebuild:

| weapon | bbox y | y = 0 sat at | grip span | pommel |
|---|---|---|---|---|
| greatsword | −0.50 … +1.68 | crossguard | −0.40 … −0.07 | −0.50 |
| sword | −0.262 … +1.10 | crossguard | −0.205 … −0.058 | −0.228 |
| daggers | −0.17 … +0.52 | crossguard | −0.17 … −0.03 | — |
| firearm | −0.156 … +0.094 | receiver | −0.145 … −0.02 | — |

So the socket put the fist on the guard and 7–50 cm of grip and pommel hung in
mid-air below an open hand. On Gladiolus that is half a metre of leather and a
spiked pommel dangling under an empty fist — the "floats detached from the hand"
read across the whole shot corpus.

**Status: fixed, and verified by eye.** Every weapon is re-authored grip-at-origin
(convention documented at the top of the geometry section of `Weapons.js`), and
`Character._palmSocket` now puts the socket at the **centre of the closed fist**
rather than on the wrist bone. In `tmp/shots/wp1/hero_face.png` and
`tmp/shots/wp1/gladio_closeup.png` no weapon floats: Noctis' blade sits *in* the hand,
Gladiolus' greatsword rides his back, Ignis' kukris and Prompto's pistol are
stowed.

Noctis is a second, *different* mechanism and is **not** a bug: `CombatSystem`
does not use `attach.handR`. It owns an anchor Group pinned to the player root
(`CombatSystem.js:30-32`, local `(0.30, 1.12, 0.12)`), swings *that*, and
`CombatAnim.weaponIK` drags Noctis' hand onto it. That indirection is deliberate
(the anchor is authoritative for hitboxes and trails; parenting it to the hand
bone would make the IK circular). Once the geometry became grip-centred his hand
lands mid-grip for free — confirmed in `hero_face`.

---

## 2. State — what is verified, what is not

`06d4030` ("WIP: grip-centred weapon geometry") is a **salvaged commit from a
stalled predecessor**: ~860 lines that built but had never been rendered. This
session's contribution is the *verification* of it, plus the merge of `main`.

| item | state |
|---|---|
| grip-centred origins, all 7 geometries | salvaged code — **verified by eye** (wp1, iso1) |
| `Character._palmSocket` (fist-centre socket) | salvaged code — **verified by eye** |
| `Character.setGrip` / `_applyGrip` finger curl | salvaged code — **written, never seen closing** (no caller for Noctis; companions call it, but at portrait distance the fingers are ~4 px) |
| `WEAPON_ANCHORS` / muzzle fix | salvaged code — **verified numerically by construction, not re-probed this session** |
| companion stow / draw | salvaged code — **verified by eye**, poses need tuning (§4) |
| `GeoKit.edgedCross` / `chamferCross` / `wrapCross` / `surf` | salvaged code — **verified by eye** |
| brushed-steel material (`steelMaps`) | salvaged code — **verified by eye and it is WRONG (§5)** |
| blade proportions / silhouettes | salvaged code — **verified by eye, acceptable** |

Gates, all run this session on the merged tree:

* `npx vite build` — **pass** (353 ms; the >500 kB chunk warning is pre-existing).
* `node tools/integration.mjs` — **18 pass, 0 wired-but-unproven, 0 not
  integrated.** Includes `combat / weapon swap is free — 5 swaps in 24 ms`, which
  cycles all five classes and so exercises the new anchors.
* `node tools/orphans.mjs` — **1 orphan, `src/world/map/MapRaster.js`,
  pre-existing on `main` and not ours.**
* Shot manifest: `gladio_closeup` 512 calls, `hero_face` 485 calls — inside the
  800 budget, no regression.

---

## 3. The `tipLocal` muzzle bug — fixed

`Weapon.tipLocal` used to be `(0, def.reach * 0.52, 0)`. `firearm.reach` is 26 m,
so `tipLocal.y = 13.52`: measured, Prompto's socket sat at y 8.359 and
`weapon.tip()` returned y **21.61** — 13 metres above his head. `CombatSystem._shoot`
uses `weapon.tip()` as the muzzle, so every muzzle flash, tracer origin and hit
direction for a gun started 13 m in the air.

Replaced by an authored table, `WEAPON_ANCHORS` (`Weapons.js`, near the bottom of
the geometry section), read by the `Weapon` constructor with a geometry-bounding-box
fallback for unlisted kinds (Armiger fillers, modded gear):

```js
firearm: { base: [0, 0.0965, 0.060], tip: [0, 0.0965, 0.168] },
```

i.e. a muzzle ~17 cm from the fist along +Z, which is where a pistol's bore is.
**Not re-probed this session** — see next steps.

---

## 4. Companion stowing — implemented

`PartyAI._equip` no longer hard-wires `setReveal(1)` into `attach.handR` forever.
It now builds one `Weapon` per entry in a per-role **carry table** (`CARRY`, at the
bottom of `PartyAI.js`, exported alongside `ROLES`) and starts every companion
**sheathed**. `_reparent(m, drawn)` moves `weapon.root` between the stow socket and
the hand socket; `_carry(m, want, dt)` runs the swap through the blue-crystal
`setReveal` dissolve (out over the first half, in over the second) so it is a
materialisation rather than a pop. It is driven from the `inCombat` branch already
computed in `PartyAI.update`, and runs for downed members too, so a party wipe does
not leave three blades hanging over the bodies.

Stow stations (all local to a `Character.attach` socket):

* **Gladiolus** — `attach.back`, hilt over the right shoulder, blade near-vertical
  down the back: `pos [-0.095, 0.008, -0.094] rot [0.061, 0, 3.013]`.
* **Ignis** — two kukris on `attach.hip`, one each side, tip-down and raked back:
  `pos [-0.07, 0.02, 0.02]` and `pos [0.35, 0.05, 0.02]`, `rot [0.386, …, 3.328]`.
  He gets **two** because one kukri and one empty fist is not the silhouette.
* **Prompto** — `attach.hip`, holstered on the right thigh, muzzle down:
  `pos [-0.075, -0.145, 0.055] rot [π/2, 0, -0.20]`.

Hold transforms are identity for the melee classes, because the hand sockets are
authored as a *fist frame*. The pistol needs `rot [0, π/2, 0]` because its geometry
runs grip-down / barrel-along-+Z rather than blade-along-+Y.

Verified in `tmp/shots/wp1/{gladio_closeup,ignis_closeup,prompto_closeup,hero_face}.png`:
no companion has a drawn weapon in a field frame any more. **Tuning still wanted:**
in `gladio_closeup` the greatsword hangs a visible gap *off* his back rather than
against it — pull it in along the socket's local −Z by ~4 cm and give it a little
more diagonal.

---

## 5. Blade geometry and material — the one thing still wrong

**Geometry: rebuilt and good.** All seven generators re-authored. The kit gained
`edgedCross` (a real ground section: secondary bevel → primary grind → ridge →
fuller floor, four plane families meeting at hard lines), `chamferCross` (hard 45°
machined corners, which `rectCross`'s superellipse cannot hold) and `wrapCross`
(a lobed section lofted with an advancing `rot`, so the ridges screw into a real
helical grip wrap). `groundBlade` bakes a colour gradient *across the section
index* — edge bright, face mid, spine/fuller dark. The greatsword came down from
270 mm to 192 mm wide, the orange emissive spine stripe is gone (replaced by a
bronze inlay laid into the fuller), and the sword's Lucian blue is now a **recessed
channel** in the fuller instead of a painted slab.

At 3× in `tmp/shots/wp1/gladio_closeup.png` the greatsword's grip reads genuinely well:
helical leather wrap, two bronze bands, a blunt weighted pommel. The silhouettes
in the asset browser are correct — slim single-edged Engine Blade with a clipped
false-edge point, an engine block with piston pots above the guard, a broad
greatsword with ricasso and swept crossbar.

**Material: still reads as a flat navy slab. This is the remaining defect.**
`makeWeaponMaterial` is now `metalness 0.90, roughness 0.70, envMapIntensity 0.48`
plus a shared procedural anisotropic roughness/normal map pair. At metalness 0.90
the diffuse term is ~0, so the blade's colour is *entirely* `scene.environment`
(the sky PMREM, `Sky.js:653`) — which is blue. The result: every blade renders as
one uniform dark navy plane with no edge highlight, no bevel line and no fuller
shading. The baked `groundBlade` gradient is invisible because it only tints F0.
It is a different failure from the pre-existing chrome mirror, but it lands in the
same place — a blue surfboard.

Fastest way to judge: `npm run dev`, `http://127.0.0.1:<port>/?debug=1`, **F4**,
then `` ` `` and `asset weapons greatsword`. A scripted version of exactly that is
in this session's scratchpad (see Gotchas).

---

## 6. Next steps, in priority order

1. **Make steel read as steel.** In `makeWeaponMaterial`: drop `metalness` to
   ~0.72–0.80 so a real diffuse term picks up the warm sun, raise
   `envMapIntensity` toward ~0.8 so it is bright rather than dark navy, and cut
   base `roughness` to ~0.34 so the sun throws a hard specular line along the
   bevel. Warm the steel palette (`STEEL 0x8e97a1` is cool blue-grey — try a
   neutral/warm grey) so the sky tint is cancelled rather than reinforced.
   **Invariant: all five weapon materials must stay configuration-identical** —
   `customProgramCacheKey` returns a constant and `CombatSystem._prebuildWeapons`
   depends on every class sharing one compiled program. Keep the maps
   module-level.
2. **Re-probe the anchors.** Assert numerically that `weapon.tip()` is at the
   blade tip and the firearm muzzle is ~0.17 m from the hand, not 13 m up.
   `tools/probe.mjs` exists; there is no `tools/probes/weapons.js` yet (only
   `tools/probes/meteor.mjs`) — write one.
3. **Eyeball the swing arcs.** Re-origining moved every weapon relative to every
   swing arc and trail anchor. `combat_wide`, `combat_armiger` and `warp_strike`
   have not been shot since the rebuild. `Armiger.layout` scales by 0.46 and
   orients hilt-inward around a ring; that layout was tuned against
   guard-origin geometry.
4. **Tune Gladiolus' stow** (§4) so the sword lies against the back.
5. **Close the fist.** `setGrip` exists and is called by `PartyAI`, but nobody has
   seen fingers actually wrap a grip at zoom. Crop a hand at 3× and check;
   `1.24 rad` on `fingers*` and `1.42` on `fingerTip*` are guesses.
6. Guard geometry on the Engine Blade reads as a rounded blob at distance —
   the quillons want to be more angular and less deep in Z.

---

## 7. Gotchas and dead ends — read this before you start

* **`?shoot=1` disables the dev suite.** `src/main.js:34` is
  `if (qs.has('debug') && !qs.has('shoot'))`. Any scripted capture that wants
  `window.DEV` must drop `shoot=1` from the URL, which also means you lose the
  fixed-timestep determinism `shoot.mjs` gives you.
* **`window.DEV` is installed by a dynamic `import()`,** so `GAME.ready === true`
  is *not* enough. Wait on `window.DEV && window.DEV.reg` separately or the first
  `reg.exec` throws `Cannot read properties of undefined`.
* **`GAME.stop()` kills the asset browser.** `GAME.settle(n)` does not tick the
  dev suite, so the stage never frames and you photograph an empty sky with a
  4-pixel sword in it. Leave the rAF loop running and `waitForTimeout` instead.
* **The console `asset <family> <key>` command does not enable flight, but
  `assets on` does.** `DevSuite`'s `assets` command calls `this._setFly(true)`;
  the `asset` command only calls `browser.setOpen(true)`. `Stage.update` writes
  `cam.pos`, but *only* `Freecam.apply` copies that onto the real camera — so
  without `assets on` first, the stage frames a subject the camera never flies
  to. Symptom: correct `stage.dist` (1.81), camera 10 m away. Always
  `reg.exec('assets on')` **then** `reg.exec('asset weapons greatsword')`.
* **`Stage.update` early-returns when `spin` is off and `_needFrame` is spent**
  (`Stage.js:239`). For a still, set `stage.spin = true; stage.rate = 0` so it
  re-frames every frame, rather than `spin = false`.
* A working scripted stage-capture lives at
  `<scratchpad>/wshoot.mjs` — `PORT=5341 node wshoot.mjs <outdir> weapons sword
  greatsword daggers firearm polearm`. It is ~70 lines; re-deriving it costs
  half an hour of the mistakes above. It was deliberately **not** committed
  (`tools/` is not owned by this agent).
* **Ports.** Six-plus agents share this machine and `tools/daemon.mjs` uses
  `PORT+1`. `5261/5262`, `5299`, `5311/5312`, `5410/5411` were taken. This
  session used `PORT=5341 DAEMON_PORT=5342`. A daemon on a port owned by another
  checkout fails loudly with the two paths printed, which is the good case.
* **`ignis_closeup` and `prompto_closeup` are unusably DOF-blurred** — the whole
  frame, not just the background. Do not read a weapon defect out of them; see
  cross-boundary item 3.
* **Do not "simplify" `groundBlade`'s colour key.** It keys off
  `i % cross.length` (the cross-section index), not the vertex's world x, because
  a swept blade (kukri, axe bit) carries a `dx` far larger than its own
  half-width and world x reads the sweep as the grind.
* **`GeoKit.merge` only adds `aSurf` when someone in the batch asked for it** —
  19 enemy files import this kit and must not grow an attribute their shader
  ignores. Keep that guard.

---

## 8. Cross-boundary items — report, do not fix

1. **`Anim.js:334-335` curls the fingers backwards.** `agent/idles` owns this
   file.
   ```js
   this.add('fingersL', -0.24, 0, 0, w);
   this.add('fingersR', -0.24, 0, 0, w);
   ```
   Positive X on these bones curls toward the palm (`Body.buildHand` curls the
   fingers toward `-front`), so `-0.24` opens the hand into the flat paddle
   visible in every close-up. Nothing in the game ever closed a fist. The bones
   are all real — `fingers{L,R}`, `fingerTip{L,R}`, `thumb{L,R}` are built and
   skinned in `Body.js`. Suggested: make the idle rest curl mildly **positive**
   (≈ `+0.18`), or zero, and let `Character.setGrip` own the closure.
2. **`CombatAnim` never closes Noctis' hand.** Now that `Character.setGrip`
   exists, the fix is one line in `CombatAnim.lateUpdate` next to the existing
   `weaponIK` call (`src/characters/rig/CombatAnim.js:116`):
   ```js
   this.player.character.setGrip(main, ikWeight);
   ```
   where `main` is the side `weaponIK` already picks at
   `CombatAnim.js:415`. Nothing else about the anchor design should change.
3. **Noctis is left-handed by accident.** `CombatSystem.js:32` sets
   `this.hand.position.set(0.30, 1.12, 0.12)`. The rig faces +Z with its right
   side at −X (`Skeleton.js:11`), and `CombatAnim.js:415` picks the arm with
   `const main = local.x >= 0 ? 'L' : 'R'` — so a positive x anchor puts the
   sword in his **left** hand. Confirmed by eye in `tmp/shots/wp1/hero_face.png`.
   Flipping the anchor to x ≈ **−0.30** (and mirroring z / rotation to match, and
   the two other literals at `CombatSystem.js:1174` and the `REST_POS` at
   `CombatSystem.js:1367`) puts it in his sword hand. `CombatSystem.js` is not
   owned by this agent.
4. **DOF focal distance is locked to the player, not the shot's `follow:`
   anchor** — `ignis_closeup` and `prompto_closeup` are blurred edge to edge,
   which makes two character portraits unusable regardless of weapon quality.
   Camera/PostFX owner's call.
5. If item 2 is not applied, Noctis' fist stays open even though the blade now
   sits correctly in it.
