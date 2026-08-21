# Handoff — `agent/ui`

Owned: `src/ui/**`, `project/handoff/ui.md`.
Task: `project/RESCUE.md` §B5 (combatloop 21/30) and §B10 (all UI work).

---

## 1. `combatloop.mjs` 21/30 -> 30/30 — SOLVED. The game was never broken.

**Root cause: one stale line in the test, not a defect in `src/ui` or anywhere else.**

Commit `4693e3f` ("UX: kill the dead menu rows, fix Escape vs pointer lock, make
driving findable") introduced a deliberately collision-free keymap and moved the
companion techniques from **G/H/J to G/J/K** so that **H** could open the controls
card. Three places agree on G/J/K:

- `src/characters/ai/PartyAI.js:437-439` — `KeyG`/`KeyJ`/`KeyK`
- `src/ui/screens/ControlsScreen.js:37-39` — the printed keymap says G / J / K
- `src/tools/uxcheck.mjs:243-250` — *positively asserts* that `KeyH` opens and
  closes the controls card

`src/tools/combatloop.mjs:433-436` was never updated. Its technique check still
tapped `KeyH`, which opened the controls screen. Nothing in the run ever closed
it, `Menus._pointerLock` (`Menus.js:238`) then set `input.enabled = false`, and
**every later check that needs a key press failed.** That is exactly the
`menuOpen=true menusA=1.00 menu=controls` diagnostic the nameplate check has been
printing, and it explains the shape of the failure list perfectly: the first
failure is check 12, everything after it that needs input fails, everything after
it that calls a system method directly still passes.

Fix: two taps re-pointed at the shipped bindings (`KeyH`->`KeyJ`, `KeyJ`->`KeyK`).
**30/30, verified.** Commit `e7f0ad7`.

> **Cross-boundary note:** `src/tools/` is outside this agent's declared
> ownership. It is landed as its own isolated commit so the coordinator can
> revert or cherry-pick it alone. **Nothing in `src/ui/` needed to change** —
> `H` -> controls is the intended shipped binding and `uxcheck` requires it.

---

## 2. In progress

- BLINDSIDE doubling (`ui.css` `.callout .co-word`, `CombatHUD.js`)
- `map_wide` / `world` map screens
- Combat rail over the party panel in `combat_wide`
- Type / panel pass on `menu_*` / `hud_*`
- Subtitles not cleared when a scene is stopped by a new shot

## 3. Gates

| gate | result |
|---|---|
| `npx vite build` | pass (via `.githooks/pre-commit`) |
| `node src/tools/combatloop.mjs` | **30/30** |
| `node src/tools/uxcheck.mjs` | not yet re-run |
| `node src/tools/integration.mjs` | not yet re-run |
