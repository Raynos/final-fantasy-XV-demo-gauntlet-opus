# Handoff — `agent/idles`

Written by the **coordinator**, not by the agent: the agent stalled mid-sentence
("Now I'll add `Animator.rest()` and `Party.snap()`") when the machine
saturated, and its session was lost. Everything below is reconstructed from its
committed work, its approved plan, and its own code comments.

Plan of record: `~/.claude/plans/logical-finding-flute-agent-a2cb8d7d8b108776c.md`

## Files owned

`src/characters/rig/Anim.js`, `src/characters/rig/CombatAnim.js`,
`src/characters/rig/Posture.js` (new), `src/characters/Party.js`,
`src/characters/Player.js`.

**Ownership note:** this agent was moved *off* `src/characters/Cast.js`
mid-round — `agent/heroart` owns `Cast.js` appearance data (hair, scar, vest,
coat). Posture data therefore lives in the new `rig/Posture.js` instead. Keep
that split; the two agents would otherwise collide in one file.

## State

**Committed and building** (`4b692bb` + a `WIP:` commit on top):

- `rig/Posture.js` — per-character posture descriptors, keyed
  `noctis|gladio|ignis|prompto`.
- `evalIdle` rewritten around weight bands; **two inverted signs fixed** that
  the agent found by reading: `hips z: -load*0.085` put the weighted hip *down*
  when it should ride up, and both clavicles took the same `+load*0.05`, tilting
  the shoulder line *with* the pelvis instead of counter to it.
- `footYaw` now actually read by `footIK` — it was declared in the constructor
  and never used, which is why every foot pointed dead ahead.
- `evalStance` / `evalGesture` for a real fighting stance and additive beats.
- **`Animator.rest()`** — the last thing it wrote before stalling. Winds the
  animator back to its boot state.

**Not verified by eye.** No capture round was completed after the final edits.
Nothing here has been looked at. Treat every claim above as "the code says so",
not "the frame shows so".

**Not started: `Party.snap()`.** This is the important gap — see below.

## The most important open item: `Party.snap()`

`Animator.rest()` exists but nothing calls it, and there is no `Party.snap()`.

The coordinator independently confirmed why this matters. `prompto_closeup`
reads as out of focus. It is **not** a DOF bug — `PostFX._headObject()` was
separately fixed on `main` and that sharpened `ignis_closeup`, but Prompto
stayed soft. Re-shot **alone** with `--settle 300` he is sharp and well framed.

The cause: companions are still steering to their wandering formation slots
when the shot settles, and a camera anchored to a moving subject smears the
**whole frame** through TAA and motion blur — not just the subject. Prompto is
worst because his spec has the smallest `lag` (0.10) and highest `speedMul`
(1.05), so he oscillates longest.

**The real defect is order dependence.** The same shot captured as part of a
batch on the same warm page put the camera *inside another party member*. Same
shot, same settle, different result purely because of what ran before it. That
undermines the determinism guarantee for all 47 `follow` shots — and it means
some corpus framings previously judged as "broken framing" may simply never
have settled.

**What to build:**

```js
// Party.snap() — place every member exactly on its formation slot, zero its
// velocity and lag state, and call member.character.anim.rest().
```

Then the coordinator calls it from `Game.applyShot` (`Game.js` is the
coordinator's file, not this agent's — hand back the exact method name).

The agent's own comment on `rest()` states the requirement precisely: *"a
capture applied after five other captures therefore renders the same frame as
one applied first; without this, `t` alone carries minutes of history from shot
to shot and no two runs of a corpus agree."* That is the acceptance test.

**Two harness fixes were tried by the coordinator and both reverted** — do not
repeat them: a re-anchor convergence loop (the formation keeps drifting between
iterations and the camera lands inside whoever is in the way), and a single long
settle for follow shots (240 extra frames × 47 shots, and it did not fix the
ordering). The fix belongs in `Party`, not in the harness.

## Gate status

`npx vite build` — **passes**. Nothing else was run. `integration.mjs`,
`orphans.mjs` and `gameplay.mjs` are unverified against this branch.

## Next steps, in order

1. Add `Party.snap()` as above and hand the method name back to the coordinator.
2. **Capture and actually look**: `hero_full`, `hero_face`, `combat_wide`,
   `gladio_closeup`, `ignis_closeup`, `prompto_closeup`, `haven_dusk`. Nothing
   on this branch has been seen yet.
3. Verify the two sign fixes read correctly — the weighted hip should ride *up*
   and the shoulder line counter-rotate against the pelvis.
4. Confirm the combat stance actually differs from the field idle in
   `combat_wide`; the original complaint was that the party holds a relaxed idle
   in the middle of a fight.
5. Re-run `gameplay.mjs` and confirm no regression.

## Gotchas

- **Never `-=` on an idle layer.** `Anim.js` once accumulated `bobY` unbounded
  and sank the entire party ~10 m over a long session. The combat stance uses a
  separate `stanceDrop` field combined in `apply()` for exactly this reason.
  The warning comment at that site must stay.
- `agent/weapons` needs a change in this agent's file and could not make it:
  `Anim.js:334` applies `fingers* = -0.24` about X, which curls the fingers
  *backwards*, so no character ever closes a fist around a weapon grip. Fix it
  here.
