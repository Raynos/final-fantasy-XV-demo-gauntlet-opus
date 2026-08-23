#!/usr/bin/env bash
# Session brief — the state a cold agent needs, printed rather than hoped for.
#
# Wired to `SessionStart` in `.claude/settings.json`. Pure read, no side effects,
# under two seconds. It exists because this repo carries about a thousand lines
# of state across STATUS, HANDOFF, LANDMINES, TODO and the plans, and a cold
# agent only reads any of it if it thinks to. Cold pickup should not depend on
# an agent's curiosity.
#
# Deliberately *not* copied from the version this is lifted from: that one makes
# a socket call, scans an inbox, and shouts MUST-RELAY-VERBATIM at the model
# because agents kept dropping a line. That is a prose fix for a prose problem.
# This prints facts and stops.

set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

echo "=== project brief ==="

# The human's queue. We never tick these; only the human does.
if [ -f project/TODO.md ]; then
  todo="$(grep -E '^\s*-\s' project/TODO.md | grep -v '^\s*-\s*\[x\]' | head -8 || true)"
  [ -n "$todo" ] && { echo; echo "-- project/TODO.md (human-written; agents never edit it)"; echo "$todo"; }
fi

# Open plans, by their own Status token. DONE and SUPERSEDED graduate to
# project/archive/, so anything still here should be open — but read the token
# rather than trusting the directory, because that is the failure this catches.
if [ -d docs/plans ]; then
  echo; echo "-- open plans (docs/plans/)"
  for f in docs/plans/*.md; do
    case "$f" in */README.md) continue ;; esac
    tok="$(grep -m1 '^Status:' "$f" 2>/dev/null | sed -E 's/^Status:[[:space:]]*([A-Z-]+).*/\1/' || true)"
    case "$tok" in DONE|SUPERSEDED|'') continue ;; esac
    printf '   %-12s %s\n' "$tok" "$(basename "$f")"
  done
fi

# Who owns what right now. The table is the first thing in STATUS after the
# preamble, and reading a dirty `git status` as your own is the mistake it
# prevents.
if [ -f project/STATUS.md ]; then
  echo; echo "-- ownership (project/STATUS.md)"
  sed -n '/^## Live right now/,/^## /p' project/STATUS.md | sed '$d' | head -14
fi

echo; echo "-- last 5 commits"
git log --oneline -5 2>/dev/null || true

echo
echo "Read BRIEF.md before writing code, project/LANDMINES.md before believing"
echo "a diagnosis, and project/README.md before adding a file to project/."
