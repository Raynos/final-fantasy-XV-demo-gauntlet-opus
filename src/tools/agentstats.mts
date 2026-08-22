#!/usr/bin/env node
/**
 * What each subagent is costing, from the session transcripts on disk.
 *
 *   node src/tools/agentstats.mjs                  # agents active in the last 15 min
 *   node src/tools/agentstats.mjs --all            # every agent this session ever ran
 *   node src/tools/agentstats.mjs --session 51c0b82c
 *   node src/tools/agentstats.mjs --since 1h       # percentiles over recent turns only
 *   node src/tools/agentstats.mjs --json
 *
 * Dispatching agents is cheap and watching them is not: `ps` shows a node
 * process, the harness shows a spinner, and neither tells you whether an agent
 * is thinking, blocked, or quietly spending four minutes a turn. This reads the
 * JSONL the harness already writes and reports, per agent:
 *
 *   turns   assistant messages so far
 *   ctx     tokens in its last request (cache read + cache creation)
 *   p50/p90 model wait: assistant timestamp minus the tool_result before it,
 *           so tool execution time is excluded -- this is the model alone
 *   imgMB   screenshots carried in its context, the usual reason a transcript
 *           is 30 MB (a 1600x900 PNG is ~2.5 MB and agents read 20+ of them)
 *   last    most recent tool call, and how long ago
 *
 * A row whose `last` is minutes old with no result is genuinely stuck -- one
 * agent sat 94 minutes inside a single `git reset --hard` and nothing else
 * showed it. A row with a healthy `last` and a p90 in the hundreds of seconds
 * is not stuck, it is expensive, and that is the one worth retiring.
 *
 * Metadata only. This never prints transcript content, and it streams every
 * file line by line because they run 20-32 MB and reading one whole would cost
 * more context than the answer is worth.
 */
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Agents run in worktrees, but their transcripts live under the *coordinator's*
 * project directory. A worktree's `.git` is a file pointing back at the real
 * repo, so follow it rather than reporting nothing when run from inside one.
 */
function mainRepo(dir: any) {
  const dotgit = path.join(dir, '.git');
  if (!existsSync(dotgit) || statSync(dotgit).isDirectory()) return dir;
  const m = /gitdir:\s*(.+)/.exec(readFileSync(dotgit, 'utf8'));
  const i = m ? m[1].indexOf('/.git/worktrees/') : -1;
  return i === -1 ? dir : m![1].slice(0, i);
}

const ROOT = mainRepo(HERE);
const PROJECTS = path.join(homedir(), '.claude', 'projects', ROOT.replace(/\//g, '-'));

const args = process.argv.slice(2);
const flag = (name: any) => args.includes(name);
const val = (name: any) => (args.indexOf(name) === -1 ? null : args[args.indexOf(name) + 1]);

const DURATION = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
const parseDur = (s: any) => {
  const m = /^(\d+)([smhd])$/.exec(s || '');
  return m ? Number(m[1]) * DURATION[m[2] as keyof typeof DURATION] : null;
};

/**
 * Which session to report on. Default is the one with the most subagents alive
 * right now -- not simply the newest, because the session you run this *from*
 * is always the newest and is never the one you are asking about.
 */
async function pickSession() {
  const want = val('--session');
  let entries;
  try { entries = await readdir(PROJECTS); } catch {
    console.error(`no transcripts for this repo at ${PROJECTS}`);
    process.exit(1);
  }
  const ids = entries.filter((e) => e.endsWith('.jsonl')).map((e) => e.slice(0, -6));
  const matches = want ? ids.filter((id) => id.startsWith(want)) : ids;
  if (!matches.length) {
    console.error(want ? `no session matching ${want}` : 'no sessions on disk');
    process.exit(1);
  }
  if (matches.length === 1) return matches[0];

  const ranked = await Promise.all(matches.map(async (id) => {
    let live = 0;
    let mtime = 0;
    try { mtime = (await stat(path.join(PROJECTS, `${id}.jsonl`))).mtimeMs; } catch { /* gone */ }
    try {
      const dir = path.join(PROJECTS, id, 'subagents');
      for (const f of await readdir(dir)) {
        if (!f.startsWith('agent-')) continue;
        const { mtimeMs } = await stat(path.join(dir, f));
        if (Date.now() - mtimeMs < 15 * 60_000) live++;
      }
    } catch { /* no subagents */ }
    return { id, live, mtime };
  }));
  ranked.sort((a, b) => b.live - a.live || b.mtime - a.mtime);
  return ranked[0].id;
}

// `message` is serialised before `type` on assistant records, so a plain search
// for the first "type" finds the API message's own `"type":"message"`. These two
// values only ever appear at the top level: nested blocks use "text", "tool_use",
// "tool_result", "image", "thinking", and the roles inside `message` are "role".
const reType = /"type":"(assistant|user)"/;
const reStamp = /"timestamp":"([^"]+)"/;
const reImage = /"data":"[A-Za-z0-9+/=]{1000,}"/g;

/**
 * The transcript's own `gitBranch` field is not the agent's branch -- it tracks
 * whichever checkout the harness looked at when the record was written, so a
 * single agent's transcript carries four different values. The worktree's HEAD
 * is the real answer, and the agent id names the worktree.
 */
function branchOf(worktree: any) {
  const head = worktree === null
    ? path.join(ROOT, '.git', 'HEAD')
    : path.join(ROOT, '.git', 'worktrees', worktree, 'HEAD');
  try {
    return readFileSync(head, 'utf8').trim().replace(/^ref:\s*refs\/heads\//, '');
  } catch { return ''; }
}

/** One pass over one transcript. Nothing but the line currently in hand is held. */
async function scan(file: any, since: any) {
  const st: {
    turns: number, first: number, last: number, ctx: number, imgBytes: number,
    waits: number[],
    /** The last tool call seen, for the "what is it doing now" column. */
    lastTool: { at: number, name: string, detail: string } | null,
    pending: string | null,
  } = { turns: 0, first: 0, last: 0, ctx: 0, imgBytes: 0, waits: [], lastTool: null, pending: null };
  let resultAt = 0;
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    const type = reType.exec(line)?.[1];
    const ts = Date.parse(reStamp.exec(line)?.[1] ?? '');
    if (!type || Number.isNaN(ts)) continue;
    if (!st.first) st.first = ts;
    st.last = Math.max(st.last, ts);

    // Big lines are tool results carrying screenshots. Measure them, don't parse them.
    if (line.length > 65536) {
      for (const m of line.matchAll(reImage)) st.imgBytes += m[0].length;
    }

    if (type === 'assistant') {
      st.turns++;
      if (resultAt && ts > resultAt && (!since || ts >= since)) {
        const dt = (ts - resultAt) / 1000;
        if (dt < 1800) st.waits.push(dt);   // longer than that is a human pause, not a turn
      }
      resultAt = 0;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      const usage = rec.message?.usage;
      if (usage) {
        st.ctx = (usage.cache_read_input_tokens ?? 0)
          + (usage.cache_creation_input_tokens ?? 0)
          + (usage.input_tokens ?? 0);
      }
      for (const b of rec.message?.content ?? []) {
        if (b?.type !== 'tool_use') continue;
        const detail = b.name === 'Bash'
          ? String(b.input?.command ?? '').trim().split('\n')[0]
          : path.basename(String(b.input?.file_path ?? b.input?.pattern ?? ''));
        st.lastTool = { at: ts, name: b.name, detail };
        st.pending = b.id;
      }
    } else if (type === 'user' && line.includes('"tool_result"')) {
      resultAt = ts;
      st.pending = null;
    }
  }
  return st;
}

const fmtAge = (ms: any) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
};
const pct = (v: any, p: any) => (v.length ? v.slice().sort((a: any, b: any) => a - b)[Math.min(v.length - 1, Math.floor(v.length * p))] : 0);
const fmtSec = (s: any) => (s ? `${Math.round(s)}s` : '-');
const fmtTok = (t: any) => (t >= 1000 ? `${Math.round(t / 1000)}k` : String(t));

async function main() {
  const session = await pickSession();
  const dir = path.join(PROJECTS, session, 'subagents');
  const since = parseDur(val('--since')) ? Date.now() - parseDur(val('--since'))! : null;

  let files: any[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'));
  } catch { /* a session with no subagents is a normal state, not an error */ }

  const rows = [];
  for (const f of files) {
    const agent = f.slice(6, -6);
    const st = await scan(path.join(dir, f), since);
    if (st.turns) rows.push({ agent, branch: branchOf(`agent-${agent}`), ...st });
  }
  // The coordinator is a row too -- it is usually the largest context in the session.
  const mainStats = await scan(path.join(PROJECTS, `${session}.jsonl`), since);
  if (mainStats.turns) rows.push({ agent: 'coordinator', branch: branchOf(null), ...mainStats });

  const now = Date.now();
  const live = flag('--all') ? rows : rows.filter((r) => now - r.last < 15 * 60_000);
  live.sort((a, b) => b.last - a.last);

  if (flag('--json')) {
    console.log(JSON.stringify(live.map((r) => ({
      agent: r.agent, branch: r.branch, ageMs: r.last - r.first, turns: r.turns, ctx: r.ctx,
      p50: Math.round(pct(r.waits, 0.5)), p90: Math.round(pct(r.waits, 0.9)),
      imgMB: +(r.imgBytes / 1e6).toFixed(1), idleMs: now - r.last,
      lastTool: r.lastTool && { name: r.lastTool.name, agoMs: now - r.lastTool.at },
      stalled: Boolean(r.pending) && now - r.last > 5 * 60_000,
    })), null, 1));
    return;
  }

  console.log(`session ${session}  ${live.length} agent(s)${flag('--all') ? '' : ' active in the last 15 min'}`
    + `${since ? `  (percentiles over --since ${val('--since')})` : ''}`);
  if (!live.length) { console.log('  none -- try --all'); return; }
  console.log('agent        branch          age    turns   ctx   p50    p90   imgMB  last tool');
  for (const r of live) {
    const t = r.lastTool;
    const stalled = r.pending && now - r.last > 5 * 60_000;
    const last = t
      ? `${t.name} ${t.detail}`.slice(0, 34) + ` (${fmtAge(now - t.at)}${stalled ? ', no result yet' : ''})`
      : '-';
    console.log(
      `${r.agent.slice(0, 12).padEnd(12)} ${(r.branch || '-').replace(/^agent\//, '').slice(0, 14).padEnd(14)} `
      + `${fmtAge(r.last - r.first).padStart(6)} ${String(r.turns).padStart(5)} `
      + `${fmtTok(r.ctx).padStart(5)} ${fmtSec(pct(r.waits, 0.5)).padStart(5)} `
      + `${fmtSec(pct(r.waits, 0.9)).padStart(6)} ${(r.imgBytes / 1e6).toFixed(1).padStart(6)}  ${last}`
    );
  }
}

await main();
