/*
 * Does the camera arm leave the lens inside terrain?
 *
 * Sibling-ports plan section 5: MGS5 measured that a *point* arm test left the
 * lens inside geometry in 4.8% of poses and fixed it with an r=0.30 m swept
 * sphere. Our `_armDistance` is a point test along the arm centreline, so the
 * question is what our own rate is -- the sibling's number is theirs.
 *
 * Samples the real rig: for a grid of focus points on the walkable world and a
 * full turn of yaw/pitch per point, run the rig's own `_armDistance`, place the
 * lens where it says, and ask the terrain whether that point is underground by
 * more than the probe radius.
 */
const g = window.GAME;
const rig = g.get('CameraRig') || g.cameraRig || g.rig;
const terr = g.get('Terrain');
if (!rig || !terr) return `missing ${!rig ? 'CameraRig' : 'Terrain'}`;

const V = g.THREE ? g.THREE.Vector3 : rig.cam.position.constructor;
const focus = new V();
const dir = new V();

let poses = 0, inside = 0, worst = 0, clamped = 0;
const wanted = rig.distance || 5.5;
const R = rig.probeRadius;
// A coarse sweep of the world, then a full turn at each point.
for (let gx = -1400; gx <= 1400; gx += 175) {
  for (let gz = -1400; gz <= 1400; gz += 175) {
    const fy = terr.heightAt(gx, gz) + 1.5;
    focus.set(gx, fy, gz);
    for (let a = 0; a < 12; a++) {
      for (let p = 0; p < 4; p++) {
        const yaw = (a / 12) * Math.PI * 2;
        const pitch = -0.35 + p * 0.16;
        dir.set(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
        const d = rig._armDistance(g, focus, dir, wanted);
        const x = focus.x + dir.x * d, z = focus.z + dir.z * d;
        let y = focus.y + dir.y * d;
        // the rig's ground floor, applied where `lateUpdate` applies it
        if (!window.__CAMSWEEP_NOFLOOR) {
          const fy = terr.heightAt(x, z) + rig.probeRadius + 0.42;
          if (y < fy) y = fy;
        }
        const h = terr.heightAt(x, z);
        poses++;
        const pen = h + R - y;             // >0 means the lens sphere is in the ground
        if (pen > 0) {
          inside++; worst = Math.max(worst, pen);
          if (d <= rig.minDistance + 1e-3) clamped++;
        }
      }
    }
  }
}
return `poses ${poses}  lens inside terrain ${inside} (${(100 * inside / poses).toFixed(2)}%)`
  + `  worst penetration ${worst.toFixed(2)} m`
  + `  of those, at the minDistance clamp: ${clamped} (${(100 * clamped / Math.max(inside, 1)).toFixed(1)}% of failures)`;
