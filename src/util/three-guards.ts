import type * as THREE from 'three';

/**
 * Type guards for three.js's runtime discriminants.
 *
 * three tags its classes with `isMesh`, `isLight`, `isBone` and friends, and
 * the traversal code here reads them constantly -- but `Object3D` declares none
 * of them, so every read is an error and the tempting fix is a cast. A cast
 * asserts; a guard *narrows*, so the branch below it gets the real type and the
 * next mistake in it is a compile error rather than a runtime one.
 *
 *   scene.traverse((o) => { if (isMesh(o)) o.geometry.dispose(); });
 */
const has = (o: unknown, flag: string): boolean =>
  !!o && (o as Record<string, unknown>)[flag] === true;

export const isObject3D = (o: unknown): o is THREE.Object3D => has(o, 'isObject3D');
export const isMesh = (o: unknown): o is THREE.Mesh => has(o, 'isMesh');
export const isSkinnedMesh = (o: unknown): o is THREE.SkinnedMesh => has(o, 'isSkinnedMesh');
export const isInstancedMesh = (o: unknown): o is THREE.InstancedMesh => has(o, 'isInstancedMesh');
export const isBone = (o: unknown): o is THREE.Bone => has(o, 'isBone');
export const isLight = (o: unknown): o is THREE.Light => has(o, 'isLight');
export const isDirectionalLight = (o: unknown): o is THREE.DirectionalLight => has(o, 'isDirectionalLight');
export const isPointLight = (o: unknown): o is THREE.PointLight => has(o, 'isPointLight');
export const isSpotLight = (o: unknown): o is THREE.SpotLight => has(o, 'isSpotLight');
export const isCamera = (o: unknown): o is THREE.Camera => has(o, 'isCamera');
export const isVector3 = (o: unknown): o is THREE.Vector3 => has(o, 'isVector3');
export const isColor = (o: unknown): o is THREE.Color => has(o, 'isColor');
export const isMeshStandardMaterial = (o: unknown): o is THREE.MeshStandardMaterial =>
  has(o, 'isMeshStandardMaterial');
