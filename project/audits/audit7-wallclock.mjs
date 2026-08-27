// 7-day transcript audit: wallclock by category/day, contention overlap, marker mining,
// poll patterns, background usage, subagent durations, long-run inventory.
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';

const files = process.argv.slice(2);
const NOW = Date.now();
const CUTOFF = NOW - 7 * 24 * 3600_000;

const DAEMON_RE = /(shoot|corpus|mapshoot|ui-shoot|dresscam|chartshoot|sheet|framecam|creaturecheck|attrib|seatcheck|heightcheck|probe|gameplay|combatloop|integration|uxcheck|driftcheck|reachcheck|mapview|compare|imagestats|reliefstat|silhouette|silrocks|hydrocheck|roadcheck|floatcheck|drawcheck|detcheck|bootprof|bench|perf|texbake|longplay|walkabout|fightshape|loopclose|regaliadrive)\.mts|pnpm run check/;

function cat(name, input) {
  if (name === 'Task' || name === 'Agent') return 'Subagent';
  if (name !== 'Bash') return name;
  const c = (input?.command || '').trim();
  if (/longplay\.mts/.test(c)) return 'Bash:longplay';
  if (/walkabout|fightshape|loopclose|regaliadrive/.test(c)) return 'Bash:midprobe';
  if (/probe\.mts|_probe/.test(c)) return 'Bash:probe';
  if (/shoot\.mts/.test(c)) return 'Bash:shoot';
  if (/perf\.mts/.test(c)) return 'Bash:perf';
  if (/gameplay\.mts/.test(c)) return 'Bash:gameplay';
  if (/drawcheck\.mts/.test(c)) return 'Bash:drawcheck';
  if (/reachcheck\.mts/.test(c)) return 'Bash:reachcheck';
  if (/uxcheck\.mts/.test(c)) return 'Bash:uxcheck';
  if (/driftcheck\.mts/.test(c)) return 'Bash:driftcheck';
  if (/integration\.mts/.test(c)) return 'Bash:integration';
  if (/combatloop\.mts/.test(c)) return 'Bash:combatloop';
  if (/(floatcheck|seatcheck|nightcheck|lodcheck|heightcheck|hydrocheck|roadcheck|silhouette|silrocks|geocheck|horizoncheck|creaturecheck|anycheck|orphans|detcheck)\.mts/.test(c)) return 'Bash:othercheck';
  if (/check\.mts|pnpm run check/.test(c)) return 'Bash:check';
  if (/daemon\.mts/.test(c)) return 'Bash:daemon';
  if (/cleanup\.mts|identity\.mts/.test(c)) return 'Bash:daemonctl';
  if (/imgdiff|imagestats|crop\.mts|sheet\.mts/.test(c)) return 'Bash:imgtools';
  if (/bootprof|bench\.mts|texbake/.test(c)) return 'Bash:benchtools';
  if (/typecheck|tsc\b/.test(c)) return 'Bash:typecheck';
  if (/pnpm run build|vite build/.test(c)) return 'Bash:build';
  if (/^git |[;&] *git | git /.test(c)) return 'Bash:git';
  if (/^(ls|cat|head|tail|grep|rg|find|wc|sed|awk|du|df|echo|jq)\b/.test(c)) return 'Bash:readshell';
  if (/sleep/.test(c)) return 'Bash:sleepish';
  return 'Bash:other';
}

const MARKERS = {
  busy429: /429|daemon busy|give up rather than queue/i,
  quietWait: /requesting the quiet lane|will wait up to/,
  quietHeld: /quiet lane held/,
  ctxDestroyed: /Execution context was destroyed/,
  socketIdle: /daemon socket idle/,
  leaseGone: /lease.*(expired|gone|released)/i,
  timeout600: /Command timed out after/,
};

const calls = [];   // {file,sess,cat,secs,ts,cmd,sidechain,bg,markers:[],rc}
const gapsByDay = new Map();
const pollCalls = [];
let bgCount = 0, fgCount = 0;
const subagents = [];

async function parse(file) {
  const pend = new Map();
  let lastResultTs = null;
  const sess = path.basename(path.dirname(file)).length > 30
    ? path.basename(path.dirname(file)).slice(0, 8) + '/sub-' + path.basename(file, '.jsonl').slice(0, 8)
    : path.basename(file, '.jsonl').slice(0, 8);
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
        if (b.type !== 'tool_use') continue;
        sawToolUse = true;
        const c = b.input?.command || '';
        const bg = !!b.input?.run_in_background;
        if (b.name === 'Bash') { bg ? bgCount++ : fgCount++; }
        pend.set(b.id, { name: b.name, cat: cat(b.name, b.input), ts, bg,
          cmd: (c || b.input?.file_path || (b.input?.prompt || '').slice(0, 100) || '').slice(0, 200),
          sidechain: !!o.isSidechain });
        if (b.name === 'Bash' && ts >= CUTOFF) {
          if (/(for|while|until)[^\n]{0,220}\bsleep\s+\d+/.test(c) || /while\s*\(.*Date\.now\(\)/.test(c) || /\bsleep\s+([6-9]\d|\d{3,})\b/.test(c))
            pollCalls.push({ ts, cmd: c.replace(/\s+/g, ' ').slice(0, 140), sess });
        }
      }
      if (sawToolUse && lastResultTs !== null && ts >= CUTOFF) {
        const g = (ts - lastResultTs) / 1000;
        if (g >= 0 && g < 3600) {
          const day = new Date(ts).toISOString().slice(0, 10);
          const d = gapsByDay.get(day) || { n: 0, tot: 0 };
          d.n++; d.tot += g; gapsByDay.set(day, d);
        }
      }
    } else if (o.type === 'user') {
      for (const b of content) {
        if (b.type !== 'tool_result' || !pend.has(b.tool_use_id)) continue;
        const p = pend.get(b.tool_use_id); pend.delete(b.tool_use_id);
        lastResultTs = ts;
        if (p.ts < CUTOFF) continue;
        const secs = (ts - p.ts) / 1000;
        const raw = typeof b.content === 'string' ? b.content
          : JSON.stringify(b.content || '').slice(0, 8000);
        const marks = [];
        for (const [k, re] of Object.entries(MARKERS)) if (re.test(raw)) marks.push(k);
        const rec = { sess, cat: p.cat, secs, ts: p.ts, cmd: p.cmd, sidechain: p.sidechain, bg: p.bg, marks };
        calls.push(rec);
        if (p.name === 'Task' || p.name === 'Agent') subagents.push({ sess, secs, ts: p.ts, cmd: p.cmd });
      }
    }
  }
}
for (const f of files) await parse(f);

// ---- per-category, per half-week ----
const mid = CUTOFF + 3.5 * 24 * 3600_000;
const byCat = {};
for (const r of calls) {
  const b = (byCat[r.cat] ||= { n: 0, tot: 0, max: 0, h1: 0, h2: 0, n1: 0, n2: 0 });
  b.n++; b.tot += r.secs; if (r.secs > b.max) b.max = r.secs;
  if (r.ts < mid) { b.h1 += r.secs; b.n1++; } else { b.h2 += r.secs; b.n2++; }
}
const catRows = Object.entries(byCat).map(([k, v]) => ({
  cat: k, n: v.n, totMin: +(v.tot / 60).toFixed(1), avgS: +(v.tot / v.n).toFixed(1), maxS: +v.max.toFixed(0),
  firstHalfMin: +(v.h1 / 60).toFixed(0), secondHalfMin: +(v.h2 / 60).toFixed(0), n1: v.n1, n2: v.n2,
})).sort((a, b) => b.totMin - a.totMin);

// ---- contention overlap on daemon-touching calls ----
const dcalls = calls.filter(r => DAEMON_RE.test(r.cmd) && r.secs > 2);
dcalls.sort((a, b) => a.ts - b.ts);
for (const r of dcalls) r.end = r.ts + r.secs * 1000;
for (let i = 0; i < dcalls.length; i++) {
  const r = dcalls[i]; let ov = 0;
  for (let j = 0; j < dcalls.length; j++) {
    if (j === i) continue;
    const o = dcalls[j];
    if (o.ts >= r.end) break;
    if (o.end > r.ts && o.sess !== r.sess) ov++;
  }
  r.ov = ov;
}
const ovByCat = {};
for (const r of dcalls) {
  const b = (ovByCat[r.cat] ||= { solo: [], cont: [] });
  (r.ov === 0 ? b.solo : b.cont).push(r.secs);
}
const med = a => { if (!a.length) return null; a.sort((x, y) => x - y); return +a[Math.floor(a.length / 2)].toFixed(1); };
const ovRows = Object.entries(ovByCat).map(([k, v]) => ({
  cat: k, nSolo: v.solo.length, medSolo: med(v.solo), nContended: v.cont.length, medContended: med(v.cont),
})).filter(r => r.nSolo + r.nContended >= 5).sort((a, b) => (b.nContended + b.nSolo) - (a.nContended + a.nSolo));

// ---- markers ----
const markCounts = {};
for (const r of calls) for (const m of r.marks) {
  const b = (markCounts[m] ||= { n: 0, totMin: 0, cats: {} });
  b.n++; b.totMin += r.secs / 60; b.cats[r.cat] = (b.cats[r.cat] || 0) + 1;
}
for (const m of Object.values(markCounts)) m.totMin = +m.totMin.toFixed(1);

// ---- long-run inventory ----
const long = calls.filter(r => r.secs > 120).sort((a, b) => b.secs - a.secs).slice(0, 50)
  .map(r => ({ min: +(r.secs / 60).toFixed(1), cat: r.cat, when: new Date(r.ts).toISOString().slice(5, 16), sess: r.sess, sc: r.sidechain, bg: r.bg, ov: r.ov ?? '', marks: r.marks.join(','), cmd: r.cmd.slice(0, 110) }));

// ---- totals ----
const totMin = calls.reduce((s, r) => s + r.secs, 0) / 60;
const gapRows = [...gapsByDay.entries()].sort().map(([d, v]) => ({ day: d, turns: v.n, gapMin: +(v.tot / 60).toFixed(0), avgGapS: +(v.tot / v.n).toFixed(1) }));

console.log(JSON.stringify({
  files: files.length, calls: calls.length, toolWallMin: +totMin.toFixed(0),
  bashFg: fgCount, bashBg: bgCount,
  pollCallCount: pollCalls.length,
  subagentCount: subagents.length,
}, null, 1));
console.log('CATEGORIES=' + JSON.stringify(catRows.filter(r => r.totMin > 2), null, 1));
console.log('OVERLAP=' + JSON.stringify(ovRows, null, 1));
console.log('MARKERS=' + JSON.stringify(markCounts, null, 1));
console.log('GAP_BY_DAY=' + JSON.stringify(gapRows, null, 1));
console.log('TOP_LONG=' + JSON.stringify(long, null, 1));
console.log('POLL_SAMPLE=' + JSON.stringify(pollCalls.slice(-25).map(p => ({ when: new Date(p.ts).toISOString().slice(5, 16), sess: p.sess, cmd: p.cmd })), null, 1));
const subTop = subagents.sort((a, b) => b.secs - a.secs).slice(0, 20).map(s => ({ min: +(s.secs / 60).toFixed(0), when: new Date(s.ts).toISOString().slice(5, 16), sess: s.sess, prompt: s.cmd.slice(0, 90) }));
console.log('SUBAGENTS_TOP=' + JSON.stringify(subTop, null, 1));
