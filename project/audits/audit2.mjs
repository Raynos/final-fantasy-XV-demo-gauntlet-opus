// Second pass: gap decomposition, token/cache waste, rabbit-hole mining.
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

const files = process.argv.slice(2);
const CUTOFF = Date.parse('2026-08-22T16:30:00Z');

const sessions = new Map(); // key -> stats
function S(k) {
  if (!sessions.has(k)) sessions.set(k, { turns:0, out:0, think:0, cacheRead:0, cacheCreate:0, rawIn:0,
    first:Infinity, last:0, gaps:[], gapTok:[], tools:0, commits:0, shoots:0, edits:new Map(), reads:new Map(),
    imgResults:0, imgBytes:0, bigResults:0, resultBytes:0, shotNames:new Map(), cmds:new Map(), typechecks:0, checks:0, sidechain:false });
  return sessions.get(k);
}

const seenMsg = new Set();
const allCmds = new Map();

async function parse(file) {
  const base = path.basename(file, '.jsonl');
  const dir = path.basename(path.dirname(file));
  const key = dir.includes('-') && dir.length > 30 ? `${dir.slice(0,8)}/sub-${base.slice(0,8)}` : base.slice(0,8);
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let lastTs = null;
  for await (const line of rl) {
    let o; try { o = JSON.parse(line); } catch { continue; }
    const ts = o.timestamp ? Date.parse(o.timestamp) : null;
    if (!ts || ts < CUTOFF) continue;
    const st = S(key);
    if (o.isSidechain) st.sidechain = true;
    st.first = Math.min(st.first, ts); st.last = Math.max(st.last, ts);
    const content = o.message?.content;
    if (o.type === 'assistant') {
      const u = o.message?.usage;
      const mid = o.message?.id;
      if (u && mid && !seenMsg.has(mid)) {
        seenMsg.add(mid);
        st.turns++;
        st.out += u.output_tokens || 0;
        st.think += u.output_tokens_details?.thinking_tokens || 0;
        st.cacheRead += u.cache_read_input_tokens || 0;
        st.cacheCreate += u.cache_creation_input_tokens || 0;
        st.rawIn += u.input_tokens || 0;
        if (lastTs !== null) {
          const g = (ts - lastTs) / 1000;
          if (g >= 0 && g < 3600) { st.gaps.push(g); st.gapTok.push(u.output_tokens || 0); }
        }
      }
      if (Array.isArray(content)) for (const b of content) {
        if (b.type !== 'tool_use') continue;
        st.tools++;
        if (b.name === 'Edit' || b.name === 'Write') {
          const f = b.input?.file_path || ''; st.edits.set(f, (st.edits.get(f)||0)+1);
        } else if (b.name === 'Read') {
          const f = b.input?.file_path || ''; st.reads.set(f, (st.reads.get(f)||0)+1);
        } else if (b.name === 'Bash') {
          const c = (b.input?.command || '');
          const cn = c.replace(/\s+/g,' ').trim().slice(0,120);
          allCmds.set(cn, (allCmds.get(cn)||0)+1);
          if (/git commit/.test(c)) st.commits++;
          if (/shoot\.mts/.test(c)) { st.shoots++;
            const m = c.match(/shoot\.mts\s+((?:[a-z_0-9]+\s*)+)/i);
            if (m) for (const n of m[1].trim().split(/\s+/).filter(x=>!x.startsWith('--'))) st.shotNames.set(n,(st.shotNames.get(n)||0)+1);
          }
          if (/typecheck|tsc\b/.test(c)) st.typechecks++;
          if (/pnpm run check|check\.mts/.test(c)) st.checks++;
        }
      }
    } else if (o.type === 'user' && Array.isArray(content)) {
      for (const b of content) {
        if (b.type !== 'tool_result') continue;
        lastTs = ts;
        const raw = JSON.stringify(b.content || '');
        st.resultBytes += raw.length;
        if (raw.includes('"type":"image"')) { st.imgResults++; st.imgBytes += raw.length; }
        if (raw.length > 20000) st.bigResults++;
      }
    }
    if (o.type === 'assistant') lastTs = lastTs; // gap anchor stays last tool_result
  }
}
for (const f of files) await parse(f);

// gap decomposition: estimate gen speed from per-turn (tokens, gap) pairs
const pairs = [];
for (const st of sessions.values()) for (let i=0;i<st.gaps.length;i++) if (st.gapTok[i] > 200) pairs.push(st.gapTok[i]/st.gaps[i]);
pairs.sort((a,b)=>a-b);
const p90rate = pairs[Math.floor(pairs.length*0.9)] || 60; // tok/s achievable
let gapTot=0, genTot=0;
for (const st of sessions.values()) for (let i=0;i<st.gaps.length;i++) { gapTot += st.gaps[i]; genTot += Math.min(st.gaps[i], (st.gapTok[i]||0)/p90rate); }

const rows = [...sessions.entries()].map(([k,s])=>({
  k, sub:s.sidechain, hrs:+((s.last-s.first)/3600000).toFixed(1), turns:s.turns, tools:s.tools,
  outK:Math.round(s.out/1000), thinkK:Math.round(s.think/1000),
  cacheReadM:+(s.cacheRead/1e6).toFixed(1), cacheCreateM:+(s.cacheCreate/1e6).toFixed(1),
  commits:s.commits, shoots:s.shoots, checks:s.checks, typechecks:s.typechecks,
  imgs:s.imgResults, imgMB:+(s.imgBytes/1e6).toFixed(0), resMB:+(s.resultBytes/1e6).toFixed(0),
  topEdit: [...s.edits.entries()].sort((a,b)=>b[1]-a[1])[0],
  topShot: [...s.shotNames.entries()].sort((a,b)=>b[1]-a[1])[0],
  topRead: [...s.reads.entries()].filter(x=>x[1]>3).sort((a,b)=>b[1]-a[1])[0],
})).sort((a,b)=>b.outK-a.outK);

const tot = rows.reduce((a,r)=>({outK:a.outK+r.outK, thinkK:a.thinkK+r.thinkK, cacheReadM:a.cacheReadM+r.cacheReadM, cacheCreateM:a.cacheCreateM+r.cacheCreateM, imgs:a.imgs+r.imgs, imgMB:a.imgMB+r.imgMB, resMB:a.resMB+r.resMB, turns:a.turns+r.turns}),{outK:0,thinkK:0,cacheReadM:0,cacheCreateM:0,imgs:0,imgMB:0,resMB:0,turns:0});
console.log('TOTALS', JSON.stringify({...tot, sessions:rows.length, gapMin:Math.round(gapTot/60), genMinAtP90:Math.round(genTot/60), p90rate:+p90rate.toFixed(1)}));
console.log('\nTOP 20 SESSIONS BY OUTPUT TOKENS');
for (const r of rows.slice(0,20)) console.log(JSON.stringify(r));
console.log('\nTOP 15 REPEATED COMMANDS');
for (const [c,n] of [...allCmds.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15)) console.log(n, '×', c);
