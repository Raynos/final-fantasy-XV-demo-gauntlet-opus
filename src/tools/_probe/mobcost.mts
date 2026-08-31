// What does a frame actually cost on the demo path, and where?
//
// The device report was "phone hot, FPS shit". Both are one number -- GPU work
// per second -- and this measures the two halves that make it: how many pixels
// the pass fills, and how much is in front of the camera while it does.
const g = window.GAME;
const gl = g.rnd.renderer;
const info = gl.info;

const size = gl.getDrawingBufferSize(new (Object.getPrototypeOf(g.camera.position).constructor)());
const px = size.x * size.y;

// Warm, then time a run of real frames off the wall clock.
for (let i = 0; i < 30; i++) g.frame(1 / 60);
const t0 = performance.now();
const N = 90;
for (let i = 0; i < N; i++) g.frame(1 / 60);
const ms = (performance.now() - t0) / N;

return {
  tier: g.rnd.quality,
  pixelRatio: +gl.getPixelRatio().toFixed(3),
  css: { w: window.innerWidth, h: window.innerHeight },
  drawingBuffer: { w: size.x, h: size.y, megapixels: +(px / 1e6).toFixed(3) },
  shadows: gl.shadowMap.enabled,
  maxFps: g.maxFps,
  draws: info.render.calls,
  triangles: info.render.triangles,
  programs: info.programs ? info.programs.length : -1,
  msPerFrame: +ms.toFixed(2),
  fpsHeadroomOnThisMachine: +(1000 / ms).toFixed(1),
};
