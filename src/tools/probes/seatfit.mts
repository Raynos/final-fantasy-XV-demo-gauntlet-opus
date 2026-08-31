/*
 * Does anybody the game seats fit inside the thing it seats them in?
 *
 *   node src/tools/probe.mts src/tools/probes/seatfit.mts --dirty
 *
 * Playtest complaint #2 is a geometry question, not an art question: bare arms
 * poke through the Regalia's bodywork, and the chocobo riders' legs are buried
 * in the bird instead of round it. Both are answerable with a number, so this
 * measures rather than photographs.
 *
 * THE CAR. Everything is reported in the car's own frame, in metres, with the
 * origin on the ground under the middle of the car: `fore` +X forward, `up` +Y,
 * `lat` +Z toward the car's LEFT. These are the art frame's units times SCALE
 * (1.14), which is what `Regalia.ts`'s constants become on the road:
 *
 *     cabin side wall (door card inner face) |lat| 0.952
 *     door top / beltline                     up   1.106
 *     seat squab top (the H-point)            up   1.055
 *     floor pan top                           up   0.599
 *     steering wheel centre         fore -0.023  up 1.334  lat 0.502, r 0.194
 *
 * A seated occupant PASSES when no bone has |lat| > 0.952 — that is precisely
 * the "arms out through the bodywork" condition, because the door cards *are*
 * the cabin's side walls.
 *
 * THE BIRD. Bird-local, +Z forward, +X to its left, origin on the ground. The
 * barrel's own half-width per fore-aft slab comes from the live skinned mesh,
 * CPU-skinned to the pose it is actually in. A rider PASSES when the knee and
 * the foot are OUTSIDE the barrel (clear > 0) rather than buried in it, and the
 * hands are within a rein's width of each other over the withers.
 */
const g = window.GAME;
const out = [];
const V3 = g.camera.position.constructor;

const CAR_WALL = 0.952, CAR_BELT = 1.106, CAR_SEAT = 1.055;
const WHEEL = { fore: -0.023, up: 1.334, lat: 0.502, r: 0.194 };

const ARMS = ['clavicleL', 'clavicleR', 'upperArmL', 'upperArmR', 'lowerArmL', 'lowerArmR',
  'handL', 'handR', 'fingersL', 'fingersR', 'fingerTipL', 'fingerTipR', 'thumbL', 'thumbR'];
const LEGS = ['thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'toeL', 'toeR'];
const TORSO = ['hips', 'spine01', 'spine02', 'spine03', 'neck', 'head'];

/** max |lateral| and vertical span per slab of a point cloud. */
function outline(pts, axis, lat, slab) {
  const m = new Map();
  for (const p of pts) {
    const k = Math.round(p[axis] / slab);
    const a = Math.abs(p[lat]);
    const e = m.get(k);
    if (!e) m.set(k, { half: a, top: p.y, bot: p.y });
    else { if (a > e.half) e.half = a; if (p.y > e.top) e.top = p.y; if (p.y < e.bot) e.bot = p.y; }
  }
  return { m, slab, at(v) { return this.m.get(Math.round(v / this.slab)) || null; } };
}

/* ================================================================== the car */
const reg = g.get('Regalia');
const player = g.get('Player');
if (reg) {
  const b = reg.body;
  player.root.position.set(b.pos.x + 3, b.pos.y, b.pos.z);
  player.position.copy(player.root.position);
  reg.enter(false);
  g.input.keys.clear(); g.input.keys.add('KeyW');
  for (let i = 0; i < 240; i++) g.frame(1 / 60);
  g.input.keys.clear();
  for (let i = 0; i < 150; i++) g.frame(1 / 60);

  // `built.group` hangs under `pivot`, which is where the world's metres and
  // the art's axes coincide: +X forward, +Z left, origin on the ground.
  const art = reg.built.group;
  art.updateMatrixWorld(true);
  const v = new V3();
  const local = (bone) => { bone.getWorldPosition(v); art.worldToLocal(v); return { fore: v.x, up: v.y, lat: v.z }; };

  let worstAll = 0;
  for (const r of reg.occupants.riders) {
    const bn = r.char.rig.byName;
    let worst = 0, wname = '';
    const bad = [];
    for (const name of [...ARMS, ...LEGS, ...TORSO]) {
      const bo = bn[name]; if (!bo) continue;
      const p = local(bo);
      const over = Math.abs(p.lat) - CAR_WALL;
      if (over > worst) { worst = over; wname = name; }
      if (over > 0.01) bad.push(`${name} ${over.toFixed(3)}`);
    }
    const h = local(bn.hips), s = local(bn.spine03), hd = local(bn.head);
    const hl = local(bn.handL), hr = local(bn.handR);
    out.push(`CAR ${r.key}/${r.seat}`);
    out.push(`  hips up ${h.up.toFixed(3)} (seat ${CAR_SEAT}, belt ${CAR_BELT})  shoulders up ${s.up.toFixed(3)} (${(s.up - CAR_BELT).toFixed(3)} over the belt)  head up ${hd.up.toFixed(3)}`);
    out.push(`  handL fore ${hl.fore.toFixed(2)} up ${hl.up.toFixed(2)} lat ${hl.lat.toFixed(2)}   handR fore ${hr.fore.toFixed(2)} up ${hr.up.toFixed(2)} lat ${hr.lat.toFixed(2)}`);
    if (r.seat === 'driver') {
      const d = (p) => Math.hypot(p.fore - WHEEL.fore, p.up - WHEEL.up, Math.abs(p.lat) - WHEEL.lat);
      out.push(`  wheel: handL ${(d(hl) - WHEEL.r).toFixed(3)} m off the rim, handR ${(d(hr) - WHEEL.r).toFixed(3)}`);
    }
    out.push(`  WORST outboard: ${wname || '-'} ${worst.toFixed(3)} m past the door card${bad.length ? `  [${bad.join(', ')}]` : ''}`);
    if (worst > worstAll) worstAll = worst;
  }
  out.push(`CAR VERDICT: worst outboard ${worstAll.toFixed(3)} m  ${worstAll <= 0.01 ? 'PASS' : 'FAIL'}`);
  reg.exit();
  for (let i = 0; i < 30; i++) g.frame(1 / 60);
}

/* ================================================================= the bird */
const cb = g.get('Chocobo');
if (cb) {
  cb.summon();
  for (let i = 0; i < 900 && cb.state !== 'waiting'; i++) g.frame(1 / 60);
  cb.mount();
  g.input.keys.clear(); g.input.keys.add('KeyW');
  for (let i = 0; i < 240; i++) g.frame(1 / 60);
  g.input.keys.clear();
  for (let i = 0; i < 150; i++) g.frame(1 / 60);

  const bird = cb.bird, vis = bird.visual;
  vis.updateMatrixWorld(true);
  const M4 = g.camera.matrixWorld.constructor;
  const v = new V3(), acc = new V3(), tmp = new V3(); const m = new M4();
  const pts = [];
  vis.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const geo = o.geometry, sw = geo.attributes.skinWeight, si = geo.attributes.skinIndex;
    const pa = geo.attributes.position, skel = o.skeleton;
    const step = Math.max(1, Math.floor(pa.count / 6000));
    for (let i = 0; i < pa.count; i += step) {
      v.fromBufferAttribute(pa, i); acc.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k); if (!w) continue;
        const bo = skel.bones[si.getComponent(i, k)]; if (!bo) continue;
        m.multiplyMatrices(bo.matrixWorld, skel.boneInverses[si.getComponent(i, k)]);
        tmp.copy(v).applyMatrix4(m).multiplyScalar(w); acc.add(tmp);
      }
      vis.worldToLocal(acc);
      pts.push({ x: acc.x, y: acc.y, z: acc.z });
    }
  });
  const barrel = outline(pts, 'z', 'x', 0.15);
  /*
   * A 2-D outline as well as the 1-D one. The barrel is an egg: judging a boot
   * at y 1.28 against the widest slice of the whole slab (0.448, which is up at
   * the saddle line) says the boot is buried when it is in clear air. Cells are
   * 0.15 in z by 0.12 in y.
   */
  const cell = new Map();
  for (const p of pts) {
    const k = `${Math.round(p.z / 0.15)},${Math.round(p.y / 0.12)}`;
    const a = Math.abs(p.x);
    if (!(cell.get(k) >= a)) cell.set(k, a);
  }
  const half2 = (z, y) => {
    // widen in z (the barrel changes slowly fore-aft) but NEVER in y: reaching
    // one cell up from a boot at y 1.29 finds the saddle line at y 1.65 and
    // reports a leg in clear air as buried
    let best = 0;
    for (let dz = -1; dz <= 1; dz++) {
      const v2 = cell.get(`${Math.round(z / 0.15) + dz},${Math.round(y / 0.12)}`);
      if (v2 != null && v2 > best) best = v2;
    }
    return best;
  };
  const seatv = new V3(); bird.seat.getWorldPosition(seatv); vis.worldToLocal(seatv);
  out.push(`BIRD seat ${seatv.x.toFixed(2)},${seatv.y.toFixed(2)},${seatv.z.toFixed(2)}; barrel halfWidth`
    + [0.45, 0.3, 0.15, 0, -0.15, -0.3].map((z) => { const s = barrel.at(z); return ` z${z}:${s ? s.half.toFixed(2) : '-'}/top${s ? s.top.toFixed(2) : '-'}`; }).join(''));
  const bl = (bone) => { bone.getWorldPosition(v); vis.worldToLocal(v); return { x: v.x, y: v.y, z: v.z }; };
  let verdict = 'PASS';
  for (const r of cb.saddle.riders) {
    if (r.key !== 'noctis') continue;   // the flock birds are elsewhere; one is the measurement
    const bn = r.char.rig.byName;
    const rep = [];
    for (const name of ['hips', 'spine03', 'upperArmL', 'lowerArmL', 'handL', 'handR', 'thighL', 'shinL', 'footL', 'toeL']) {
      const bo = bn[name]; if (!bo) continue;
      const p = bl(bo);
      const h2 = half2(p.z, p.y);
      const clear = Math.abs(p.x) - h2;
      rep.push(`    ${name.padEnd(10)} x ${p.x.toFixed(2)} y ${p.y.toFixed(2)} z ${p.z.toFixed(2)}   bird half ${h2.toFixed(3)} clear ${clear.toFixed(3)}`);
      /*
       * -0.04 rather than 0. The outline is a max over a 0.15 x 0.12 cell and
       * the bird's own thigh feathers live at exactly the boot's height, so a
       * boot photographed in clear air against the flank still measures a few
       * centimetres "inside" the widest thing in its cell. The knee and the toe
       * are the honest tests; the ankle only has to be close.
       */
      if ((name === 'shinL' || name === 'toeL') && clear < 0.0) verdict = 'FAIL';
      if (name === 'footL' && clear < -0.04) verdict = 'FAIL';
    }
    const hl = bl(bn.handL), hr = bl(bn.handR);
    out.push(`BIRD ${r.key}: hands ${(Math.abs(hl.x - hr.x)).toFixed(2)} m apart, ${(hl.y - bl(bn.hips).y).toFixed(2)} m above the hips`);
    out.push(rep.join('\n'));
  }
  out.push(`BIRD VERDICT: legs outside the barrel? ${verdict}`);

  /*
   * What is hanging off every rider's weapon sockets, and where it ended up
   * relative to the bird it is sitting on. The playtest reports "a sword
   * floating horizontally through the bird's neck", and a stowed blade is a
   * child of `attach.back` on `spine03`, so it swings with the torso lean.
   * The neck runs roughly z 0.30 .. 0.80 above y 2.0.
   */
  const NECK = { z0: 0.25, z1: 0.85, y0: 1.95 };
  for (const r of cb.saddle.riders) {
    const socks = r.char.attach || {};
    for (const key of ['back', 'hip', 'handL', 'handR']) {
      const sock = socks[key]; if (!sock || !sock.children.length) continue;
      const drawn = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
      sock.traverse((o) => {
        // `visible` is per-node and `traverse` does not respect ancestors, so a
        // hidden weapon root still yields visible meshes. Walk up, or this
        // reports every stowed blade that `Saddle._hideProps` has put away.
        if (!o.isMesh || !o.geometry || !drawn(o)) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        let inNeck = 0, n = 0;
        let lo = null, hi = null;
        for (const cx of [bb.min.x, bb.max.x]) for (const cy of [bb.min.y, bb.max.y]) for (const cz of [bb.min.z, bb.max.z]) {
          const p = new V3(cx, cy, cz); o.localToWorld(p); vis.worldToLocal(p);
          n++;
          if (p.z > NECK.z0 && p.z < NECK.z1 && p.y > NECK.y0 && Math.abs(p.x) < 0.28) inNeck++;
          if (!lo) { lo = p.clone(); hi = p.clone(); } else { lo.min(p); hi.max(p); }
        }
        out.push(`  ${r.key}/${key} ${(o.name || o.type).padEnd(14)} bird-local `
          + `x ${lo.x.toFixed(2)}..${hi.x.toFixed(2)} y ${lo.y.toFixed(2)}..${hi.y.toFixed(2)} z ${lo.z.toFixed(2)}..${hi.z.toFixed(2)}`
          + `  ${inNeck ? `IN THE NECK (${inNeck}/${n} corners)` : 'clear'}`);
      });
    }
  }
}
return out.join('\n');
