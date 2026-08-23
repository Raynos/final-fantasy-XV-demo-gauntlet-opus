#!/usr/bin/env node
/**
 * Persist this session's transcripts somewhere the OS will not delete them.
 *
 *   node src/tools/sessionlog.mts                 # archive the current session
 *   node src/tools/sessionlog.mts --list          # what has been archived
 *
 * ### Why
 *
 * Main-session transcripts already survive: Claude Code keeps them under
 * `~/.claude/projects/<project>/<session>.jsonl`. **Subagent transcripts do
 * not.** They are written to the session scratchpad under `/private/tmp`, which
 * macOS clears on its own schedule and on reboot.
 *
 * That is not a theoretical loss. This project runs most of its work in
 * subagents — twenty-odd lanes in one night — and each one's transcript is the
 * only record of *how* it reached a conclusion: the four hypotheses it ablated
 * before the fifth was right, the measurement that overturned a handoff, the
 * number it decided not to trust. The commit messages carry the conclusions.
 * The transcripts carry the reasoning, and the reasoning is what you would want
 * for any bulk analysis of how these sessions actually go.
 *
 * It is also recoverable-loss-adjacent in the moment: stopping an agent makes
 * its transcript unresumable, so anything it had worked out and not yet written
 * down is gone. Archiving does not fix that, but it means the record of
 * everything up to that point survives.
 *
 * ### Where
 *
 * `~/.claude/session-archive/<project>/<session>/`, deliberately outside the
 * repo: 15 MB per session of JSONL has no business in git, and the archive is
 * cross-project by design so bulk analysis can read the lot.
 */
import { mkdir, readdir, copyFile, writeFile, stat, readFile } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
const ARCHIVE = path.join(HOME, '.claude', 'session-archive');

/** The scratchpad this session was given, and the session id inside it. */
function scratch(): { dir: string, session: string, project: string } | null {
  const sp = process.env.CLAUDE_SCRATCHPAD_DIR
    || process.env.CLAUDE_PROJECT_SCRATCHPAD
    || '';
  // The scratchpad path is `.../<project-slug>/<session-id>/scratchpad`.
  let base = sp ? path.dirname(sp) : '';

  // `CLAUDE_CODE_SESSION_ID` names *this* session, which beats guessing by
  // mtime: the newest directory under the project root is frequently a
  // different session that happened to be touched more recently, and archiving
  // the wrong one looks exactly like archiving the right one.
  const id = process.env.CLAUDE_CODE_SESSION_ID;
  if (!base && id) {
    const slug = process.cwd().replace(/\//g, '-');
    const guess = `/private/tmp/claude-${process.getuid?.() ?? 501}/${slug}/${id}`;
    if (existsSync(guess)) base = guess;
  }
  if (!base) {
    // Fall back to the newest session directory under this project's tmp root.
    // The layout is `/private/tmp/claude-<uid>/<project-slug>/<session-id>/`,
    // and the session id is a directory *inside* the slug — descending only to
    // the slug names the project as the session, which is the bug this comment
    // exists to stop someone reintroducing.
    const slug = process.cwd().replace(/\//g, '-');
    const root = `/private/tmp/claude-${process.getuid?.() ?? 501}/${slug}`;
    if (!existsSync(root)) return null;
    const kids = readdirSync(root)
      .map((d) => ({ d, full: path.join(root, d) }))
      .filter((k) => { try { return statSync(k.full).isDirectory(); } catch { return false; } })
      .sort((a, b) => statSync(b.full).mtimeMs - statSync(a.full).mtimeMs);
    if (!kids.length) return null;
    base = kids[0].full;
  }
  const session = path.basename(base);
  const project = path.basename(path.dirname(base));
  return { dir: base, session, project };
}

if (process.argv.includes('--list')) {
  if (!existsSync(ARCHIVE)) { console.log(`nothing archived yet (${ARCHIVE})`); process.exit(0); }
  for (const proj of (await readdir(ARCHIVE)).sort()) {
    const pdir = path.join(ARCHIVE, proj);
    const sessions = (await readdir(pdir)).sort();
    let bytes = 0, files = 0;
    for (const s of sessions) {
      for (const f of await readdir(path.join(pdir, s))) {
        const st = await stat(path.join(pdir, s, f));
        bytes += st.size; files += 1;
      }
    }
    console.log(`${proj}  ${sessions.length} session(s), ${files} files, ${(bytes / 1e6).toFixed(1)} MB`);
  }
  process.exit(0);
}

const s = scratch();
if (!s) { console.log('sessionlog: no session scratchpad found; nothing to archive.'); process.exit(0); }

const tasks = path.join(s.dir, 'tasks');
const out = path.join(ARCHIVE, s.project, s.session);
await mkdir(out, { recursive: true });

let copied = 0, bytes = 0;
const agents: { id: string, bytes: number, lines: number, firstPrompt: string }[] = [];
if (existsSync(tasks)) {
  for (const f of await readdir(tasks)) {
    if (!f.endsWith('.output')) continue;
    const src = path.join(tasks, f);
    const st = await stat(src);
    await copyFile(src, path.join(out, f));
    copied += 1; bytes += st.size;
    // A one-line summary per agent, so the index is readable without parsing
    // 15 MB of JSONL to find out which lane a file belongs to.
    let firstPrompt = '', lines = 0;
    try {
      const text = await readFile(src, 'utf8');
      lines = text.split('\n').length;
      const m = text.match(/"content":"([^"]{40,300})/);
      firstPrompt = m ? m[1].replace(/\\n/g, ' ').slice(0, 160) : '';
    } catch { /* a truncated transcript is still worth keeping */ }
    agents.push({ id: f.replace(/\.output$/, ''), bytes: st.size, lines, firstPrompt });
  }
}

// The main transcript is already durable; record where it is rather than
// duplicating 22 MB of it.
const projDir = path.join(HOME, '.claude', 'projects', s.project);
const mainCandidates = existsSync(projDir)
  ? (await readdir(projDir)).filter((f) => f.endsWith('.jsonl'))
  : [];

await writeFile(path.join(out, 'index.json'), JSON.stringify({
  project: s.project,
  session: s.session,
  archivedFrom: tasks,
  mainTranscriptDir: existsSync(projDir) ? projDir : null,
  mainTranscriptCount: mainCandidates.length,
  subagents: agents.sort((a, b) => b.bytes - a.bytes),
}, null, 2));

console.log(`sessionlog: archived ${copied} subagent transcript(s), ${(bytes / 1e6).toFixed(1)} MB`);
console.log(`  -> ${out}`);
if (!copied) console.log('  (no subagent transcripts in this session)');
console.log(`  main transcripts stay in ${projDir} and are already durable.`);
