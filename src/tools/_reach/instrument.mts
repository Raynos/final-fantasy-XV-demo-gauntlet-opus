/*
 * Wrap every method reachable from the registered systems in a call counter.
 *
 * No annotations anywhere in the game: the point is to catch code nobody
 * remembered to think about, and an opt-in marker is exactly what that code
 * would be missing. So this walks the live object graph instead.
 *
 * Evaluated as a function body in the page. Sets `window.__REACH`.
 */
const g = window.GAME;
const counts = new Map();
const named = new Map();

/** Never wrap these: they are hot, huge, or not ours. */
const SKIP_CTOR = /^(Vector[234]|Matrix[34]|Quaternion|Euler|Color|Box3|Sphere|Ray|Plane|Float32Array|Map|Set|Array|Object|Promise|Function)$/;

const seen = new Set();

function wrapProto(proto, label) {
  if (!proto || proto === Object.prototype || seen.has(proto)) return;
  seen.add(proto);
  const ctor = proto.constructor && proto.constructor.name;
  if (!ctor || SKIP_CTOR.test(ctor)) return;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === 'constructor') continue;
    const d = Object.getOwnPropertyDescriptor(proto, key);
    // Getters run on read; wrapping them changes evaluation order. Skip.
    if (!d || typeof d.value !== 'function' || !d.writable || !d.configurable) continue;
    const id = `${label}.${key}`;
    if (named.has(id)) continue;
    const fn = d.value;
    named.set(id, true);
    counts.set(id, 0);
    Object.defineProperty(proto, key, {
      ...d,
      value: function reachWrapped(...args) {
        counts.set(id, counts.get(id) + 1);
        return fn.apply(this, args);
      },
    });
  }
  wrapProto(Object.getPrototypeOf(proto), label);
}

/** Bounded walk: systems, then their own object-valued fields, two deep. */
function harvest(obj, label, depth) {
  if (!obj || depth > 2 || typeof obj !== 'object') return;
  const proto = Object.getPrototypeOf(obj);
  const ctor = proto && proto.constructor && proto.constructor.name;
  if (ctor && !SKIP_CTOR.test(ctor)) wrapProto(proto, ctor);
  if (depth === 2) return;
  for (const k of Object.keys(obj)) {
    if (k.startsWith('_') && depth > 0) continue;
    let v;
    try { v = obj[k]; } catch { continue; }
    if (!v || typeof v !== 'object') continue;
    if (v.isObject3D || v.isMaterial || v.isBufferGeometry || v.isTexture) continue;
    if (Array.isArray(v)) { for (const it of v.slice(0, 3)) harvest(it, k, depth + 1); continue; }
    if (v instanceof Map) { for (const it of [...v.values()].slice(0, 3)) harvest(it, k, depth + 1); continue; }
    harvest(v, k, depth + 1);
  }
}

for (const s of g.systems || []) harvest(s, 'sys', 0);

window.__REACH_COUNTS = counts;
window.__REACH = () => {
  const reached = {};
  const unreached = [];
  for (const [id, n] of counts) { if (n > 0) reached[id] = n; else unreached.push(id); }
  unreached.sort();
  return { reached, unreached, instrumented: counts.size, errors: [] };
};
return true;
