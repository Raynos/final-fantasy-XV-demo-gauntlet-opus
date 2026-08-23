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

## Live right now — one agent

| who | lane | owns | port |
|---|---|---|---|
| perf | the certified shortfall: rank where the open-world frame's time goes | all of `src/` — no other lane is live | 5480 |

**Do not capture or measure while it runs**, and it must say in its handoff which
other lanes' files it touched.

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

## Merged tonight — eleven lanes

Boot **13.66 s → 6.88 s**. Wave 1 and Wave 2 §3.1/3.2/3.5 of sibling-ports. The
main story went from unfinishable in chapter 1 to running to the end of chapter 5;
camping, quests, hunts, shops, dungeons, Elemancy and **fishing** all work.
Buildings 1→5, Insomnia 2→6, rocks 3→5, Hammerhead 5→6.5, hands 6, outfits 5.5.
Impostor crowns had one constant normal shared by all eight vertices — neighbour
scatter 0.404 → 0.008. `integration` 18 → **27/27**, `combatloop` 30 → **31/31**.

**After any merge run `texbake.mts --force` AND `--canvas --force`** — the canvas
cache can only be pruned by the plugin, and a boot number without it is two
seconds pessimistic with no symptom.

The narrative account is `project/journal/2026-08-22-985c9fe3.md`.

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

## Perf — **measured**, certified, and short

Both gates were formally unknown all session because the ruler voided every run
under contention. With every lane merged and the tree quiet, both certified
`RULER_VALID: true`. `project/baseline-perf.json` and
`project/baseline-gameplay.json` are the origin; later runs go `--baseline`
against them.

```
perf      mean 63.1 fps, worst 31 (setpiece_deadeye), floor IQR 3.02 ms
          77 of 141 shots below 60 fps
gameplay  worst segment sprint 38.0, 27 hitches, floor 4.17 ms (24%)
          idle 40.6 · walk 42.7 · sprint 38.0 · streaming-traverse 49.4
          combat 95.2 · magic 87.0 · warp-strike 76.6 · weapon-swap 73.6
```

**The shape is the finding, and it is counter-intuitive.** Combat, magic and
warp-strike clear 60 comfortably; *standing still in a field* is 40.6. The cost
is in the open-world frame, not the effects. Nor is it simply draw count —
`town_forecourt` runs 66 fps at 971 draws and 9.8 M triangles while `vista_dawn`
runs 33 at 713 and 10.3 M. On `vista_dawn` pipelined throughput is no cheaper
than serialised latency, so that shot is single-bottleneck and almost certainly
GPU.

Unpriced things that landed tonight, each with its knob: the horizon bake
(`uHorizonMix.y → 0` drops the AO loop, keeps the shadow), the grass shadow
proxy (+84k tris, +63 draws; knob is the tuft height threshold), impostor and
rock shadows (+33–55 draws), analytic terrain relief, and the water depth model
(eight texelFetches per water pixel).

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
