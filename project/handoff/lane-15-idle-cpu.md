# Lane 15 — Idle CPU + RT budget + grain (cold-start brief)

Mission: plan tasks 44–45 + task 27 (grain). Idle is ~100% of a core at
60 Hz; `post.render` is 74–77% of a 6.2 ms frame (docs/BOOT_PERF.md:99;
runtime-facts.md:27 says 5.8 — re-measure first, do not trust either).

Owns: `src/engine/postfx/`, `src/engine/PostFX.ts`.

## Anchors (verified)
- Exit instrument: `node src/tools/idlecpu.mts --q high --dpr 1.5` — wraps
  post.update/post.render at idlecpu.mts:129. Target: idle < 30% of a core.
- The 60 fps cap (Game.ts:204 maxFps, honored :423) halves 120 Hz panels
  only — a 60 Hz panel is unchanged. The lever is the chain itself.
- RT inventory (code-derived, audit 2026-08-29): 28 targets ≈130 MB by
  bootprof's own formula (bootprof.mts:76-89 — note it ignores `samples`
  on the MSAA rtScene, so the real number is higher). Biggest singles:
  rtScene (full, MSAA + depth, PostFX.ts:215-226), rtVel (:228-240),
  composer ×2 (:242-250), TAA history ×2 (TaaPass.ts:39), GTAO ×3
  (via PostFX.ts:272), SMAA ×2 (:339), Exposure 2+6 small, Bloom 5+2
  (BloomPass.ts:85,337-346), DoF 2 half (DofPass.ts:229-232). The recorded
  181 MB/33 includes world-owned RTs (Water 384×192, Clouds+shadow 512²,
  Atmosphere, GodRays w/4, VFX.depthRT half, VolumePass) — do not charge
  those to this lane, but the <120 MB exit is measured by the same walk.
- Profile per pass FIRST: add a per-pass timer around the composer chain
  (or use the existing perf probes: probes/perfpasses.mts exists — read it,
  it likely already does this). Cut or gate the most expensive; candidates
  from the pass list: TAA at idle (static frame), GTAO rate, SMAA vs MSAA
  redundancy, exposure chain every frame, DoF when disabled.
- Grain (task 27): grain sits at full amplitude on flat sky (round 16 tell
  #6). Find the grain term in the grade pass (GradePass / grade.uniforms);
  modulate by luminance or mask sky (depth == far). Small, do it while
  profiling.

## Commands
- `node src/tools/idlecpu.mts --q high --dpr 1.5` before/after each cut.
- `node src/tools/probe.mts src/tools/probes/perfpasses.mts` (per-pass
  costs), `perfablate.mts`/`?post=` ablations.
- Full corpus diff after any visual change: `pnpm run check` (shot-baseline
  gate) — a gated pass must not change pixels at floor.

## First commits
1. Per-pass idle profile recorded in this handoff (the evidence).
2. One gate/cut per commit, idlecpu + shot-baseline between each.
3. Grain modulation.
4. RT cuts (share/downsize targets), walk-reported <120 MB.

## Landmines
- `?post=plain` bisects the chain in 30 s — use it before blaming a pass.
- ContactShadowPass: any march that walks the depth buffer needs a
  screen-space step cap, and capping a length invalidates every constant
  expressed as a ratio of it (thickness!). Both entries in LANDMINES.md.
- GTAO sets scene.overrideMaterial (alpha-test lost) and reconstructs
  normals from depth when not fed the G-buffer — known artifacts if you
  re-plumb it.

## Done-when
idlecpu < 30% of a core at 60 Hz, RT walk < 120 MB, corpus at floor,
perf + gameplay gates certify.
