/*
 * Are the Regalia's passengers and the chocobo's riders actually posed?
 *
 *   node src/tools/probe.mts src/tools/probes/seatdiag.mts --dirty
 *
 * The second blind playtest says everyone the game seats is a T-pose with arms
 * out through the bodywork. `Occupants._applyPose` and `Saddle._applyPose` both
 * look correct on the page, so the question is whether they run at all, whether
 * the bones they name exist on the rig they are handed, and what the arm
 * actually ends up doing in world space once the frame is over.
 */
const g = window.GAME;
const out = [];
const V3 = g.camera.position.constructor;

const armReport = (tag, char) => {
  if (!char || !char.rig) { out.push(`${tag}: no rig`); return; }
  const bn = char.rig.byName;
  const need = ['hips', 'upperArmL', 'lowerArmL', 'handL', 'thighL', 'shinL', 'footL', 'spine03'];
  const missing = need.filter((n) => !bn[n]);
  if (missing.length) out.push(`${tag}: MISSING BONES ${missing.join(',')}`);
  const p = (n) => { const b = bn[n]; if (!b) return null; const v = new V3(); b.getWorldPosition(v); return v; };
  const hips = p('hips'), sh = p('upperArmL'), hd = p('handL'), ft = p('footL'), kn = p('shinL');
  if (!hips || !sh || !hd) { out.push(`${tag}: no bones`); return; }
  // How horizontal is the arm? 0 = straight down, 90 = straight out sideways.
  const d = hd.clone().sub(sh);
  const horiz = Math.hypot(d.x, d.z);
  const outDeg = Math.atan2(horiz, -d.y) * 180 / Math.PI;
  const q = bn.upperArmL.quaternion;
  const e = new (g.camera.rotation.constructor)().setFromQuaternion(q, 'YXZ');
  out.push(`${tag}: upperArmL euler ${e.x.toFixed(2)},${e.y.toFixed(2)},${e.z.toFixed(2)}`
    + ` | armDeg-from-down ${outDeg.toFixed(0)} | handL-hips dx ${(hd.x - hips.x).toFixed(2)} dy ${(hd.y - hips.y).toFixed(2)} dz ${(hd.z - hips.z).toFixed(2)}`
    + ` | footL y-hips ${ft ? (ft.y - hips.y).toFixed(2) : 'n/a'} knee y-hips ${kn ? (kn.y - hips.y).toFixed(2) : 'n/a'}`);
};

/* ---------------------------------------------------------------- the car */
const reg = g.get('Regalia');
const player = g.get('Player');
const party = g.get('Party');
out.push(`Regalia enabled=${reg && reg.enabled} isDriving=${reg && reg.isDriving}`);
out.push(`Party members: ${party ? party.members.map((m) => m.key + (m.character ? '' : '(NO CHAR)')).join(',') : 'none'}`);

if (reg) {
  // put the player next to the car so `enter` is legal, then drive
  player.root.position.set(reg.body.pos.x + 3, reg.body.pos.y, reg.body.pos.z);
  player.position.copy(player.root.position);
  const ok = reg.enter(false);
  out.push(`reg.enter -> ${ok}; riders ${reg.occupants.riders.length} [${reg.occupants.riders.map((r) => r.key + '@' + r.seat).join(', ')}] seated=${reg.occupants.seated}`);
  reg.body.throttle = 1;
  for (let i = 0; i < 180; i++) g.frame(1 / 60);
  out.push(`speed ${reg.body.speed.toFixed(1)} m/s after 3 s`);
  for (const r of reg.occupants.riders) armReport(`car ${r.key}/${r.seat}`, r.char);
  // is the rider's root actually at the seat?
  for (const r of reg.occupants.riders) {
    const a = reg.occupants.anchors[r.seat]; const v = new V3(); a.getWorldPosition(v);
    out.push(`  seat ${r.seat} anchor ${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)} root ${r.root.position.x.toFixed(2)},${r.root.position.y.toFixed(2)},${r.root.position.z.toFixed(2)} visible=${r.root.visible}`);
  }
  window.__shot && window.__shot('drive');
  reg.exit();
  for (let i = 0; i < 30; i++) g.frame(1 / 60);
}

/* ------------------------------------------------------------- the chocobo */
const cb = g.get('Chocobo');
if (cb) {
  cb.summon && cb.summon();
  for (let i = 0; i < 600 && cb.state !== 'waiting'; i++) g.frame(1 / 60);
  out.push(`chocobo state ${cb.state}`);
  const mounted = cb.mount ? cb.mount() : null;
  out.push(`cb.mount -> ${mounted}; state now ${cb.state}`);
  for (let i = 0; i < 120; i++) g.frame(1 / 60);
  const sad = cb.saddle;
  if (sad) {
    out.push(`saddle seated=${sad.seated} riders ${sad.riders.length} [${sad.riders.map((r) => r.key).join(',')}]`);
    for (const r of sad.riders) armReport(`bird ${r.key}`, r.char);
  } else out.push('no saddle on Chocobo system');
  window.__shot && window.__shot('ride');
}
return out.join('\n');
