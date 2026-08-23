#!/usr/bin/env bash
# PreToolUse(Bash) guard — force the shared-index-safe git workflow.
#
# Why: this repo is worked by MULTIPLE concurrent agents, and the harness plan's
# Decision 1 (LOCKED, docs/plans/2026-08-21-opus-harness-daemon.md) drops
# worktrees for a single trunk — at which point they all share ONE git index.
# Anything that snapshots that shared index — `git add -A/./-u`, `git commit -am`,
# or a BARE `git commit` — sweeps a co-agent's in-flight staged work into the
# wrong commit. The only safe shape is a pathspec commit:
# `git commit -m "..." -- path/a path/b`, with `git add` reserved for NEW files.
#
# That plan is explicit that Decision 1 without this guard is strictly worse than
# worktrees: "one `git add -A` sweeps four agents' staged work". This is the
# guard, landed ahead of the substrate that needs it.
#
# Contract: reads the PreToolUse JSON on stdin, inspects .tool_input.command,
# exits 2 (blocking) with a stderr explanation, else 0 (allow).
#
# BLOCKS: git add -A/./-u/--all; git add of an already-TRACKED file (edits don't
# need staging); git commit -a/-am; and a bare `git commit` lacking an explicit
# `-- <pathspec>` (checked only within the commit segment, quotes stripped, so a
# `--` in a sibling command or in the message does not false-allow).
# PASSES: pathspec commits, `git add <new-file>`, directories and globs (they may
# hold new files), `--amend`, mid-merge, and every read-only verb.
# Escape: SKIP_SWEEPGUARD=1.
#
# Ported from ../../games/kami-kakushi, whose header cites two commits where the
# unguarded version swept a co-agent's staged work (f84aff9, 0e10d96) and whose
# regex hardening notes are worth keeping — they are all bug-fix history.
# Dropped on the way over: that repo's ledger file and its HERDR_PANE_ID field.
# Added on the way over: the linked-worktree bail below.

set -euo pipefail

cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[ -z "$cmd" ] && exit 0

# A linked worktree has its own index, so none of this applies there. Agents
# dispatched into worktrees are the common case today and must not be made to
# fight a guard against a hazard they cannot hit. `git rev-parse --git-dir`
# answers `.git` in the main checkout and `…/.git/worktrees/<name>` in a linked
# one; `--git-common-dir` differing from `--git-dir` is the robust test.
gd="$(git rev-parse --git-dir 2>/dev/null || true)"
gcd="$(git rev-parse --git-common-dir 2>/dev/null || true)"
[ -n "$gd" ] && [ -n "$gcd" ] && [ "$gd" != "$gcd" ] && exit 0

# The deliberate escape, and its LEDGER.
#
# Rare by construction: it has to be typed into the command itself, so it shows
# up in the transcript next to what it allowed. But a transcript is per-session
# and nobody reads someone else's, so kami-kakushi appends every bypass to a
# committed file instead -- the harness plan asks for the same here. A bypass
# then arrives as a line in a diff, where a reviewer sees it, rather than being
# buried in a transcript nobody will open.
#
# The ledger is append-only and deliberately dumb: date, cwd, and the command.
# It is not a policy engine. Its whole job is to make the count visible, because
# "we only skip the guard when we have to" and "we skip the guard eleven times a
# day" look identical until somebody writes them down.
if printf '%s' "$cmd" | grep -qE '(^|[;&|])[[:space:]]*([A-Za-z_][A-Za-z_0-9]*=[^[:space:]]*[[:space:]]+)*SKIP_SWEEPGUARD=1[[:space:]]'; then
  ledger="${CLAUDE_PROJECT_DIR:-.}/project/sweepguard-ledger.md"
  if [ -w "$(dirname "$ledger")" ]; then
    [ -f "$ledger" ] || printf '%s\n' \
      '# Sweepguard bypasses' '' \
      'Every `SKIP_SWEEPGUARD=1` lands here, appended by' \
      '`.claude/hooks/guard-git-add-all.sh`. A bypass in a diff is a bypass' \
      'somebody sees; a bypass in a transcript is not. If this file is growing,' \
      'the guard has a missing case — fix the guard, not the habit.' '' > "$ledger"
    printf -- '- %s  `%s`  %s\n' "$(date -u +%Y-%m-%dT%H:%MZ)" "$(basename "$PWD")" \
      "$(printf '%s' "$cmd" | tr '\n' ' ' | cut -c1-160)" >> "$ledger"
  fi
  exit 0
fi

deny() {
  cat >&2 <<EOF
BLOCKED by .claude/hooks/guard-git-add-all.sh: "$1"

Concurrent agents share this checkout's git index. The safe workflow:

  • Editing a tracked file → DON'T stage it; commit it directly (pathspec form
    commits the working-tree copy, ignoring the shared index):
        git commit -m "..." -- path/to/file
  • Adding a NEW (untracked) file → stage just that file, then pathspec-commit:
        git add path/to/new-file
        git commit -m "..." -- path/to/new-file

Never: git add -A / . / -u, git commit -a, or a bare 'git commit' — they
snapshot the SHARED index and sweep a co-agent's staged work into your commit.
Deliberate, rare escape: SKIP_SWEEPGUARD=1.
EOF
  exit 2
}

deny_commit() {
  cat >&2 <<EOF
BLOCKED by .claude/hooks/guard-git-add-all.sh: bare 'git commit' (no ' -- <pathspec>')

A bare commit snapshots the shared index — sweeping whatever a co-agent staged
between your 'git add' and now. Commit with an explicit pathspec instead:

    git add path/a path/b          # new files only; edits don't even need it
    git commit -m "..." -- path/a path/b

The pathspec form commits ONLY those paths (git's --only semantics: a temporary
index from HEAD + the named paths) and leaves co-agents' staged work untouched.
Escapes: '--amend' passes; a merge-in-progress passes (git forbids pathspec
commits mid-merge); SKIP_SWEEPGUARD=1 for a deliberate whole-index commit.
EOF
  exit 2
}

# A command boundary: start-of-string or after ; | & (handles && and |, too).
B='(^|[;&|])[[:space:]]*'

# git add -A  /  git add --all  /  combined short flags containing A (e.g. -Av)
if printf '%s' "$cmd" | grep -qE "${B}git[[:space:]]+add[[:space:]]+([^;&|]*[[:space:]])?(-A|--all|-[A-Za-z]*A[A-Za-z]*)([[:space:]]|$)"; then
  deny "git add -A / --all"
fi

# git add .   /  git add -- .   /  git add :/   (stage the whole tree)
if printf '%s' "$cmd" | grep -qE "${B}git[[:space:]]+add[[:space:]]+([^;&|]*[[:space:]])?(\.|:/)([[:space:]]|$)"; then
  deny "git add . (whole-tree staging)"
fi

# git add -u / --update  (stages ALL tracked modifications — broad, like -A).
if printf '%s' "$cmd" | grep -qE "${B}git[[:space:]]+add[[:space:]]+([^;&|]*[[:space:]])?(-u|--update|-[A-Za-z]*u[A-Za-z]*)([[:space:]]|$)"; then
  deny "git add -u / --update (stages all tracked edits)"
fi

# git add of an already-TRACKED file — edits don't need staging; commit them
# directly with `git commit -- <path>` (pathspec form uses the working tree).
# Only NEW/untracked files actually need `git add`, so those pass. Directories
# and globs are DELIBERATELY allowed: they may include new files, and there is no
# way to classify them without crying wolf. We block only a concrete path token
# that git already tracks.
add_seg="$(printf '%s' "$cmd" | grep -oE "${B}git[[:space:]]+add[^;&|]*" | head -1 || true)"
if [ -n "$add_seg" ]; then
  rest="${add_seg#*add}"                       # drop the leading 'git add'
  rest="${rest//\"/}"; rest="${rest//\'/}"     # strip quotes (naive; rare spaced paths)
  read -ra _toks <<< "$rest"
  for tok in "${_toks[@]}"; do
    case "$tok" in -*) continue ;; esac         # a flag, not a path
    [ -d "$tok" ] && continue                   # a directory (may hold new files)
    case "$tok" in *[\*\?\[]*) continue ;; esac # a glob (may match new files)
    if git ls-files --error-unmatch -- "$tok" >/dev/null 2>&1; then
      deny "git add of tracked file '$tok' — edits don't need staging; commit it directly: git commit -m \"...\" -- $tok"
    fi
  done
fi

# git commit -a / -am / --all  (stages all tracked modifications). Allow -m, --amend.
if printf '%s' "$cmd" | grep -qE "${B}git[[:space:]]+commit[[:space:]]+([^;&|]*[[:space:]])?(--all|-[A-Za-z]*a[A-Za-z]*)([[:space:]]|$)"; then
  deny "git commit -a / -am / --all"
fi

# git commit WITHOUT an explicit ' -- <pathspec>'.
#
# Detection hardening, all of it earned in the source repo:
#  · the ' -- ' must live INSIDE the `git commit` segment, not anywhere in the
#    compound command — a whole-command check let `git diff -- path && git commit
#    -m "..."` (bare) straight through.
#  · FLATTEN newlines to spaces FIRST. A multi-line `-m "…"` made a per-line grep
#    capture only the message's first line and miss the trailing pathspec, which
#    false-BLOCKED three times in one session.
#  · Strip quoted strings before isolating the segment, so a ';', '&' or '|'
#    inside the message cannot truncate it.
cmd_flat="$(printf '%s' "$cmd" | tr '\n' ' ')"
if printf '%s' "$cmd_flat" | grep -qE "${B}git[[:space:]]+commit([[:space:]]|$)" \
  && ! printf '%s' "$cmd_flat" | grep -q 'SKIP_SWEEPGUARD=1' \
  && ! printf '%s' "$cmd_flat" | grep -qE "${B}git[[:space:]]+commit[^;&|]*--amend" \
  && ! [ -e .git/MERGE_HEAD ]; then
  # Tokenise properly rather than stripping quotes with a regex, and strip the
  # message body before tokenising at all.
  #
  # The sed pair this replaces treated every apostrophe as an opening quote, so
  # a message containing "the plan's" shifted the rest of the command inside a
  # phantom quoted string and the real trailing ' -- <pathspec>' vanished with
  # it. Tokenising alone was not enough either: a message delivered through
  # `-m "$(cat <<'EOF' … EOF)"` carries arbitrary quotes of its own, which
  # unbalance the outer ones just as badly. So the message is removed first —
  # command substitutions and heredoc bodies both — and only the command's real
  # argv is tokenised. Failure to parse blocks rather than passes.
  if command -v python3 >/dev/null 2>&1; then
    if ! CMD="$cmd" python3 -c '
import os, re, shlex, sys

cmd = os.environ["CMD"]

def strip_subs(t):
    """Remove $( … ) and ` … ` regions, paren-balanced, so a message body
    cannot contribute quotes or a stray -- to the token stream."""
    out, i, n = [], 0, len(t)
    while i < n:
        if t.startswith("$(", i):
            depth, i = 1, i + 2
            while i < n and depth:
                if t[i] == "(": depth += 1
                elif t[i] == ")": depth -= 1
                i += 1
            out.append(" ")
        elif t[i] == "`":
            i += 1
            while i < n and t[i] != "`":
                i += 1
            i += 1
            out.append(" ")
        else:
            out.append(t[i]); i += 1
    return "".join(out)

def strip_heredocs(t):
    """Drop `<<EOF … EOF` bodies, which are message text, not argv."""
    lines, out, delim = t.split("\n"), [], None
    for line in lines:
        if delim is not None:
            if line.strip() == delim:
                delim = None
            continue
        m = re.search(r"<<-?\s*([\x27\"]?)(\w+)\1", line)
        out.append(re.sub(r"<<-?\s*[\x27\"]?\w+[\x27\"]?", " ", line) if m else line)
        if m:
            delim = m.group(2)
    return "\n".join(out)

try:
    toks = shlex.split(strip_subs(strip_heredocs(cmd)), posix=True)
except ValueError:
    sys.exit(1)            # unparseable: block, never silently pass

BREAK = {";", "&&", "||", "|", "&"}
i = 0
while i < len(toks) - 1:
    if toks[i] == "git" and toks[i + 1] == "commit":
        j, ok = i + 2, False
        while j < len(toks) and toks[j] not in BREAK:
            if toks[j] == "--":
                ok = True
            j += 1
        if not ok:
            sys.exit(1)
        i = j
    else:
        i += 1
sys.exit(0)
'; then
      deny_commit
    fi
  else
    # No python3: fall back to the regex form, which is stricter than it should
    # be but never looser. SKIP_SWEEPGUARD=1 covers its false blocks.
    stripped="$(printf '%s' "$cmd_flat" | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")"
    commit_seg="$(printf '%s' "$stripped" | grep -oE "git[[:space:]]+commit[^;&|]*" | head -1 || true)"
    if ! printf '%s' "$commit_seg" | grep -qE '[[:space:]]--([[:space:]]|$)'; then
      deny_commit
    fi
  fi
fi

exit 0
