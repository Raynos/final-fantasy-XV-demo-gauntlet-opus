/**
 * Where is the meteor, actually, and how high is the ground on each approach?
 * Guessing a camera for a mountain-sized object does not work: the shot camera
 * ended up *inside* the shard field when the meteor moved onto its zone centre.
 */
export default () => {
  const g = window.GAME;
  const terr = g.get('Terrain');
  const h = (x, z) => Number(terr.heightAt(x, z).toFixed(1));

  let box = null;
  g.scene.traverse((o) => { if (o.name === 'meteor') box = o; });
  const out = { found: !!box };
  if (box) {
    const b = new (window.THREE || {}).Box3 ? new window.THREE.Box3().setFromObject(box) : null;
    out.groupPos = box.position.toArray().map((v) => Number(v.toFixed(1)));
    if (b) {
      out.min = b.min.toArray().map((v) => Number(v.toFixed(1)));
      out.max = b.max.toArray().map((v) => Number(v.toFixed(1)));
    }
  }
  // ground height on a ring of candidate camera stations around (-1020, -2160)
  out.ring = [];
  for (let a = 0; a < 360; a += 45) {
    const r = 1800;
    const x = -1020 + r * Math.cos(a * Math.PI / 180);
    const z = -2160 + r * Math.sin(a * Math.PI / 180);
    out.ring.push({ a, x: Math.round(x), z: Math.round(z), h: h(x, z) });
  }
  out.centre = h(-1020, -2160);
  return out;
};
