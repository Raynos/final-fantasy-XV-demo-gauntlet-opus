#!/usr/bin/env bash
# PreToolUse(Bash) guard — the machine has ONE capture daemon, and it is shared.
#
# Phase 7 of project/archive/plans/2026-08-21-opus-harness-daemon.md. Every browser and
# every vite on this box now belongs to one daemon that serves every agent and
# OUTLIVES the session that started it. Three habits break that, all of them
# reasonable-looking in isolation and all of them expensive:
#
#   1. Starting a rival dev server (`vite`, `pnpm run dev`). It races the
#      daemon's build servers for ports and for node_modules/.vite, and a tool
#      that attaches to it photographs whatever tree it happens to serve --
#      which is the exact hour portowner.mts was written after.
#   2. Launching a browser outside the daemon. That is one more chromium the
#      budget cannot see, and the budget is what stops the GPU saturating: four
#      browsers deliver 1.5x the throughput of one, so an uncounted fifth costs
#      everybody and buys nobody anything.
#   3. Killing the daemon, or blanket-killing chromium. `pkill -f chromium` is
#      the reflex when a machine feels slow, and here it takes down four other
#      agents' work with it. game-scaffold ships a guard for exactly this.
#
# Contract: reads the PreToolUse JSON on stdin, inspects .tool_input.command,
# exits 2 (blocking) with a stderr explanation, else 0 (allow).
#
# Escape: SKIP_HARNESSGUARD=1, for the case the guard did not anticipate. Say
# in your handoff why you used it -- every use so far has been a missing case in
# this file, and the fix belongs here rather than in a habit.

set -euo pipefail

raw="$(jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[ -z "$raw" ] && exit 0
case "$raw" in *SKIP_HARNESSGUARD=1*) exit 0 ;; esac

# Strip heredoc BODIES before matching anything.
#
# Found the hard way, by this guard blocking the commit that added it: the
# commit message described the hazard ("blanket-killing chromium", `pkill -f
# chromium`) and the message is part of the command string. A guard that fires
# on prose about the guard is a guard that gets disabled -- and the class is
# general, since every long commit message here arrives through a heredoc.
#
# Only the body is dropped, never the command line that opened it, so
# `pkill -f chromium <<EOF` is still caught.
cmd="$(printf '%s\n' "$raw" | awk '
  BEGIN { skip = 0 }
  skip {
    line = $0
    gsub(/^[ \t]+|[ \t]+$/, "", line)
    if (line == marker) skip = 0
    next
  }
  {
    print
    if (match($0, /<<-?[ ]*[\x27"]?[A-Za-z_][A-Za-z0-9_]*[\x27"]?/)) {
      m = substr($0, RSTART, RLENGTH)
      gsub(/^<<-?[ ]*|[\x27"]/, "", m)
      marker = m
      skip = 1
    }
  }')"
[ -z "$cmd" ] && exit 0

block() {
  echo "BLOCKED by .claude/hooks/guard-harness.sh: $1" >&2
  echo >&2
  echo "$2" >&2
  echo >&2
  echo "Deliberate exception: prefix the command with SKIP_HARNESSGUARD=1, and say why in your handoff." >&2
  exit 2
}

# --- 1. a rival dev server -------------------------------------------------
# `vite build` and `vite preview` are fine; a dev server is not. `node
# src/tools/...` is fine however deeply it spawns vite -- that IS the daemon.
if printf '%s' "$cmd" | grep -Eq '(^|[;&|] *)(pnpm|npm|yarn) run dev( |$)' \
  || printf '%s' "$cmd" | grep -Eq '(^|[;&|] *)(pnpm exec |npx |\./)?(node_modules/\.bin/)?vite( +--[a-z-]+[= ][^ ]*)*( *$| +--port)'; then
  block "starting a dev server by hand" \
"The capture daemon owns every vite on this machine, one per build identity, on
ports it allocates itself. A hand-started server on 5173 is a second server that
tools may silently attach to -- and then every frame they capture is of whatever
tree that server happens to be rooted in.

  node src/tools/daemon.mts --health     # what is already running
  node src/tools/shoot.mts hero_full     # autostarts the daemon; needs no server
  node src/tools/identity.mts            # this repo's daemon port

If you want a browser to look at the game in, ask the daemon for the port:
  node -e \"import('./src/tools/harness.mts').then(async h => console.log((await h.buildServer()).port))\""
fi

# --- 2. a browser outside the daemon ---------------------------------------
if printf '%s' "$cmd" | grep -Eq 'chromium\.launch|playwright.*launch|chrome-headless-shell'; then
  block "launching a browser outside the daemon" \
"Every chromium on this box is one the daemon counted, and the budget of four is
measured, not guessed (project/journal/2026-08-23-harness-bench.md: the single
Metal GPU binds at 2.2 of 18 cores, and four browsers deliver 1.5x the
throughput of one). An uncounted fifth slows everybody and speeds up nobody.

  src/tools/harness.mts  withPage()       a real Playwright Page over CDP
                         withBlankPage()  a browser with no game in it
                         shots()          frames, no browser at all"
fi

# --- 3. killing the shared daemon, or every chromium ------------------------
if printf '%s' "$cmd" | grep -Eq '(pkill|killall)( +-[A-Za-z0-9]+)* +.*(chromium|chrome|Chrome)' \
  || printf '%s' "$cmd" | grep -Eq 'pkill +-f +.*(daemon\.mts|vite)'; then
  block "blanket-killing browsers or the shared daemon" \
"This is a shared box and the daemon outlives the session that started it, so a
blanket kill takes four other agents' work down with it -- and it will kill the
human's own Chrome too.

  node src/tools/cleanup.mts          # what is orphaned; the daemon's own are protected
  node src/tools/cleanup.mts --kill   # kill only what the daemon disclaims
  node src/tools/daemon.mts --stop    # if you really mean the daemon itself"
fi

exit 0
