# Status — 2026-08-22 (overnight build session)

> **This is a snapshot, and it is REPLACED in place, never appended to.** No
> dated "update —" bullets: that is the `journal/` genre. The lossless history is
> `journal/` and the git log, so deleting a line that has stopped being true
> loses nothing. It is capped at 150 lines by `.githooks/pre-commit` for exactly
> this reason — `PROGRESS.md` was allowed to accrete instead and drifted five
> months out of date while still reading as current.

**`main` @ 443 commits**, 105 tonight. Zero `any`, ratcheted. `npm run check`
**11/11**. `integration` 18 -> **20/20** and it presses keys now; `combatloop`
30 -> **31/31** (it was really 29/30 — the damage-number check sampled once).

## The session goal

Finish every open plan in `docs/plans/`, then take the game's models, assets,
world, maps and zones to AAA. **Each plan's own `Status:` line now carries its
state**, so `ls docs/plans/` answers what is open without opening anything.

## Live right now — three agents, disjoint directories, one worktree each

| who | lane | owns | port |
|---|---|---|---|
| quest-chain | 23 uncompletable objectives; two main-chain dead-ends; dungeon doors | `game/rpg/`, `ui/`, `combat/`, `characters/`, `world/map/` | 5410 |
| terrain-material | the blind judge's **new #1 defect**, plus tier-D grass handover | `world/Terrain.ts`, `world/terrain/`, `world/veg/` (tier-D only) | 5420 |
| modeling | Hammerhead, the Meteor, `_capital`, remaining `eco.height` sites | `world/props/`, `world/town/` | 5430 |

The coordinator holds `game/Game.ts`, `game/Shots.ts`, `world/Water.ts` and the
docs. **Do not take a perf or boot number while these are live** — both tools
now refuse to certify one, which is the instrument working.

## The grade — measured, not guessed

A blind A/B judge with sealed keys exists (`src/tools/compare.mts`) and the
pixel-sampled FFXV reference it grades against is in `docs/reference/`.

| round | result | environment |
|---|---|---|
| 1 | 6 identified, 0 fooled, 0 hesitated | 3/10 |
| 2 | 6 identified, 0 fooled, **one moved HIGH -> MEDIUM** | 4.5/10 |

Round 1's **#1 defect — "no exposure discipline: sky clips to white while the
ground crushes" — went unmentioned in round 2.** Against the `FFXV-field`
subset: `R-B` +20.0 -> **+0.3**, `hi(R-B)` +23.9 -> **+1.9**, `stops` +1.33 ->
+0.24, `clip%` +0.72 -> -0.50.

Round 2's ranked defects, and who has them: **terrain material** (terrain lane),
**interact prompts firing over empty landscape** — the judge called this the
cheapest fix with the biggest payoff (quest lane) — hard-edged cutout cumulus,
and placeholder geometry (modeling lane).

Component grades, self-assessed against shipped FFXV by the agent that did the
work: hands 6, outfits 5.5, hair 4.5, buildings 5 (from 1), rocks 5 (from 3).

## Merged tonight

**Boot 13.66 s -> 6.88 s cold** via three bake caches (`terrain`, `tex`, `texc`).
**After any merge run `texbake.mts --force` AND `--canvas --force`** — the canvas
cache can only be pruned by the plugin, and a boot number taken without it is two
seconds pessimistic with no symptom.

**Wave 1 instruments, all four.** A ruler that voids a run rather than printing a
number it cannot stand behind; `seatHeightAt` at 0.000 m residual to 3.4 km;
ablation dials plus the rule *ablate before re-tinting* in `BRIEF.md`; contact
shadows verified reaching.

**Wave 2 §3.1/3.2/3.5:** the reference corpus, the blind judge, and a
horizon-angle bake giving km-scale terrain shadow for two fetches.

**Nothing in the game was pressable** — `KeyE` was eaten by combat's warp ten
systems earlier — and **the main story was unfinishable from the first frame of
every session**. Both fixed. Camping, quest waypoints, hunts and shops all work.

**Buildings 1/10 -> 5/10, rocks 3/10 -> 5/10** for +3.1% triangles and five draw
calls. The Meteor of the Disc was an 80-triangle icosahedron.

**Two harness bugs that cost hours:** `check.mts` reported a terrain regression
twice when the gates were never running, and every capture tool would silently
reuse another worktree's dev server — byte-identical frames after a real change.
Both fixed; fifteen tools now refuse a foreign tree.

## Determinism — CLOSED, at the noise floor

A shot alone versus sixth in a batch: **1.836 -> 0.340 mean/255** against a
measured floor of 0.302. The cause was the **wind**, not the vegetation
streaming every handoff had guessed. `imgdiff` is trustworthy and A/B diffs are
falsifiable. Full account in `417ca86`; the wrong-diagnosis entry is in
`LANDMINES.md`.

## Where the truth is

- `BRIEF.md` — the contract. Art direction, engine contracts, definition of done.
- `project/HANDOFF.md` — the method, the tooling, the architecture.
- `project/LANDMINES.md` — what will bite you, and the diagnoses that were
  confidently wrong. Read the last section twice.
- `docs/SCOPE.md` — the atomic inventory. **Stale: last verified against `main`
  @ 98 commits (2026-08-17), 243 commits ago.** Re-verifying it is open work.
- `project/README.md` — which document is which genre.

## Gates — 11/11, 2026-08-23

`vite build` + both typechecks (per-commit) · `anycheck` 0/0 · `orphans` 281/281 ·
`integration` **20/20** · `uxcheck` 89/89 · `creaturecheck` 207 poses ·
`combatloop` 30/30 · `roadcheck` 0 fail · `heightcheck` 0.000 m · `driftcheck`
worst −1.177 m (reported, not failed).

**Run `npm run check` at every merge, not just the cheap gates.** `combatloop`
slid 30/30 → 21/30 unnoticed for weeks because the expensive ones were skipped.

## The two perf failures — formally *unknown*

`vista_dawn` 37.9 fps and `walk` 49.8 fps predate the ruler and used a different
headline (serialised latency, not pipelined throughput). **Unmeasured until
re-run on a quiet tree**, both printing `RULER_VALID: true`:

```
node src/tools/perf.mts     --out project/baseline-perf.json
node src/tools/gameplay.mts --out project/baseline-gameplay.json
node src/tools/seatcheck.mts
```

Exit 3 means throw the run away, not discount it; `check.mts` shows it as
**VOID**. One finding survives: on `vista_dawn` throughput is no cheaper than
latency, so that shot is single-bottleneck and almost certainly GPU. The horizon
bake and the grass shadow proxy are both unpriced.

## Still weak, and who has it

Hair still reads as quills. `Bushes.ts` (491 lines) has never been audited.
`MapScreen` is a 22-line stub. `anak` needs a sculpt rather than paint. Nothing
in our frame ever reaches white — eight of ten reference plates clip >=0.10%,
four of our six clip at exactly 0.00% — and the fix is internal dynamic range in
the cloud, not exposure.

Genuinely strong: the field HUD, atmosphere and aerial perspective (measured on
the reference now), terrain strata and silhouette, the world map, the opening
cutscene, warp-strike VFX, and km-scale terrain shadow.

## Next, in order

1. **Re-measure perf** the moment the tree is quiet (commands above).
2. **A fresh harsh-critic pass graded against shipped FFXV** — the 4.5/10 predates
   essentially everything now in the game. The graphics lane is building the
   instrument.
3. **Re-verify `docs/SCOPE.md`** — stale since `main` @ 98 commits, and the content
   lane reports it stale in the *understates the game* direction.
4. Still missing entirely: chocobos, fishing, photo-mode capture, fast travel, the
   remaining towns.
