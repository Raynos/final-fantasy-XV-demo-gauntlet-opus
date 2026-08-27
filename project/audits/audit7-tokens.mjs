// Per-day token/cache/image stats, 7 days.
import fs from 'node:fs';
import readline from 'node:readline';
const files = process.argv.slice(2);
const CUTOFF = Date.now() - 7 * 24 * 3600_000;
const days = new Map();
const seen = new Set();
function D(k) { if (!days.has(k)) days.set(k, { turns: 0, outK: 0, cacheReadM: 0, cacheCreateM: 0, imgs: 0, imgMB: 0 }); return days.get(k); }
for (const f of files) {
  const rl = readline.createInterface({ input: fs.createReadStream(f), crlfDelay: Infinity });
  for await (const line of rl) {
    let o; try { o = JSON.parse(line); } catch { continue; }
    const ts = o.timestamp ? Date.parse(o.timestamp) : null;
    if (!ts || ts < CUTOFF) continue;
    const day = new Date(ts).toISOString().slice(0, 10);
    if (o.type === 'assistant') {
      const u = o.message?.usage, mid = o.message?.id;
      if (u && mid && !seen.has(mid)) {
        seen.add(mid);
        const d = D(day);
        d.turns++; d.outK += (u.output_tokens || 0) / 1000;
        d.cacheReadM += (u.cache_read_input_tokens || 0) / 1e6;
        d.cacheCreateM += (u.cache_creation_input_tokens || 0) / 1e6;
      }
    } else if (o.type === 'user' && Array.isArray(o.message?.content)) {
      for (const b of o.message.content) {
        if (b.type !== 'tool_result') continue;
        const raw = JSON.stringify(b.content || '');
        if (raw.includes('"type":"image"')) { const d = D(day); d.imgs++; d.imgMB += raw.length / 1e6; }
      }
    }
  }
}
for (const [k, v] of [...days.entries()].sort())
  console.log(k, JSON.stringify({ turns: v.turns, outK: Math.round(v.outK), cacheReadM: Math.round(v.cacheReadM), cacheCreateM: Math.round(v.cacheCreateM), imgs: v.imgs, imgMB: Math.round(v.imgMB) }));
