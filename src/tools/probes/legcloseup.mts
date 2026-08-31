/* The corpus camera, a long lens, and one townsperson's boots.
 *
 * The square-wide ablations were read at 4 m through a 55 mm lens and two of
 * them were confounded: with every other mesh hidden the scene loses its bounce
 * light, and dark trousers on a black ground look exactly like missing legs.
 * So this does not move the camera at all. It stands where `plaza_down.jpg`
 * stood and puts a 12 degree lens on each of the three nearest bodies' feet --
 * same distance, same LOD, same light, twenty times the pixels.
 */
const g = window.GAME;
const out = [];
const { SHOTS } = await import('/game/Shots.ts');
const terr = g.get('Terrain');
const player = g.get('Player');
const npcs = g.get('Npcs');
const props = g.get('Props');
const kits = props && props.poiKits;
const wm = (await import('/world/map/WorldMap.ts')).worldMap;

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
g.get('Director').play();
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus').setScreen(null);
g.get('HUD')?.setVisible?.(false);
step(10);

const poi = wm.poiById('lestallum');
const px = poi.x, pz = poi.z, py = terr.heightAt(px, pz);
player.root.position.set(px, py, pz);
g.camera.position.set(px, py + 4, pz + 8);
g.camera.lookAt(px, py + 1, pz);
for (let i = 0; i < 200; i++) { player.root.position.set(px, py, pz); step(1); }
player.root.position.set(px + 300, terr.heightAt(px + 300, pz), pz);
step(4);

const CAM = [-2956.8, 123.615, -696.8];
const plaza = kits && kits.anchorAt('lestallum', 'plaza');
out.push(`plaza anchor y ${plaza ? plaza.y.toFixed(3) : 'NULL'}`);
const ranked = npcs.list
  .map((n) => ({ n, d: Math.hypot(n.pos.x - CAM[0], n.pos.z - CAM[2]) }))
  .filter((r) => r.d < 14)
  .sort((a, b) => a.d - b.d)
  .slice(0, 3);

for (const { n, d } of ranked) {
  SHOTS.__probe = {
    name: '__probe',
    pos: CAM,
    target: [n.pos.x, n.pos.y + 0.35, n.pos.z],
    fov: 12,
    time: 10.5,
  };
  g.applyShot('__probe');
  g.settle(40);
  g.applyShot('__probe');
  g.settle(8);
  out.push(`${n.id.padEnd(12)} ${d.toFixed(1)} m  lod ${n.body._lod}  pos.y ${n.pos.y.toFixed(3)}  height ${n.body.height.toFixed(2)}`);
  await window.__shot(n.id);
}

return out.join('\n');
