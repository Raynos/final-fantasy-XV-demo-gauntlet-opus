// **Positive control for the painted face map** (plan §9.6: "checkerboard
// positive control before *fixing* any tiling read").
//
//   node src/tools/framecam.mts --probe src/tools/probes/facemark.mts \
//     --out tmp/shots/<round> --settle 8 --dirty
//
// `paintFace` draws lips with a real vermilion border, nostril shadows and lash
// lines, and `facemap.mts` shows they are all there in the canvas. None of them
// read in a portrait, where a 55 mm mouth is 104 px. Two very different worlds:
// the map is sampled where we think it is and the paint is simply too soft, or
// it is not sampled there at all.
//
// So: stamp **pure magenta** over the mouth, the nose tip and the left eye, at
// the UVs the mesh generator computes for those canonical anchors, into *every*
// mip level. Magenta cannot be confused with skin, cannot be produced by
// lighting, and cannot be filtered away. Where it lands in the frame is the
// answer, and it is one capture.
//
// Everything below this block is `facecam.mts`.
// FACE framings at the range plan §8.2 and `LANDMINES.md` say face work must be
// judged at: **0.4 – 0.6 m**, on `follow` shots.
//
//   node src/tools/framecam.mts --probe src/tools/probes/facecam.mts \
//     --out tmp/shots/<round> --settle 8 --dirty
//
// `hero_face` in the corpus puts a head at ~100 px. No defect in this section is
// visible there and no fix is either, which is how two lanes in a row graded a
// head from a frame that could not have shown one. Absolute `pos`/`target`
// framings drift because `framecam` settles the sim between captures, so every
// spec here is a `follow` with an `offset` — the rig re-anchors on the live root
// each frame — and the cast is pinned on top of that so a subject cannot turn a
// front framing into a three-quarter.
//
// The five toggles below are the `--without <op>` ablation the sibling's
// headsheet had and we did not. Flip one, re-run into a second directory, and
// diff. In particular `FRONT_SIDE`: `Character.ts` ships the face material as
// `THREE.DoubleSide`, and a back-facing fold renders *in front of* the eyeball
// and hides it completely. A `FrontSide` test therefore passes while the
// shipped material still fails — so the two runs together are the diagnosis,
// and only the `DoubleSide` one is a verdict.
const HOUR = 16.2;
/** Hide the groom: is the thing over the eye hair, or skin? */
const HIDE_HAIR = false;
/** Hide the head shell: is the thing over the globe the skull, or a lid? */
const HIDE_HEAD = false;
/** Force the face material single-sided — the DoubleSide-fold ablation. */
const FRONT_SIDE = false;
/** Pin the gaze dead ahead, so the iris cannot be off-centre by animation. */
const ZERO_GAZE = true;
/** Freeze the blink so a closed lid is never mistaken for a covered eye. */
const NO_BLINK = true;

const g = window.GAME;
g.settle(90);
// The corpus closeups are all defocused: PostFX snaps focus to the player's
// head, so every companion frame is out of focus by construction. Judge the
// model, not the lens.
if (g.post && g.post.dof) g.post.dof.enabled = false;
// The tutorial hint card parks itself over the subject's forehead in every face
// framing. It is not the HUD and `shot.hud` does not suppress it.
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

const party = g.get('Party');
const player = g.get('Player');

const pinned = [];
const pin = (o, holder) => pinned.push({ o, holder, p: o.position.clone(), r: o.rotation.y });
const restore = () => {
  for (const q of pinned) {
    q.o.position.copy(q.p);
    q.o.rotation.y = q.r;
    if (q.holder && q.holder.velocity) q.holder.velocity.set(0, 0, 0);
    if (q.holder) q.holder.speed = 0;
  }
};
const wrap = (sys) => {
  if (!sys || sys.__pinned) return;
  const orig = sys.update.bind(sys);
  sys.update = (dt, game) => { orig(dt, game); restore(); };
  sys.__pinned = true;
};
if (player && player.root) pin(player.root, player);
if (party) for (const m of party.members) pin(m.root, m);
wrap(player); wrap(party);

const who = { noctis: null, gladio: 'gladio', ignis: 'ignis', prompto: 'prompto' };
const out = { ablation: { HIDE_HAIR, HIDE_HEAD, FRONT_SIDE, ZERO_GAZE, NO_BLINK }, heads: {}, specs: [] };
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const r3 = (v) => v.map((x) => +x.toFixed(4));

for (const [key, id] of Object.entries(who)) {
  const m = id ? (party && party.get && party.get(id)) : player;
  const ch = m && m.character;
  if (!ch || !ch.rig) continue;
  const byName = ch.rig.byName;

  if (HIDE_HAIR && ch.hair) ch.hair.visible = false;
  if (HIDE_HEAD && ch.head) ch.head.visible = false;
  if (FRONT_SIDE && ch.faceMat) ch.faceMat.side = 0;   // THREE.FrontSide
  if (NO_BLINK && ch.anim && !ch.anim.__noBlink) {
    const orig = ch.anim.update.bind(ch.anim);
    ch.anim.update = (dt, st) => { orig(dt, st); ch.anim.blink = 0; };
    ch.anim.__noBlink = true;
  }
  if (ZERO_GAZE && ch.eyes) {
    const zero = (o) => { o.rotation.set(0, 0, 0); o.updateMatrix(); };
    if (ch.anim && !ch.anim.__gazePinned) {
      const orig = ch.anim.update.bind(ch.anim);
      ch.anim.update = (dt, st) => {
        orig(dt, st);
        zero(ch.eyes);
        if (ch.eyeGlobes) for (const gp of ch.eyeGlobes) zero(gp);
      };
      ch.anim.__gazePinned = true;
    }
  }

  m.root.updateWorldMatrix(true, false);
  const rp = [m.root.position.x, m.root.position.y, m.root.position.z];
  const e = m.root.matrixWorld.elements;
  const fwd = norm([e[8], 0, e[10]]);
  const right = norm([-fwd[2], 0, fwd[0]]);

  // Aim at the head's own live world position, not at a constant: `headOrigin`
  // is in bind space and every character has a different `headScale`, so a
  // framing written against one of them misses the other three.
  const hb = byName.head;
  hb.updateWorldMatrix(true, false);
  const he = hb.matrixWorld.elements;
  // the bone sits at the atlas; the face's centre is a little above and forward
  const aimW = [he[12] + fwd[0] * 0.02, he[13] + ch.rig.dims.headScale * 0.045, he[14] + fwd[2] * 0.02];
  const aim = r3([aimW[0] - rp[0], aimW[1] - rp[1], aimW[2] - rp[2]]);
  const shot = (name, dir, dist, fov, extra) => out.specs.push({
    name, fov, time: HOUR, weather: 'clear', follow: id || 'player', hud: false,
    offset: r3([aim[0] + dir[0] * dist, aim[1] + dir[1] * dist, aim[2] + dir[2] * dist]),
    lookOffset: aim, ...(extra || {}),
  });

  // 0.55 m dead ahead, slightly above eye level. A 30-degree fov at 0.55 m puts
  // a 0.23 m head across roughly two-thirds of a 900 px frame.
  shot(`${key}_face`, norm([fwd[0], 0.10, fwd[2]]), 0.55, 30);
  // **The profile.** This is the frame §8.2 is about, and the one the corpus
  // has never had at a range that could show it. Straight side-on, level.
  shot(`${key}_prof`, norm([right[0], 0.04, right[2]]), 0.55, 30);
  // Three-quarter, which is where a nasion notch and a gonial angle both read.
  shot(`${key}_3q`, norm([fwd[0] * 0.62 + right[0] * 0.78, 0.12, fwd[2] * 0.62 + right[2] * 0.78]), 0.50, 30);
  // The groom from behind and above: the "detaches from the scalp" tell.
  shot(`${key}_crown`, norm([-fwd[0] * 0.55, 0.84, -fwd[2] * 0.55]), 0.60, 34);

  out.heads[key] = {
    headScale: +ch.rig.dims.headScale.toFixed(4),
    aimWorld: r3(aimW),
    faceSide: ch.faceMat && ch.faceMat.side,
  };
}


// ---- the positive control ------------------------------------------------
const FACE_ANCHORS = {
  mouth: [0, -0.079, 0.084],
  noseTip: [0, -0.046, 0.104],
  eye: [0.0335, -0.006, 0.0646],
};
const Y_MIN = -0.122, Y_MAX = 0.116;
const uvOf = (p) => [0.5 + Math.atan2(p[0], p[2]) / (Math.PI * 2),
  Math.min(1, Math.max(0, (p[1] - Y_MIN) / (Y_MAX - Y_MIN)))];

for (const [, id] of Object.entries(who)) {
  const m = id ? (party && party.get && party.get(id)) : player;
  const ch = m && m.character;
  const map = ch && ch.faceMat && ch.faceMat.map;
  if (!map || !map.mipmaps) continue;
  let marked = 0;
  for (const [name, anchor] of Object.entries(FACE_ANCHORS)) {
    const [u, v] = uvOf(anchor);
    let drew = 0;
    for (const cv of map.mipmaps) {
      // **This guard is why this probe reported success having drawn nothing.**
      // The shipped chain's levels are ImageBitmaps, not canvases, so
      // `getContext` is undefined on every one of them, the loop `continue`d
      // straight through, and sixteen captures came back with no magenta in
      // them -- which reads as "the map is not sampled at the mouth" and is
      // really "no mark was ever made". Counted and thrown now; use
      // `facebar.mts`, which rebuilds a canvas from mip 0 with `drawImage`
      // (which does work on an ImageBitmap) and replaces the texture outright.
      const cx = cv.getContext && cv.getContext('2d');
      if (!cx) continue;
      drew++;
      cx.fillStyle = name === 'mouth' ? '#ff00ff' : name === 'noseTip' ? '#00ff00' : '#ffff00';
      // 8 mm across, 4 mm down, in the map's own anisotropic texels
      const px = cv.width / (0.085 * Math.PI * 2), py = cv.height / (Y_MAX - Y_MIN);
      const w = 0.008 * px, h = 0.004 * py;
      // v is bottom-up in canonical space and the canvas is top-down
      cx.fillRect(u * cv.width - w / 2, (1 - v) * cv.height - h / 2, Math.max(1, w), Math.max(1, h));
    }
    marked += drew;
  }
  if (!marked) throw new Error('facemark: could not draw into any mip level -- '
    + 'the chain is not canvases. Use src/tools/probes/facebar.mts.');
  map.needsUpdate = true;
  out.mark = { ...(out.mark || {}), [id || 'player']: Object.fromEntries(
    Object.entries(FACE_ANCHORS).map(([k, a]) => [k, uvOf(a).map((x) => +x.toFixed(4))])) };
}

return out;
