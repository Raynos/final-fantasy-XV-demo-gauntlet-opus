# Lane 14 — First load (cold-start brief)

Owns: `src/engine/TexBake.ts`, `GeoBake.ts`, `src/tools/bake.mts`,
`src/tools/coldload.mts`. `texbake.mts`/`vite-plugin-bake.mts`/`FieldBake.ts`/
`FieldCodec.ts` are shared — land those as explicit-pathspec commits.
**Human decision: the demo launches on a PUBLIC URL — this lane is
mandatory and the DoD requires coldload against the deployed origin.**

## Anchors per task

**42 — first-frame marker**
- `coldload.mts:264` installs WATCH (rAF chain + longtask PO + #boot-label
  observer); `:88-114` READ — `transfer` summed at `:96` over ALL
  resources, no time cut-off; `:271-277` goto → waitFor `GAME.ready` →
  report.
- `GAME.ready` set at `Game.ts:340`, AFTER `post.render()` (`:337`) — ready
  is already one frame past first render. Honest marker = first rAF after
  that, or `boot.classList.add('done')` in `main.ts:24`; `game-ready`
  CustomEvent at `Game.ts:341`; `BootProfile.ready` at `BootProfile.ts:124`.
- **The change that makes tiering measurable: sum only
  `r.responseEnd <= firstFrameMs`** in READ (`:94-102`). Today a deferred
  tier landing at t+8 s still counts, so tiering would show zero
  improvement. Add `firstFrame` to `ColdRead`, report
  `transfer@firstFrame` alongside total, gate on the former.

**43 — tier the bake**
- Fetch sites: `TexBake.ts:165-190` (`loadTexBake` fetches TEX + TEXC in
  one Promise.all `:172-186`); `GeoBake.ts:254-277`;
  `FieldBake.ts:115-139`. Path constants `TexBake.ts:55-56`,
  `GeoBake.ts:64`, `FieldBake.ts:21`. Kick-offs at module eval:
  `TexBake.ts:431`, `GeoBake.ts:390` — all transfers start before
  Game.init().
- texc consumers: `Face.ts:1564 bakedCanvasMips` ← paintFace ← buildHead ←
  `Character.ts:117` (heroes, systems #8/#9) and `NpcRig.ts:119` (#24).
  `bakedCanvasMips` rejects a chain not ending at 1×1 (`TexBake.ts:329`)
  and falls through to `build()` — built-in repaint fallback.

## Mechanism notes — the measured fetch graph
- `terrain.bin.gz` 33.2 MB (57.7 inflated), awaited `Terrain.ts:166`,
  system #2. Sections gz: h 12.0, ctrl 8.3, far 2.9, layerSurf 3.6,
  layerAlbedo 3.0, layerDetail 1.7, farCtrl 0.9, hydro 0.8.
- `tex.bin.gz` 31.0 MB (72.0), 157 entries — **awaited at `Sky.ts:502`,
  system #1** (docstrings claiming Props are stale); also Props.ts:52,
  Hammerhead.ts:172, Dungeons.ts:193. By namespace gz: props 16.7,
  **dgn 6.8 (only consumed on first Dungeons.enter() — pure tier-2)**,
  town 5.7, sky 1.7.
- `texc.bin.gz` 20.5 MB (67.1), 132 entries = 12 faces × 11 mips. Fetched
  inside the same promise as tex, so it blocks Sky #1 though its first
  consumer is #8. **Mip split: level 0 = 14.4 MB gz; levels 1..10 =
  6.1 MB gz. Low-res tier = truncated chain: ship 1..10 (512² base),
  defer level 0.**
- `geo.bin.gz` 30.8 MB (107.5), 14 keys, awaited Water.ts:221 (#3) +
  Props.ts:57. **`GeoBake.ts:261` skips the fetch unless `?q=ultra`** —
  coldload navigates `?q=high` (`:271`), so today's run doesn't fetch geo
  at all: that (not a missing file) is why BOOT_PERF records 85.5 MB/5.
  The ~116 MB/6 figure is the q=ultra number. Per-key gz: mega/meteor
  10.2, poi/lestallum 5.8, poi/galdin_quay 5.6, water/shore 2.6.
- Bundle 1.0 MB wire; DevSuite already lazy (`main.ts:35`).

**Tiering shape: split files, not HTTP Range.** Each container is one gzip
member with a JSON index at the front (`TexBake.ts:131-140`,
`FieldCodec.ts:135-151`) — no way to read the index without inflating the
whole thing (`GeoBake.ts:134-140` says so). `publicDir`
(`vite.config.mts:44`) copies baked/ verbatim; an extra file costs one
writer line + one fetch. Range fights `Content-Encoding: gzip` on most
hosts.

**Budget arithmetic for ≤25 MB:** free wins — texc level 0 → tier 2
(−14.4), tex dgn/* → tier 2 (−6.8), geo mega/meteor + two big POIs →
tier 2 with regenerate-on-miss (−21.6 at ultra). Terrain is the wall
(33.2): (a) split layer* (8.3 gz) — `Terrain.ts:179` already has a
generator fallback; (b) **quantise h f32→u16** (range −48.1…597.2 m, step
0.0098 m): 12.0 → 5.3 MB gz. Both → terrain ~19 MB. Realistically
tex/props (16.7) must split too or tier 1 keeps the generator path for
props/rock*.

## Commands
```
node src/tools/coldload.mts --prod                    # today's default (q=high; NO geo fetch)
node src/tools/coldload.mts --prod --extra q=ultra    # the ~116 MB / 6-request truth
node src/tools/coldload.mts --prod --gate             # as check.mts:261-262 runs it
pnpm run build:full                                   # NEVER plain build in this lane
node src/tools/texbake.mts --canvas --force           # after ANY TexBake.ts/Face.ts edit
node src/tools/texbake.mts --geo                      # after ANY GeoBake.ts/Field edit
node src/tools/daemon.mts --health
```

## First commits
1. coldload.mts only: `firstFrame` in WATCH/READ/ColdRead, report bytes to
   first frame, move the gate onto it. Land BEFORE touching any byte of
   the bake (rule 3 — without it task 43 is unmeasurable).
2. coldload.mts only: `--origin <url>` that skips buildServer (`:244`) and
   navigates the deployed URL — the DoD's deploy line cannot be satisfied
   otherwise.
3. coldload.mts only: default `?q=ultra` or print a loud note that q=high
   skips geo (silently under-reports by 30.8 MB).
4. TexBake.ts only: split loadTexBake into tex and texc loaders so
   Sky.ts:502 stops awaiting the face bake; one-liner follow-ups at
   Sky.ts:502/Props.ts:52 as own pathspec commits.
5. texbake.mts + TexBake.ts: emit texc-lo (mips 1..10) + texc-hi (mip 0);
   tier 1 uploads the 512² chain; tier 2 swaps mip 0 + needsUpdate after
   first frame.

## Landmines
- **TexBake.ts is in CANVAS_SOURCES (`texbake.mts:87`) — editing it
  deletes texc.bin.gz**, and the plugin can't re-record without a browser.
  Every plain `pnpm run build` costs the painted-face cache (~2.5 s boot,
  every gate green). `build:full`, always. Same: GeoBake.ts → GEO_SOURCES
  → geo.bin.gz (~1.2 s).
- **Pre-commit runs vite build** — a commit prunes the caches too; bake
  after the tree settles, never mid-measurement.
- **src/public/baked/ is a shared symlink across worktrees**
  (`daemon.mts:872-878`) — a `--force` rewrites every lane's artifacts.
  Announce first.
- `TRANSFER_MAX = 120e6` (`coldload.mts:210`) was set against the
  geo-less 85.5 — it must come down to the new first-frame budget or the
  gate certifies nothing.
- **Quantising h changes Field.h → drawnHeightAt → every POI seat**
  (`GeoBake.ts:44-52`). Owe a --geo re-bake + seatcheck/heightcheck pass.
- A stale bake is the only cache failure with no symptom — any new tier
  file needs a stamp + prune path in vite-plugin-bake.mts.
- A shortened-at-the-top mip chain is silently accepted by
  bakedCanvasMips (that's the design) — assert the level-0 size in the
  upgrade path.
- Prod mangles class names — `Game.add()` name fallback breaks under
  --prod (`daemon.mts:793-795`); looks like a boot bug, isn't.

## Done-when
coldload --prod --gate prints bytes-to-first-frame and gates on it;
`--extra q=ultra` reports ≤25 MB to first frame with deferred tiers
landing after the marker; `?nobake=1` and a wiped baked/ still boot
(every miss path regenerates); tier-1-only page renders faces (512²) with
no black head; build:full emits every tier into dist/baked/ and
`daemon --health` stays green; deployed to the public URL and
`coldload --origin <url>` reproduces ≤25 MB over the real wire;
docs/BOOT_PERF.md updated with the new table + the q=high/q=ultra geo
caveat.
