# Status — 2026-08-22 (overnight build session)

> **This is a snapshot, and it is REPLACED in place, never appended to.** No
> dated "update —" bullets: that is the `journal/` genre. The lossless history is
> `journal/` and the git log, so deleting a line that has stopped being true
> loses nothing. It is capped at 150 lines by `.githooks/pre-commit` for exactly
> this reason — `PROGRESS.md` was allowed to accrete instead and drifted five
> months out of date while still reading as current.

**`main` @ 370 commits.** Zero `any`, ratcheted. `npm run check` **10/10** after
merging the boot, instruments and content lanes. `integration` is 18 -> **20/20**
and now actually presses keys.

## The session goal

Finish every open plan in `docs/plans/`, then take the game's models, assets,
world, maps and zones to AAA. Ordered by impact, agreed at the top of the
session:

1. sibling-ports **Wave 1** — the instruments, because they make everything
   after them falsifiable
2. **Phase 3** — boot and memory
3. **Phase 4** — content and gameplay
4. the two unowned perf failures
5. **procedural-modeling** — the art ceiling
6. **harness-daemon** — infra; pays back across sessions, not tonight
7. **process-lifts-from-kami** — three of five items already shipped

## Live right now — four agents, disjoint directories, one worktree each

| who | lane | owns | port |
|---|---|---|---|
| boot-memory | Npcs 2197 ms, warmup ~1900 ms, Party, Minimap — extend the texture bake to them | `engine/Warmup.ts`, `engine/PostFX` precompile, `world/props/`, `world/town/`, `world/dungeons/` | 5320 |
| heroart | hands, outfits, hair — the AAA character push | `characters/` rig, meshes, materials, enemy *meshes* | 5350 |
| graphics-ceiling | sibling-ports **Wave 2**: art-direction corpus, grade-vs-reference + blind A/B, horizon-angle bake | `engine/postfx/`, `world/Terrain.ts`, `world/terrain/`, `world/Sky.ts`, `world/sky/` | 5360 |
| content-wire | WS-4 quests/hunts, WS-5 camp/cook/rest — the 30-minute slice | `game/rpg/`, `ui/`, `combat/`, enemy *behaviour* | 5370 |

The coordinator holds `game/Game.ts`, `game/Shots.ts`, `world/veg/`,
`world/Water.ts` and the docs. **Do not take a perf number while these are live.**

## Merged tonight

**Boot: 13.66 s -> 9.17 s cold** (measured quiet by that lane). `src/engine/TexBake.ts`
caches every keyed `DataTexture` into `src/public/baked/tex.bin.gz` the way the
terrain field already was — 143 textures, 27.4 MB gz, source-hashed, byte-verified
against `?nobake=1` at the run-to-run floor. Props 1963 -> 178 ms, Town 1465 -> 267,
Dungeons 1443 -> 176. Two of the plan's premises were wrong: `Dungeons` was always
lazy, and `Props.landmarks` was `PropMaterials` memoisation landing on the first
caller. **Run `node src/tools/texbake.mts --force` after merging anything.**

**Wave 1 instruments — all four closed.** A self-validating ruler
(`src/tools/ruler.mts`) that measures its own noise floor and **voids the run**
rather than printing a number it cannot stand behind; it promptly voided `perf`
at a floor IQR of 27% of a frame, which is the instrument working. `seatHeightAt` /
`drawnEnvelope` on `Terrain` with **0.000 m residual from 60 m to 3.4 km**
(`seatcheck.mts`). Ablation dials: `shoot --ablate/--hide/--raw`, `imgdiff --heat`,
and the rule *ablate before re-tinting* written into `BRIEF.md`. Contact shadows
verified present and reaching — max 149 over 4.5% of pixels at the party's boots.

**Nothing in the game was pressable.** `CombatSystem` bound `KeyE` to
`warpToPoint()` and Combat is system 11 while Interaction is 21, so every press
warped Noctis twelve metres before `Interactables.update` ran. Every shop, board,
caravan, pump, Regalia and NPC advertised a prompt none could honour. Fixed, and
all three RPG coordinate tables now derive from `WorldMap` — camping answered
`no-haven` everywhere and **no `reach` objective could ever complete**, because
`checkProximity` measured against places that do not exist.

## Determinism — CLOSED, at the noise floor

The top item in `RESCUE-2026-08-21.md` §B1. A shot alone versus sixth in a batch:
**1.836 -> 0.340 mean/255**, against a measured floor of 0.302. The cause was the
**wind**, not the vegetation streaming every handoff had guessed —
`Weather.resetClock` set only a lerp-skip flag while the integrated gust phase
drove `windStrength` 0.840 vs 0.944 between a page's first shot and its sixth.
Streaming was a real second cause and is also fixed (`converge()` from
`Game.settle`), but on its own it was worth 0.009.

**`imgdiff` at 1.5/255 now means something and A/B diffs are falsifiable.** Every
shot moved ~1.06 against its old PNG because the wind sits at gust phase zero —
re-baseline the corpus, do not chase it. Full account in commit `417ca86`; the
wrong-diagnosis entry is in `LANDMINES.md`.

## Where the truth is

- `BRIEF.md` — the contract. Art direction, engine contracts, definition of done.
- `project/HANDOFF.md` — the method, the tooling, the architecture.
- `project/LANDMINES.md` — what will bite you, and the diagnoses that were
  confidently wrong. Read the last section twice.
- `docs/SCOPE.md` — the atomic inventory. **Stale: last verified against `main`
  @ 98 commits (2026-08-17), 243 commits ago.** Re-verifying it is open work.
- `project/README.md` — which document is which genre.

## Gates — 10/10, 2026-08-23

`vite build` + both typechecks (per-commit) · `anycheck` 0/0 · `orphans` 281/281 ·
`integration` **20/20** · `uxcheck` 89/89 · `creaturecheck` 207 poses ·
`combatloop` 30/30 · `roadcheck` 0 fail · `heightcheck` 0.000 m · `driftcheck`
worst −1.177 m (reported, not failed).

**Run `npm run check` at every merge, not just the cheap gates.** `combatloop`
slid 30/30 → 21/30 unnoticed for weeks because the expensive ones were skipped.

## The two perf failures — now formally *unknown*

`vista_dawn` 37.9 fps and `walk` 49.8 fps are the last numbers on record, but they
predate the ruler and used a different headline (serialised latency, not pipelined
throughput). **Treat them as unmeasured until re-run on a quiet tree**, both
printing `RULER_VALID: true`:

```
node src/tools/perf.mts     --out project/baseline-perf.json
node src/tools/gameplay.mts --out project/baseline-gameplay.json
node src/tools/seatcheck.mts
```

Exit 3 means throw the run away, not discount it; `check.mts` shows it as **VOID**.
One finding survives: on `vista_dawn` throughput is no cheaper than latency, so
that shot is single-bottleneck and almost certainly GPU.

## Quality — the scores are stale and you are flying on them

Last harsh-critic pass: **4.5/10 overall** — environment 7.5, world dressing 5,
UI 8, combat VFX 6.5, characters 5.5. That pass **predates essentially
everything now in the game**. A fresh pass graded against *shipped FFXV* is the
next thing worth doing after the current lanes merge.

Genuinely strong: the field HUD, atmosphere and aerial perspective, terrain
strata and silhouette, the world map, the opening cutscene, warp-strike VFX.

Known weak and now owned: hands are mittens, outfits flat black, hair reads as
quills (heroart). Still unowned: `Bushes.ts` (491 lines) has never been audited,
`MapScreen` is a 22-line stub, `zone_weaverwilds` has no shot to capture it with,
and `anak` needs a sculpt rather than paint.

## Next, in order

1. **Re-measure perf** the moment the tree is quiet (commands above).
2. **A fresh harsh-critic pass graded against shipped FFXV** — the 4.5/10 predates
   essentially everything now in the game. The graphics lane is building the
   instrument.
3. **Re-verify `docs/SCOPE.md`** — stale since `main` @ 98 commits, and the content
   lane reports it stale in the *understates the game* direction.
4. Still missing entirely: chocobos, fishing, photo-mode capture, fast travel, the
   remaining towns.
