import * as THREE from 'three';

/**
 * Two geometry asserts that complement `src/util/GeoAssert.ts` (plan §9.1).
 *
 * The method lane owns the general set — `assertUpward`, `downFacing`,
 * `assertCardOrientation` over a card's UVs, `assertAttributeContract` — and the
 * water lane uses them. These two are the shapes that file does not cover, and
 * they are here rather than there only because that file is another agent's
 * tonight. **Method lane: lift both, they are twelve lines each.**
 *
 * - {@link assertCardOrientation} in *vector* form. `GeoAssert`'s version reads
 *   a quad's UV basis; a ribbon has no UVs at all, its parameter axes are the
 *   loops that built the index buffer. Same test, same transpose- and
 *   mirror-sensitivity, different input.
 * - {@link assertAttributes} for a **ShaderMaterial**.
 *   `GeoAssert.assertAttributeContract` knows about `map`/`normalMap`/
 *   `vertexColors` — the standard-material contract. A raw ShaderMaterial
 *   declares its attributes in a GLSL string that nothing parses, and an
 *   undeclared attribute still reads as zero, silently.
 */

const _n = new THREE.Vector3();

/**
 * Assert that a lattice's two parameter axes are not transposed or mirrored.
 *
 * Hand it the origin corner and the two edge vectors **in the order the index
 * buffer walks them** — `du` the step the inner loop takes, `dv` the outer —
 * plus the surface up direction. A front-facing quad wound counter-clockwise
 * from `o -> o+du -> o+du+dv -> o+dv` has `du x dv` pointing along `up`.
 *
 * Swap `du` and `dv` and the sign inverts; negate either and the sign inverts.
 * That is the entire point: area is transpose-invariant, which is how the
 * sibling's bug survived four rounds of checks that all measured area.
 *
 * @throws if the frame is degenerate or wound the wrong way round
 */
export function assertCardOrientation(
  what: string, o: THREE.Vector3, du: THREE.Vector3, dv: THREE.Vector3, up: THREE.Vector3,
): void {
  _n.copy(du).cross(dv);
  const area = _n.length();
  if (!(area > 1e-9)) {
    throw new Error(`${what}: degenerate lattice frame at (${o.x.toFixed(1)}, ${o.z.toFixed(1)}) — |du x dv| = ${area.toExponential(2)}`);
  }
  const d = _n.dot(up) / area;
  if (!(d > 0)) {
    throw new Error(`${what}: lattice is transposed or mirrored — (du x dv)·up = ${d.toFixed(4)} at (${o.x.toFixed(1)}, ${o.z.toFixed(1)}). Swap the two inner loops or the two triangle windings, not the material's side.`);
  }
}

/**
 * Assert that every attribute a ShaderMaterial's GLSL declares is on the mesh.
 *
 * Plan §9.5 for the hand-written case. *"Undeclared attributes read as zero,
 * silently"* — and for a ribbon whose whole shading is driven by `aShore`, zero
 * means "exactly at the waterline everywhere", which is a wet band over the
 * entire surface and looks like a shader bug rather than a missing buffer.
 */
export function assertAttributes(what: string, geo: THREE.BufferGeometry, required: string[]): void {
  const missing = required.filter((a) => !geo.getAttribute(a));
  if (missing.length) {
    throw new Error(`${what}: the shader reads ${missing.join(', ')} and the geometry has none — undeclared attributes read as zero, silently.`);
  }
  const n = geo.getAttribute('position').count;
  for (const a of required) {
    const at = geo.getAttribute(a);
    if (at.count !== n) throw new Error(`${what}: attribute ${a} has ${at.count} items against ${n} positions.`);
  }
}
