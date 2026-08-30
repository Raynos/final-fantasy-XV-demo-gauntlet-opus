# To nine — anchored to the instrument

Status: PROPOSED (2026-08-30, fable) — supersedes `2026-08-29-opus-to-nine.md`
(archived). Every claim was re-verified 2026-08-29/30 against the code at
`66b354ad` or a fresh `--jpeg` capture, and — the part that restructured this
plan — **checked against what the blind judge actually ranked** in round 16.

**Why this is not the opus draft with corrections.** The opus draft audited
clean on most single facts, but it and the judge barely overlap: **six of round
16's eight ranked tells had no task in any lane** (skin shading, cloud
organisation and edge, shadow sky-fill, near-field bare ground, one hue per
frame, flat grain — plus sea-slab water and rain), while whole lanes went to
things no judge or player will ever see (eye program dedup, palm framings,
tomb stubs, submerged boulders). And the one *proven* hesitation lever — the
`vista_dawn` recipe, four round-15 items in one frame that made the judge stall
— appeared nowhere. This plan is ordered by the tells. Also fixed from the
audit: the 9/10 definition is restored and gates the DoD; "round 17 in flight"
was a phantom and is now a task; two refuted items are gone (hair `mips: 0`
was a probe artifact; `assertAttributeContract` is already wired); ~10
mechanisms corrected inline; every done-when names an instrument that exists
or builds it first.

---

## §1 — The number

**Polish 9/10 = blind-critic hesitation ≥30%** on a 20-pair round with **≥2
frames called wrong** (`compare.mts`, shuffled control arm, round 16's method).
Today: 5%, 0 fooled — and the control arm separates, so the instrument works.

**Playable 9/10 = a first-time player, no instruction, 30 minutes, fewer than
three things that feel broken.** Today unknown; the one human sample found the
mirrored steering in about a minute.

Both may be missed. The plan closes only **with the measurement published**.

## §2 — Rules

1. **No section may grow.** Leftovers → `project/TASKS.md`, traps →
   `LANDMINES.md`, decisions → `HUMAN_REVIEW.md`.
2. **A measured negative closes an item** and counts as a win.
3. **Where an exit's instrument does not exist, building it is the lane's
   first task.**
4. **Ownership is disjoint by file.** The two named cross-lane one-liners
   below land as their own explicit-pathspec commits. Anything else touching
   another lane's file goes to `TASKS.md`.
5. **Presentation lanes re-order on round 17's ranked tells when it lands**;
   until then, round 16's order (below) stands — it is real data, not vibes.

## §3 — Round zero

- **R1. Run judge round 17** (nothing is in flight — the opus draft asserted a
  phantom). 20 pairs + shuffled control arm. `HUMAN_REVIEW.md` already flags
  "no judge round since 16".
- **R2. Playtest protocol + three human sessions.** 30 min, no instruction,
  ranked what-felt-broken. Human time, via `HUMAN_REVIEW.md`. The only
  instrument that has ever found an input bug.

---

# Part A — Presentation, in the judge's own order

## Lane 1 · Skin and hair *shading* — `src/characters/rig/`

Round 16, tell #1, corrected blind note: *"It is entirely a shading problem."*
The opus draft aimed this lane at sculpt brushes; the judge named none of that.

1. **Fix the winding first.** Probe-verified live: `Noctis_body` signed volume
   −6.7e-2 with 0% of front triangles facing +z; both eye meshes negative.
   Wrong normals corrupt every shading fix stacked on top. (`facewind` does
   reach these meshes — the draft's "unchecked" was false; nobody *acted* on
   it. Name the eye meshes — `Character.ts:210` never does — and run the other
   three heroes.)
2. **A subsurface cue.** The judge: a backlit ear staying flat opaque "is most
   of why the head reads as plastic". Cheap approximations exist (wrap
   lighting, thickness-tinted rim); the bar is `hero_profile`'s backlit ear
   glowing red-warm.
3. **Skin-detail scale.** Pores currently "read as scratches scribbled across
   the cheek" — the detail texture runs far too coarse. Re-scale against a
   1568 px read of `hero_portrait`.
4. **Hair: anisotropic highlight + edges.** Cards are already alpha-tested
   12–18 mm strips (`Hair.ts:647-675` — the draft's "sub-pixel opaque tubes"
   describes a replaced system); what the judge sees is "opaque hard-alpha
   shards, aliased edges, no anisotropic highlight". Add the aniso term, and
   `coverageAA` on the hair material (`Materials.ts:799` — this lane owns it).
5. **Why does blond render near-white?** Constants are already blond/taupe
   (`Cast.ts:493` `0xa8977e`) and the straw-specular fix already landed
   (`Materials.ts:300-309`) — yet `hero_full` still shows two near-white
   heads. Diagnosis task; the constant edit has been tried.
6. **The painted creases and the mid-face diagonal** — confirmed at
   `hero_portrait`; damping is exhausted (pass 6 took 22–46%), re-derive
   against the visible surface. Ranked below the shading items because the
   judge ranked shading, not sculpt. Done: `facecheck` green with lane 12's
   VOID fix in.

## Lane 2 · Costume — `src/characters/` except `rig/Face.ts`, `Hair.ts`

7. **Cloth folds.** Round 16 on `hero_full`: "flat-shaded clothing with no
   cloth folds". Shading-level folds (normal detail on the sweeps), not new
   geometry — the sleeve's three surface passes are a recorded negative, so if
   shading fails again, that is the measured negative that ends it.
8. **Forward the shirt print's authored resolution — verified live bug.**
   `Cast.ts:193` authors `steps: 42, seg: 76`; `printPatch` ignores them and
   re-sweeps at 56×64 (`Outfit.ts:221,238`). The skull print is confirmed
   illegible.
9. **The triangular skin hole at Noctis's collar** — confirmed in frame.
10. **Ignis at distance.** Close up he has lapel/belt/hem/collar (the "one
    black column" claim is false at `hero_face` range); he collapses in
    `party_formation`. Value separation at 4 m+, not garment construction.

## Lane 3 · Near-field and composition — `src/world/veg/` seating + shot framing

The proven lever. `vista_dawn` — foreground occluder, near-field cover, sky
occluded, full hue range — is the only frame that ever made the judge stall,
and round 16 says the bare bottom third survives **in 19 of 20 frames**.

11. **Grass, shrubs and saplings reaching into the lens** across the bottom
    third of the judged landscape shots — `zone_longwythe`, `zone_vannath`,
    `zone_three_valleys`, `vista_dusk`, `zone_lestallum` first. The existing
    cover band measurably did *not* move this (round 16 §"Did the cover band
    move it?"). Price draws with `vegcensus`; perf gates stay green.
12. **Fix the star-shaped grass billboards at the party's feet**
    (`hero_full`, tell #1's last line).
13. **Foreground occluders.** Round 15 tell #5: nothing crosses the bottom or
    side of any frame. A branch over the top, a trunk on the left — per
    judged vista, via veg seating near the camera or reframing. Reframing
    touches `src/game/Shots.ts`, which is shared: **this lane is its named
    owner for the duration**, and every framing change re-baselines through
    `imgdiff` deliberately.
14. **The midground is sparse, not empty** — the draft's "nothing in 15–97 m"
    is refuted (fresh `hero_full`: tree at ~20 m, bush at 40–80 m). Only act
    here if round 17 ranks it.

## Lane 4 · Clouds — `src/world/Sky.ts`, `src/world/sky/`, `src/shaders/clouds.glsl.ts`

Tell #2, "the loudest landscape tell", deciding six frames on sight. The judge
named **organisation** and **edge crispness** — the opus draft chased neither.

15. **Organisation.** "Many similar-sized puffs spread evenly, no streets, no
    systems, no large cell beside a small one." Macro-structure of the
    coverage field, not the march.
16. **A crisp sunlit top edge.** The mass "reads defocused — the signature of
    a half-res raymarch upsampled". Resolution/upsample of the march, or a
    sharpening of the density edge. Separate work from #15.
17. **Internal dynamic range** — measured 0.87–1.06 stops crown-to-base, wants
    2+. Levers verified: the `cRemap` pair (`clouds.glsl.ts:132,143`),
    `uCloudSunGain` (`Sky.ts:1036`) vs `uCloudMaxRad` 9.5. Recorded negatives
    stand: not `uCloudTap`, not `MARCH_SCALE`, not exposure. Supports #15/#16;
    ranked after them because the judge named them, not this.

## Lane 5 · Light in shadow — `src/world/terrain/` (except `Field.ts`)

Tell #3, re-specified by the judge's own 3× crops: **no hatch exists** — the
real defects are "near-black with no blue sky fill at all", darks that
"posterise into visible bands", and "no mid-frequency geology".

18. **Sky fill in shadowed terrain.** Shadowed slopes must carry blue ambient.
    (LANDMINES: shadow warmth is aerial perspective over otherwise-black
    shadows — the fill is genuinely missing, not mis-tinted.)
19. **De-posterise the darks** — banding in the surviving low values.
20. **Mid-frequency geology.** Strata/scree/drainage between the ≤0.65 m
    detail maps and the 64 m-texel horizon bake (verified gap ~0.65→300 m:
    `TerrainMaterial.ts:2094`, GTAO 0.62 m, `uHorizonMix` fading in ~300 m).
21. **`zone_vannath`'s cloud-shadow floor** — measured p50 luma 10.9, core
    7.1. Mechanism verified: preset `shadowScale` 3.5 × `uShadowTile` 2700 →
    ~640 m patches. Don't take scale to 1.0 alone; don't deepen. Done: same
    crop boxes ≥30/255, patches within 2× of their clouds.

## Lane 6 · Hue range — zone palettes

22. **One hue per frame** (tell #5, unchanged across two rounds;
    `zone_three_valleys` is "brown, entirely"). Per-zone accent flora, rock
    variance, path/scrub contrast — green, gold, teal, maroon in one frame is
    what `vista_dawn` had. Build the sky-matched reference slice before
    chasing any single channel number (`imagestats.mts:418`'s own caveat; the
    draft's −20.7 figure is unsourced).

## Lane 7 · Water and weather — `src/world/water/`, `src/world/Water.ts`, `src/world/weather/`

23. **The sea is one slab** (tell #7: `zone_galdin`, `zone_vesperpool`) — "a
    single flat value with a repeating specular ripple, no shoreline
    interaction, no depth colour ramp, no wave-scale variation". This is the
    judged water; the draft's tarn/river items weren't.
24. **Rain** (tell #8, `storm`): uniform identical lines, no splash, no ground
    interaction. Density variation + impact response.
25. **Frame the unjudged water before fixing it.** No shot covers the
    Maidenwater or any river — both draft claims are unfalsifiable today.
    Probe framings (not `Shots.ts`); then judge the tarn mottle
    (`Water.ts:721-732` churn terms — the 45.7%→14.9% band fix landed and
    verified) and the river sheet (`RiverMaterial` already grew a 0.34 alpha
    floor — it may be closed).
26. **`gradePad` V-from-height** — verified exactly (`Wear.ts:773`, 1.6 m of
    radius against a 26 m wall = 16.25:1), and `poi_haven` *is* in the judged
    set. `HUMAN_REVIEW` asks who pays the every-apron blast radius: staffing
    this line is that decision, made by the human when locking the plan.
    Owns `src/world/props/Wear.ts` for it.

## Lane 8 · Grain — one item, in `src/engine/postfx/`

27. **Grain sits at full amplitude on flat sky** (tell #6) — modulate by
    luminance/texture or mask the sky. Cheap; belongs to the postfx lane
    below in staffing but is a presentation item, so it's named here.

# Part B — Playable

## Lane 9 · Input truth — `src/ui/`, `src/world/vehicle/RegaliaSystem.ts`

28. **Fix the card, not the code** — verified: 5 of 12 combat rows wrong
    (card says R/X/Y/6–8; code is E/R/V/Z-X-B; heavy-attack F missing), the
    correct table already exists as `CombatSystem.ts:1458-1470`'s JSDoc, the
    HUD strip repeats two bad pairs (`Prompts.ts:21`), and
    `ArmigerScreen.ts:239` contradicts the card on the same binding.
29. **Key collisions** — T, and also B, V, F collide between combat and
    Regalia (the draft knew only T). Verify mode-exclusivity; rebind the
    Regalia side where live; document all.
30. **A steering-sign gate** — `regaliadrive` takes `Math.abs(h1−h0)`; a car
    steering backwards passes. Drive `KeyA`, assert the sign.
31. **The Armiger caption** — `--ink-4` at 0.34 alpha, 8.5 px, no text-shadow
    (`ui.css:914`). Restyle. (The draft's "two-column screens 35% empty"
    names no real screen — the grid is four columns; find it from a capture
    or drop it.)

## Lane 10 · Fight shape — `src/combat/`, `src/game/encounters/`, `src/game/rpg/`

32. **Instrument first: `fightshape` computes no median** — it prints three
    rounds. Add the aggregation the exit needs.
33. **`enemyScaling` lies about itself** — JSDoc says party level; the body is
    `nightScaling(hour, isDaemon)` (`RpgSystem.ts:720-721`). Implement the
    party read or fix the doc, then tune.
34. **Pack size** — verified levers: `Pack.maxEngaged` 2 (wild 3, six
    authored 3s, bosses 3→4), `spawnRoamer` cap 3, counts [1,1]→[4,7].
    Context corrected: 22 000 hp tops only the *wild roster* (Deadeye 34 k,
    MagitekArmour 32 k); `LEVEL_LIFT` 1.0 is a design comment, not
    saturation.
35. **Warp throughput** — re-measure first: the draft's "3–12 casts" matches
    `dpsshare`'s 3 m/12 m *distance* labels; only `fightshape` measures
    shares.

**Exit:** median den 18–30 s, Noctis pays ≥15% HP, `combatloop` 31/31, both
perf gates certify.

## Lane 11 · The playtest's own list — reserved, unstaffed until R2 reports

36. **R2's ranked what-felt-broken becomes this lane's queue.** Both drafts
    called the playtest the most important instrument and then staffed 100%
    of capacity on pre-known items, leaving the ranked list it produces with
    no owner. This lane is that owner. Known candidates that wait for it
    rather than pre-empting it: the Fociaugh approach (fresh capture shows
    **no cave mouth in frame at all** — and the apron is `fociaugh_menace`'s,
    70 m away; `fociaugh` itself is excluded by `PoiKits.ts:2776-2795`; talus
    design in `e5557e5`'s message), Balouve's missing adit (headframe on bare
    dirt), Malacchi's missing pond (verified: nearest water 133.5 m, 28 m
    below).

# Part C — Launchable (moves neither 9; gates the demo — the human's TODO)

## Lane 12 · Memory and boot — `src/engine/` except `postfx/`, plus the veg/props boot caches

37. **`skinWeight` → Uint8** (verified Float32×4, `Geo.ts:250`; ~15 MB).
38. **`AttrPack` for the 115 streamed POI sites** (only Dungeons calls it;
    the one-line call lands in `src/world/Props.ts` — named cross-lane
    commit).
39. **Census the towns** — 3.70 M resident verts recorded; they are merged
    per-material plus a 670 k-vert shadow proxy, not single geometries.
    Remove the unreachable.
40. **Boot caches:** `Props.landmarks` → `bakedParts` (verified
    PartBuilder-shaped with a root; ~46 ms); a cache shape for `Rocks`' two
    rootless `TileStream`s (~78 ms); cache `Vegetation.prime`'s *result*
    (610 ms — deleting it is a measured negative, 13.359/255 on `hero_full`;
    tile bookkeeping must restore with the matrices).
**Exit: tab under 800 MB** (`bootprof --mem --play --prod`, flags verified;
the mem page boots `?q=ultra`), from 1 246 MB.

## Lane 13 · First load — `src/engine/TexBake.ts`, `GeoBake.ts`, `src/tools/bake.mts`, `coldload.mts`

41. **Instrument first:** `coldload` measures bytes to `GAME.ready`, not first
    frame — add the marker or re-spec the exit honestly.
42. **Tier the bake — the real number is ~116 MB over 6 requests**, not the
    draft's 85.5/5 (measured the day `geo.bin.gz`, 30.8 MB, was missing;
    it's back on the boot path via `GeoBake.ts:63` → `Props.ts:57`).
    Deferring `texc` is not free — it feeds boot-path face bakes
    (`TexBake.ts:175` → `Face.ts:1564`); low-res first tier or a repaint
    fallback. Done: **≤25 MB to first frame by task 41's instrument.**

## Lane 14 · Idle CPU — `src/engine/postfx/`, `PostFX.ts`

43. **`post.render` is 74–77% of a 6.2 ms frame** (the draft's 5.9 appears in
    no recording); the cap helped 120 Hz only. Profile per pass, cut or gate.
    Includes task 27 (grain) while in the files. Done: **idle <30% of a core
    at 60 Hz** (`idlecpu --q high --dpr 1.5`), from ~100%.
44. **RT budget** — code enumerates 28 chain targets ≈130 MB; the recorded
    181/33 includes world-owned RTs and undercounts MSAA. Done: the walk
    reports <120 MB, corpus at floor.

## Lane 15 · Gates — `src/tools/`

45. **A bake-artifact gate** — none of `check`'s 23 gates looks at
    `src/public/baked/`; a missing bake is treated as 41 s of latency.
    `daemon --health` already warns. This gate is what would have caught the
    stale 85.5 MB number.
46. **Make `facecheck`'s VOID a failure** — voided heads currently skip and
    PASS (`facecheck.mts:765-772`). Lane 1's exit depends on it.
47. **The NaN sweep** — unguarded `normalize(` / varying-base `pow(` across
    remaining shaders; a NaN blob in a judged frame is an instant
    identification. Findings to owning lanes via `TASKS.md`.

---

## Demoted to `project/TASKS.md` — audited out, not lost

Real but serving neither 9 nor the launch: `Wear.ts:873` uuid program key;
eye-program dedup (the splitter is the iris literal, ~17 programs, not
`gloss`/22); `Water._visible` reflection draws (perf already certifies);
palm framings (too tight, ~117 mm vs a ~185 mm hand — not "inside geometry");
tomb stubs (deliberate: `rng < 0.16` at `PoiKits.ts:1537`; no Mystic shot
exists); Crestholm's ~23 submerged boulders (`_genOutcrop` lacks
`rockScatter`'s water reject); impostor-ring texel check (ring is 250–330 m,
not 210–280; no tell names it); card-albedo baking; euEu 162.5→155 (probe
output, no judge sees 7 mm); noise-floor calibration (20/142 measured, not
18); archive/handoff pruning. Deleted outright: hair `mips: 0` (probe
artifact) and the `assertAttributeContract` wiring (already done, 4/4).

## What this costs

Waves of 4–5 lanes on the shared trunk, one ~3 h/150-turn lifetime each:
**two to four days of wall-clock** plus human playtest time. Lanes 1–3 may
respawn from handoff. The opus draft's "one day" was unsupported.

## Definition of done

- [ ] All tasks landed or closed with a measured negative.
- [ ] `check` green, `nanscan` 0/142, both perf gates certifying.
- [ ] Tab <800 MB, first load ≤25 MB by task 41's instrument, idle <30% of a
      core, median den 18–30 s.
- [ ] **Round 18 and the post-fix playtests run and published against §1's
      bars — hesitation ≥30% with ≥2 fooled; fewer than three broken-feel
      reports — hit or missed, with the numbers.**
- [ ] This file archives when the lanes and R2/R18 report. No section may be
      added to it.
