/**
 * One Chromium flag set for every tool in this repo.
 *
 * `--disable-frame-rate-limit` and `--disable-gpu-vsync` are DELIBERATELY
 * ABSENT, against intuition. Measured on a comparable project:
 *
 *   idle cost of one posed page   1.74 cores  ->  0.58   (3x)
 *   boot to ready                 1983 ms     ->  1663   (17% faster)
 *   avg pose + screenshot         2281 ms     ->  1889   (17% faster)
 *   frames                        byte-identical across three shots
 *
 * Uncapped rendering draws hundreds of frames nobody screenshots, and that work
 * competes with the capture path. Our benchmarks do not need it either: they
 * step the simulation manually and bracket each frame with `gl.finish()`, so
 * they measure GPU completion rather than presentation. Do not add it back.
 *
 * `--use-angle=metal` is explicit rather than `default` so the backend cannot
 * drift between machines and quietly change the numbers.
 *
 * Kept for capture correctness, not speed:
 *   --force-color-profile=srgb   identical pixels regardless of display profile
 *   --hide-scrollbars            no scrollbar in the frame
 *   --mute-audio                 the audio system is real
 */
export const CHROMIUM_ARGS = [
  '--use-gl=angle',
  '--use-angle=metal',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--force-color-profile=srgb',
  '--hide-scrollbars',
  '--mute-audio',
];
