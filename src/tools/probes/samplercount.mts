const g = window.GAME;
const gl = g.renderer.getContext();
const out = { limits: {}, mats: [] };
out.limits = {
  maxFragTexUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
  maxCombined: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
  maxVertTex: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
};
const re = /uniform\s+(highp\s+|mediump\s+|lowp\s+)?sampler\w+\s+\w+/g;
const seen = {};
g.scene.traverse((o) => {
  const list = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
  for (const m of list) {
    const p = m.program;
    if (!p) continue;
    const key = m.type + '|' + (m.customProgramCacheKey ? m.customProgramCacheKey() : '');
    if (seen[key]) continue;
    seen[key] = 1;
    const prog = p.program;
    const linked = gl.getProgramParameter(prog, gl.LINK_STATUS);
    gl.validateProgram(prog);
    const valid = gl.getProgramParameter(prog, gl.VALIDATE_STATUS);
    let active = 0;
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    const names = [];
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      const t = info.type;
      // every sampler enum three can emit
      if (t === 0x8b5e || t === 0x8b5f || t === 0x8b60 || t === 0x8b62 || t === 0x8dc1
        || t === 0x8dc2 || t === 0x8dc4 || t === 0x8dca || t === 0x8dcb || t === 0x8dcc
        || t === 0x8dcf || t === 0x8dd2 || t === 0x8dd3 || t === 0x8dd4 || t === 0x8dd7
        || t === 0x8db5 || t === 0x904d || t === 0x9108) { active++; names.push(info.name); }
    }
    out.mats.push({
      key, linked, valid, activeSamplers: active, names,
      log: gl.getProgramInfoLog(prog).slice(0, 900),
    });
  }
});
return out;
