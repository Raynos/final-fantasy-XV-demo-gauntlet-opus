/**
 * The dungeon map.
 *
 * `data()` is the whole thing as plain JSON — rooms, runs, markers, which parts
 * the party has actually walked through — so any UI can draw it however it
 * likes. `draw()` is a reference renderer in the project's UI language (thin
 * pale-blue strokes, low-opacity dark fills, angular corners) that a map screen
 * or a HUD inset can call straight onto a 2D context.
 */
export class DungeonMap {
  L!: any;
  dungeon!: any;
  constructor(layout: import('./Layout.ts').Layout, dungeon: import('./Dungeon.ts').Dungeon) {
    this.L = layout;
    this.dungeon = dungeon;
  }

  data(partyLocal = null): any {
    const L = this.L;
    const seen = this.dungeon.discovered;
    const rooms = [];
    for (const r of L.rooms.values()) {
      rooms.push({
        id: r.id, name: r.name, kind: r.kind,
        x: r.x, z: r.z, w: r.w, d: r.d, y: r.y,
        seen: seen.has(r.id),
      });
    }
    const runs = L.corridors.map((c: any) => ({
      id: c.id, width: c.width, kind: c.kind,
      path: c.path.map((p: any) => [p[0], p[1]]),
      seen: seen.has(c.id),
    }));
    const markers = [];
    for (const c of L.chests) {
      markers.push({ kind: c.opened ? 'chest-open' : 'chest', x: c.at[0], z: c.at[1], name: c.name });
    }
    for (const d of L.doors) {
      markers.push({ kind: d.key ? 'locked' : 'door', x: d.at[0], z: d.at[1], name: d.name });
    }
    for (const h of L.hazards) markers.push({ kind: 'hazard', x: h.at[0], z: h.at[1], name: h.kind });
    for (const e of L.encounters) markers.push({ kind: e.boss ? 'boss' : 'enemy', x: e.at[0], z: e.at[1], name: e.name });
    markers.push({ kind: 'exit', x: L.exitAt[0], z: L.exitAt[1], name: 'Exit' });

    return {
      id: L.id, name: L.name, bounds: L.bounds(), rooms, runs, markers,
      party: partyLocal ? { x: partyLocal.x, z: partyLocal.z, y: partyLocal.y } : null,
    };
  }

  /**
   * Reference renderer.
   */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, opts: {party?:any, revealAll?:boolean, pad?:number} = {}) {
    const d = this.data(opts.party || null);
    const b = d.bounds;
    const pad = opts.pad != null ? opts.pad : 18;
    const sx = (w - pad * 2) / Math.max(1, b.x1 - b.x0);
    const sz = (h - pad * 2) / Math.max(1, b.z1 - b.z0);
    const s = Math.min(sx, sz);
    const ox = pad + ((w - pad * 2) - (b.x1 - b.x0) * s) * 0.5;
    const oz = pad + ((h - pad * 2) - (b.z1 - b.z0) * s) * 0.5;
    const X = (x: any) => ox + (x - b.x0) * s;
    const Z = (z: any) => oz + (z - b.z0) * s;

    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = 'miter';

    // corridors first so rooms sit on top of them
    for (const r of d.runs) {
      const on = opts.revealAll || r.seen;
      ctx.strokeStyle = on ? 'rgba(150,196,226,0.50)' : 'rgba(120,150,170,0.14)';
      ctx.lineWidth = Math.max(1.5, r.width * s * 0.8);
      ctx.beginPath();
      r.path.forEach((p: any, i: any) => (i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1]))));
      ctx.stroke();
    }

    for (const r of d.rooms) {
      const on = opts.revealAll || r.seen;
      const x = X(r.x - r.w * 0.5), z = Z(r.z - r.d * 0.5);
      const ww = r.w * s, hh = r.d * s;
      const cut = Math.min(7, Math.min(ww, hh) * 0.22);
      ctx.beginPath();
      // angular corner cut, matching the game's UI language
      ctx.moveTo(x + cut, z);
      ctx.lineTo(x + ww, z);
      ctx.lineTo(x + ww, z + hh - cut);
      ctx.lineTo(x + ww - cut, z + hh);
      ctx.lineTo(x, z + hh);
      ctx.lineTo(x, z + cut);
      ctx.closePath();
      ctx.fillStyle = on
        ? (r.kind === 'boss' ? 'rgba(150,60,52,0.30)' : 'rgba(28,42,54,0.62)')
        : 'rgba(20,26,32,0.30)';
      ctx.fill();
      ctx.strokeStyle = on ? 'rgba(186,220,240,0.72)' : 'rgba(120,150,170,0.18)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      if (on && r.name && ww > 34) {
        ctx.fillStyle = 'rgba(214,232,244,0.80)';
        ctx.font = '9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '1px';
        ctx.fillText(r.name.toUpperCase(), x + ww * 0.5, z + hh * 0.5 + 3);
      }
    }

    for (const m of d.markers) {
      const x = X(m.x), z = Z(m.z);
      const col = {
        chest: '#e8c463', 'chest-open': 'rgba(150,140,110,0.55)',
        locked: '#e06a52', door: 'rgba(170,205,228,0.8)',
        hazard: '#d9702f', boss: '#e0503c', enemy: 'rgba(220,120,100,0.7)',
        exit: '#8fe0ff',
      }[m.kind] || '#9fd';
      ctx.fillStyle = col;
      ctx.beginPath();
      if (m.kind === 'boss') {
        ctx.moveTo(x, z - 6); ctx.lineTo(x + 5, z); ctx.lineTo(x, z + 6); ctx.lineTo(x - 5, z);
      } else {
        ctx.rect(x - 2.5, z - 2.5, 5, 5);
      }
      ctx.fill();
    }

    if (d.party) {
      const x = X(d.party.x), z = Z(d.party.z);
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, z, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, z, 8.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
