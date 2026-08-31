// Are the sky texels the container hands over actually the same bytes?
//
// `demo=1&webp=0` renders perfect clouds and `demo=1` does not, so something
// in the image container differs. The three sky entries are stored `raw` and
// should be byte-identical. "Should be" is what this replaces.
const paths = ['baked/m/tex.bin', 'baked/tex.bin.gz'];
const out = {};

const readPlane = async (p) => {
  const res = await fetch('/' + p);
  const enc = (res.headers.get('content-encoding') || '').includes('gzip');
  const body = enc ? res.body : res.body.pipeThrough(new DecompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(body).arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const hlen = dv.getUint32(8, true);
  const h = JSON.parse(new TextDecoder().decode(buf.subarray(12, 12 + hlen)));
  return { buf, h, body: 12 + hlen };
};

const img = await (async () => {
  const res = await fetch('/' + paths[0]);
  const buf = new Uint8Array(await res.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const hlen = dv.getUint32(8, true);
  const h = JSON.parse(new TextDecoder().decode(buf.subarray(12, 12 + hlen)));
  return { buf, h, body: 12 + hlen };
})();
const gz = await readPlane(paths[1]);

// The plane container stores four SEPARATE channel planes; the image one
// stores interleaved RGBA. Un-plane the gzip side before comparing.
const unplane = (src, w, hh) => {
  const n = w * hh;
  const o = new Uint8Array(n * 4);
  for (let c = 0; c < 4; c++) for (let i = 0; i < n; i++) o[i * 4 + c] = src[c * n + i];
  return o;
};

for (const e of img.h.entries) {
  if (!e.k.startsWith('sky/')) continue;
  const g = gz.h.entries.find((x) => x.k === e.k);
  if (!g) { out[e.k] = 'missing in gzip container'; continue; }
  const a = img.buf.subarray(img.body + e.off, img.body + e.off + e.len);
  const b = unplane(gz.buf.subarray(gz.body + g.off, gz.body + g.off + e.len), e.w, e.h);
  let diff = 0, first = -1;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { diff++; if (first < 0) first = i; }
  out[e.k] = { mime: e.mime, bytes: a.length, differing: diff, firstAt: first,
    sampleImg: [...a.slice(0, 8)], sampleGz: [...b.slice(0, 8)] };
}
return out;
