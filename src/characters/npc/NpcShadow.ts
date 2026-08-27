import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * One merged, colour-less caster standing in for a townsperson's opaque meshes.
 *
 * **Why a merge and not a cull.** A shadow map writes depth and reads a
 * material only to find an alpha cutout. An NPC is split into body / head /
 * hair / outfit because it has that many *materials*, not that many objects —
 * so body, head and outfit cast exactly the silhouette their union casts, at
 * one draw per cascade instead of three. Attributed on `town_forecourt`'s peak
 * frame by wrapping `renderer.renderBufferDirect`, the eleven town NPCs spent
 * **156 draws — 72 colour and 84 shadow** — of a frame of 942 against a BRIEF
 * budget of 800, and the shadow half was the largest single block left.
 *
 * **The exception is the hair**, whose shadow *is* the holes in it:
 * `hairMaterial` is `alphaTest: 0.35` with an `alphaMap` banded to cut the
 * cards and leave the shell solid, and three copies `map`/`alphaMap`/
 * `alphaTest` onto the depth material — so the cutout is already in the shadow
 * today. Merged into a position-only proxy it would come back as solid quads
 * across the forehead and the shoulders, which is the one thing the hair
 * material's own comment says is worse than a solid card. Hair keeps casting
 * as itself.
 *
 * **Why the proxy is a `SkinnedMesh`.** Everything here is skinned, so a
 * static proxy would cast a bind-pose shadow of a posed character — a shadow
 * standing to attention beside someone bent over an engine bay. It therefore
 * shares the source skeleton and the source bind matrix, which is the same
 * trick `src/engine/postfx/VelocityPass.ts` uses for its motion-vector
 * proxies. `skinIndex`/`skinWeight` are carried through the merge for that
 * reason and are the only attributes besides `position` that are: a depth pass
 * binds no normal, no UV and no vertex colour.
 *
 * **And why it is visible at all.** three.js skips an object in the shadow
 * pass whose `visible` is false, whose material's `visible` is false, or that
 * fails `object.layers.test(camera.layers)` against the VIEW camera —
 * `WebGLShadowMap.renderObject` tests all three — so there is no such thing as
 * a caster the main camera cannot see. The proxy therefore costs ONE
 * colour-pass draw, with `colorWrite` and `depthWrite` off so it changes no
 * pixel and no depth, against the two-per-cascade it removes. It is hidden
 * outright at any LOD that is not casting, so a distant NPC pays nothing.
 *
 * `shadowSide` is pinned to `BackSide` because all three source materials pin
 * it there (`NpcRig.shared()`, and `faceMaterial`'s copy in `archetype`), and
 * a proxy that wrote front-face depth would move every self-shadow terminator
 * on the character it replaced.
 *
 * The same helper exists in `src/world/town/Hammerhead.ts` and
 * `src/world/props/PoiKits.ts`, which report that it belongs on
 * `world/props/PartBuilder.ts`. That move is another lane's; this copy is
 * skinned and theirs are not, so it would not be the same function even after
 * it lands.
 *
 * @param meshes the opaque skinned meshes to stand in for — all bound to
 *   `skeleton` with `bindMatrix`, which is what makes the merge legal
 * @param skeleton the source skeleton, shared not copied
 * @param bindMatrix the source bind matrix
 * @param name debug name for the mesh
 */
export function skinnedShadowProxy(
  meshes: THREE.SkinnedMesh[],
  skeleton: THREE.Skeleton,
  bindMatrix: THREE.Matrix4,
  name: string,
): THREE.SkinnedMesh | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const m of meshes) {
    const src = m.geometry;
    const pos = src.getAttribute('position');
    const si = src.getAttribute('skinIndex');
    const sw = src.getAttribute('skinWeight');
    if (!pos || !si || !sw) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', pos.clone());
    g.setAttribute('skinIndex', si.clone());
    g.setAttribute('skinWeight', sw.clone());
    // `mergeGeometries` returns **null**, silently, when one member of a batch
    // is indexed and another is not — and a null merge here deletes a whole
    // person's shadow. So the index is synthesised rather than left absent.
    const idx = src.getIndex();
    if (idx) g.setIndex(idx.clone());
    else {
      const seq = new Uint32Array(pos.count);
      for (let i = 0; i < pos.count; i++) seq[i] = i;
      g.setIndex(new THREE.BufferAttribute(seq, 1));
    }
    parts.push(g);
  }
  if (!parts.length) return null;
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!merged) return null;
  merged.computeBoundingSphere();

  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  mat.shadowSide = THREE.BackSide;
  mat.name = `${name}_mat`;
  const mesh = new THREE.SkinnedMesh(merged, mat);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  // Same reason every other mesh on an NPC sets this: three.js culls a
  // `SkinnedMesh` against its geometry's BIND-POSE bounding sphere, which a
  // posed skeleton routinely leaves, and a shadow caster that pops out at the
  // frame edge takes the character's whole shadow with it.
  mesh.frustumCulled = false;
  // `VelocityPass` treats every visible `SkinnedMesh` as a mover unconditionally
  // — a posed skeleton moves whatever its `matrixWorld` says — so without this
  // the proxy gets a motion-vector proxy of its own, at one more draw and one
  // more copy of the character's triangles per frame, writing velocity into
  // pixels the four real meshes have already written. `noVelocity` is that
  // pass's own opt-out and this is exactly what it is for: the proxy has no
  // pixels, so it has no motion to blur.
  mesh.userData.noVelocity = true;
  // **And it rasterises nothing in the colour pass.** The draw call itself is
  // unavoidable — see above — but its triangles are not. three.js calls
  // `onBeforeRender` immediately before `renderBufferDirect` and `onAfterRender`
  // immediately after it, on the colour path ONLY: the shadow path has its own
  // `onBeforeShadow`/`onAfterShadow` hooks and never touches these. So the draw
  // range is closed for the duration of the colour draw and open everywhere
  // else, and `renderBufferDirect` reads `geometry.drawRange` each time.
  //
  // Worth doing because the proxy is the whole character: body + head + outfit
  // is ~60k triangles, and eleven of them rasterising to no colour and no depth
  // was +660k triangles a frame. Measured on `town_npcs`, 12.47 -> 11.83 Mtris
  // with the call count unchanged, which is the pre-merge triangle count back.
  // `drawCount === 0` is drawn, not skipped — `renderBufferDirect` returns early
  // only on a NEGATIVE count — so this trades no shadow for those triangles.
  mesh.onBeforeRender = () => { merged.setDrawRange(0, 0); };
  mesh.onAfterRender = () => { merged.setDrawRange(0, Infinity); };
  mesh.bind(skeleton, bindMatrix);
  return mesh;
}
