# npc-shadows — the town's people stop casting four shadows each

**Status: done and verified by eye. Ready to graduate.**
Commits `a465ad0`, `a50ad33`, `881d065`. Owns `src/characters/npc/**` only.

The town shell (`00153c6`) and every POI (`a1c8d52`) already merged their shadow
casters; the NPCs were left out because they are skinned, and a merged *static*
proxy would cast a bind-pose shadow of a posed character.

## What it does

`src/characters/npc/NpcShadow.ts` (new) — `skinnedShadowProxy()`. Merges an
NPC's **body + head + outfit** into one position-and-skin-only `SkinnedMesh`,
`bind()`-ed to the *source* skeleton (the trick `VelocityPass._proxyFor` already
uses), material `colorWrite:false / depthWrite:false / shadowSide:BackSide`.
`NpcRig.ts` builds one per `NpcBody`, clears `castShadow` on the three sources,
and `setLod` toggles the proxy's `visible` and `castShadow` at LOD 0 only.

Three things in it are load-bearing, and each has its reason in the file:

- **The hair is not merged.** `hairMaterial` is `alphaTest: 0.35` with a banded
  `alphaMap`, and three copies the cutout onto the depth material — so the
  hair's shadow *is* its holes. Position-only it would return as solid quads on
  the forehead and shoulders. It casts as itself. Merging it was worth ~21 more
  draws on `town_forecourt` and is not worth having.
- **`userData.noVelocity = true`.** `VelocityPass` treats every visible
  `SkinnedMesh` as a mover unconditionally, so without it the proxy acquires a
  motion-vector proxy of its own: 11 draws and 660k tris for pixels the four
  real meshes already wrote.
- **`onBeforeRender`/`onAfterRender` close the draw range.** The colour-pass
  draw call cannot be avoided (three will not run a caster the view camera
  cannot see — `WebGLShadowMap.renderObject` tests `visible`, `material.visible`
  and `layers`), but its triangles can. The shadow path uses `onBeforeShadow`
  and never touches these hooks.

## Measured

`renderer.renderBufferDirect` wrapper on the exact frame `shoot.mts` photographs
(`src/tools/probes/npcdraws.mts`, new). `town_forecourt`, before:

    frame 942 draws;  src/characters/npc/ = 156  (72 colour + 84 shadow)

`drawcheck town_npcs town_forecourt town_diner town_garage`, fresh, uncached,
`e7f4602` -> `a50ad33`:

| shot | before | after | |
|---|---|---|---|
| town_forecourt | 922 | 902 | |
| town_npcs | 896 | 841 | |
| town_garage | 893 | 838 | |
| town_diner | 810 | **790** | under budget |

Corpus-wide the over-budget set went **11 shots -> 9**; `town_diner` and
`town_board` cleared. Nothing regressed. Triangle counts are *identical to the
pre-merge frame, to the triangle* (11,811,004 / 10,693,813 / 10,694,640) — which
is the cleanest confirmation of the premise: one merged caster rasterises what
the three it replaced did, no more, no fewer.

`check:gate` 5/5. `typecheck` + `typecheck:tools` clean.

## Verified by eye

`src/tools/probes/npcshadowlook.mts` (new) poses `town_npcs` and walks the
camera to each townsperson, framing from **down-sun at 3.4 m** so the cast
shadow runs toward the lens. The corpus town shots frame architecture; their
people are twenty pixels tall and half stand in shade, so a shadow that lost a
limb would not show in any of them.

Looked at Cindy (lean), mechanic_a (wrench, bent double) and Dave before and
after: Cindy's head/shoulder/arm shadow down the kerb is unchanged and still
shows the hair's spiky silhouette; the mechanic's forearm shadow on the panel
behind him still follows his pose. `imgdiff` over eleven framed NPCs:

    e7f4602 -> a50ad33   worst mean 0.192/255
    a50ad33 -> 881d065   worst mean 0.193/255

against a measured floor of 2.00 — i.e. less than two boots of the same build
differ by.

> **Trap, and it cost an hour.** A `probe.mts` run is *not* reproducible
> boot-to-boot: it leases a pooled page, and a route-walking NPC (`kid`,
> `trucker`) lands at a different walk phase, which moves the camera this probe
> derives from their position — sometimes inside a truck. Two captures of the
> **same sha** diffed at **mean 119/255 over 94% of pixels**. Diff a third
> capture of the same build before believing an A/B from this probe.

## Reported, not fixed (outside this lane)

- `shadowProxy` is now duplicated **three** ways — `world/town/Hammerhead.ts`,
  `world/props/PoiKits.ts` and here. The first two report it belongs on
  `world/props/PartBuilder.ts`. This copy is skinned and takes a skeleton, so
  even after that move it is a sibling, not the same function.
- **`project/draw-baseline.json` is now stale by a lot** — eight of its eleven
  entries have improved (`town_forecourt` 945->902, `town_npcs` 941->841,
  `cine_hammerhead` 933->845, …) and two have cleared the budget outright. It
  wants `drawcheck --set-baseline` **over the full corpus**. Deliberately not
  done here: it is a shared ledger, three lanes are moving those numbers at
  once, and a `--set-baseline` from a four-shot run would delete the other
  seven entries.
- The first commit's message has a `town_garage 893 -> ...` placeholder in its
  final table; the real number is 838 and `a50ad33` states it. Not amended —
  it is no longer `HEAD` and this trunk is shared.

## Left

Nothing in this lane. The next largest NPC block is the **28 colour draws** the
eye globes and contact-shadow blobs spend (two eye meshes plus one blob per
person, `npc/Mesh` in `npcdraws.mts`'s output). Merging the two globes is not
possible as they stand — they ride independent gaze pivots.
