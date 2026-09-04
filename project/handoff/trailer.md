# Trailer — a 30-second cut of the game

**State: a real 30.000 s / 1800-frame 1080p60 video exists**, at
`tmp/trailer/out/ffxv-trailer-1080p60.mp4` (62 MB; a 720p/8.9 MB variant sits
beside it). Picture and in-game SFX, no music bed yet. Three tools, committed:
`trailerclips.mts` (record), `trailercut.mts` (edit), `trailer/{types,spec.default}.ts`
and `trailer/cuts.json` (data).

## The one thing to know before touching this

**Every gate here tested capture quality, not capture content.** The first cut
shipped an Act II that was entirely static and passed at 60 fps with zero
dropped frames. A human watched it and said "nothing about this is real
gameplay, it's still shots with camera movement." He was right.

`Director.setScenario` does not merely spawn a tableau, it **holds** one, three
ways: `vfx.pin(t)` stops the effect clock and with it trails and ground FX;
`combat.scenarioLock` makes `CombatSystem.update` return at its first line; and
`_frozenPlayer` copies the player's position back **every frame**. All three are
exactly what buys byte-identical stills, and all three are fatal for footage.
Calling `setLive(true)` and `enemies.frozen = false` -- which is what the
recorder did -- releases none of them.

Measured before: 0.00 s of effect clock, 0.00 m of player travel, 0.00 m across
26 enemies, over two seconds. After adding `unpin` and real held input:
1.4-15.9 m of travel and 2.6-3.5 s of effect clock. It also explains a symptom
already written down here and misdiagnosed as framing -- six clips reading as
the same cyan arc. It *was* the same arc.

Every take now reports `travel` and `vfxRan`, and a clip that asked to be
gameplay and moved nothing says so. Frame timing only ever tested whether the
*recorder* was healthy.

## The second thing to know before touching this

**`canvas.captureStream()` captures ONLY the WebGL canvas.** The HUD, the title
lockup, the cutscene letterbox bars and the subtitles are all DOM layered over
the canvas, so **none of them are in the recording** — while `page.screenshot()`
of the identical moment composites them and looks perfect. That mismatch cost a
diagnosis round: three clips failed, the double-stage fix below genuinely
repaired a fourth, and it was tempting to keep blaming staging.

Consequence: `b8-hud`, `d1-title` and the letterbox/subtitle half of `c2-astral`
are currently missing their UI. **The remaining work is a picture path that
composites DOM**: CDP `Page.startScreencast` (composited, but carries no audio —
so picture from the screencast, audio from the existing Web Audio taps, muxed
after), or stepped `page.screenshot()` frames for the few DOM-dependent clips.
Everything else in the pipeline is unaffected.

## What is solid

- **Audio works, and that was the risk.** Every page here carries `--mute-audio`
  and every existing audio check uses `OfflineAudioContext`, so nobody had ever
  asked whether a live context renders in this harness. It does: `--mute-audio`
  silences the output *device*; `createMediaStreamDestination` taps ahead of it.
  Measured mean -14.3 dB, max -2.9 dB. The page needs `?audio=force`.
- **Three stems per take** — `program`, plus `music` and `sfx` off the separate
  bus GainNodes — so the edit can hold one unbroken bed under hard cuts.
- **The cut is on the score's own bar grid.** `Themes.ts` gives each state its
  own tempo (field 74, tension 66, combat 152, boss 138, victory 132); starting
  the bed at **t0 = 0.5204** with `field x1, tension x1, combat x8, boss x4`
  lands the act breaks at **7.4000 / 20.0316 / 26.9881 s** with no tempo
  override. Combat cuts are half-bars of 0.7895 s, where `Score._perc` puts the
  kick; absolute bar 8 (16.8737 s) is the act's only crash cymbal and carries
  the armiger.
- **A settle is not neutral.** `applyShot` stages a tableau and this is the only
  page in the harness whose loop actually runs, so live systems dismantle it
  during the settle. `daemon.mts routeShots` already solved this for stills —
  apply, settle, **apply again** — and the recorder now does the same.
- **The frame gate had to learn to tell contention from a defect.** Mean fps is
  the wrong test: a contended box measured 68.81 fps while dropping 21 frames in
  2.5 s, because fast frames pull the mean back over the stalls. Count frames
  over 24 ms instead (a dropped vsync at 60 Hz is 33.3 ms). The tool now prices
  the page with nothing attached before recording and says when the verdicts are
  about the machine.
- **`withExclusive` drains only THIS repo.** Another project's herdr session had
  four headless renderers at ~100-121% CPU each; this box has one Metal GPU
  which the harness bench measured binding at 2.2 of 18 cores. Coordinate with
  `herdr-agents -A` (dotfiles `.functions`) and ask the other session to hold —
  it took the baseline from 68.8 fps/21 drops to 104.2/2.

## Known bad clips

| clip | problem |
|---|---|
| `b8-hud` | no HUD (DOM), and ~41 fps with 40+ drops — the heaviest shot in the spec |
| `d1-title` | no lockup (DOM) |
| `c2-astral` | scene and rain correct after the double-stage; bars and subtitle missing (DOM) |
| `a2-road` | **no Regalia in frame.** Not DOM — the car is placed by the posed scenario. `live: true` was removed and it still fails; needs a look at where `field` scenario parks it |

Act II is also repetitive: six clips read as the same cyan warp arc, because
`scenario: 'warp'/'combat'` with `follow: 'player'` yields near-identical
framings and my camera offsets are small. Differentiate the offsets, or spread
the clips across more scenarios.

## Not built

`trailerscore.mts` — the continuous 30 s music bed, rendered offline through the
path `src/audio/tools/verify.mts` already proves. `Score.setState()` **must** be
called with `{ immediate: true }` or the change lands a bar late, and on a live
page `AudioSystem._updateMusic` re-derives the state every frame, so force it by
posing the world rather than by calling `setState`.

Titles: **this ffmpeg cannot draw text** — 8.1.2 here is built without
libfreetype/libfontconfig/libharfbuzz/libass, so `drawtext`, `subtitles` and
`ass` are all absent. Render cards from the game's own CSS through
`withBlankPage()` and overlay them as RGBA PNGs.
