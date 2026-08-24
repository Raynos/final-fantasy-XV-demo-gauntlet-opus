// Parse Claude Code transcripts: wall-clock per tool call, gaps (model latency), patterns.
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

const files = process.argv.slice(2);
const CUTOFF = Date.parse('2026-08-22T16:30:00Z') - 0; // ~48h before now (local ~16:30 Aug 24)

// per tool-use id: {name, cmd, tsUse}
const results = []; // {file, name, cat, secs, ts, sidechain}
const gaps = [];    // model/api latency between result and next assistant msg

function cat(name, input) {
  if (name !== 'Bash') return name;
  const c = (input?.command || '').trim();
  const first = c.split(/\s+/).slice(0, 6).join(' ');
  if (/shoot\.mts/.test(c)) return 'Bash:shoot.mts';
  if (/perf\.mts/.test(c)) return 'Bash:perf.mts';
  if (/gameplay\.mts/.test(c)) return 'Bash:gameplay.mts';
  if (/integration\.mts/.test(c)) return 'Bash:integration.mts';
  if (/combatloop\.mts/.test(c)) return 'Bash:combatloop.mts';
  if (/roadcheck\.mts/.test(c)) return 'Bash:roadcheck.mts';
  if (/floatcheck|seatcheck|nightcheck|lodcheck/.test(c)) return 'Bash:*check.mts';
  if (/probe\.mts|_probe/.test(c)) return 'Bash:probe.mts';
  if (/imgdiff\.mts/.test(c)) return 'Bash:imgdiff.mts';
  if (/daemon\.mts/.test(c)) return 'Bash:daemon.mts';
  if (/pnpm run check:gate|check:gate/.test(c)) return 'Bash:check:gate';
  if (/pnpm run check:perf/.test(c)) return 'Bash:check:perf';
  if (/pnpm run check\b/.test(c)) return 'Bash:check';
  if (/pnpm run build:full/.test(c)) return 'Bash:build:full';
  if (/pnpm run build|vite build/.test(c)) return 'Bash:build';
  if (/typecheck|tsc\b/.test(c)) return 'Bash:typecheck';
  if (/^git /.test(c) || / git /.test(c)) return 'Bash:git';
  if (/bench/.test(c)) return 'Bash:bench';
  if (/node (--experimental|-e)/.test(c)) return 'Bash:node-inline';
  if (/^(ls|cat|head|tail|grep|rg|find|wc|sed|awk|du|df)\b/.test(c)) return 'Bash:read-shell';
  return 'Bash:other';
}

async function parse(file) {
  const pend = new Map(); // id -> {name, cat, ts, cmdShort, sidechain}
  let lastResultTs = null;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    let o; try { o = JSON.parse(line); } catch { continue; }
    const ts = o.timestamp ? Date.parse(o.timestamp) : null;
    if (!ts) continue;
    const content = o.message?.content;
    if (!Array.isArray(content)) continue;
    if (o.type === 'assistant') {
      let sawToolUse = false;
      for (const b of content) {
        if (b.type === 'tool_use') {
          sawToolUse = true;
          pend.set(b.id, { name: b.name, cat: cat(b.name, b.input), ts,
            cmd: (b.input?.command || b.input?.file_path || b.input?.prompt || '').slice(0, 160),
            sidechain: !!o.isSidechain });
        }
      }
      if (sawToolUse && lastResultTs !== null && ts >= CUTOFF) {
        const g = (ts - lastResultTs) / 1000;
        if (g >= 0 && g < 3600) gaps.push({ file: path.basename(file), secs: g, sidechain: !!o.isSidechain });
      }
    } else if (o.type === 'user') {
      for (const b of content) {
        if (b.type === 'tool_result' && pend.has(b.tool_use_id)) {
          const p = pend.get(b.tool_use_id); pend.delete(b.tool_use_id);
          lastResultTs = ts;
          if (p.ts >= CUTOFF) results.push({ file: path.basename(path.dirname(file)) + '/' + path.basename(file), name: p.name, cat: p.cat, secs: (ts - p.ts) / 1000, ts: p.ts, cmd: p.cmd, sidechain: p.sidechain });
        }
      }
    }
  }
}

for (const f of files) await parse(f);

const by = {};
for (const r of results) {
  (by[r.cat] ||= { n: 0, tot: 0, max: 0, ex: '' });
  const b = by[r.cat]; b.n++; b.tot += r.secs;
  if (r.secs > b.max) { b.max = r.secs; b.ex = r.cmd; }
}
const rows = Object.entries(by).map(([k, v]) => ({ cat: k, n: v.n, totalMin: +(v.tot / 60).toFixed(1), avgS: +(v.tot / v.n).toFixed(1), maxS: +v.max.toFixed(0), ex: v.ex }))
  .sort((a, b) => b.totalMin - a.totalMin);
const totMin = results.reduce((s, r) => s + r.secs, 0) / 60;
const gapTot = gaps.reduce((s, g) => s + g.secs, 0) / 60;
console.log(JSON.stringify({ calls: results.length, toolWallMin: +totMin.toFixed(0), modelGapMin: +gapTot.toFixed(0), gapCount: gaps.length, rows }, null, 1));

// top 40 slowest individual calls
const top = [...results].sort((a, b) => b.secs - a.secs).slice(0, 40)
  .map(r => ({ secs: +r.secs.toFixed(0), cat: r.cat, sidechain: r.sidechain, cmd: r.cmd.slice(0, 120) }));
console.log('TOP40=' + JSON.stringify(top, null, 1));
