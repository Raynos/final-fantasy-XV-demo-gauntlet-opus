#!/usr/bin/env bash
# PreToolUse(Bash) guard — nothing in this repo needs to be polled any more.
#
# Phase B of docs/plans/2026-08-24-opus-benchmaxx-harness.md, and it ships
# SECOND on purpose. The 7-day audit (project/audits/2026-08-27-wallclock-7day.md)
# measured what happened when v1's ban was proposed without a replacement: the
# old poll bucket fell 764 -> 24 min while `until`-loops ROSE 143 -> 173 min
# against 3.7x less activity, ten-minute blocking `TaskOutput` calls appeared
# (234 min in one day, one coordinator), and `/health` polling grew 43 -> 61
# min. A ban alone moves the pattern to the next syntax.
#
# So the affordances landed first, and this guard names them in its own
# rejection text:
#
#   node src/tools/daemon.mts --wait quiet --for 600   # ONE blocking call
#   node src/tools/gitlock.mts commit -m "..." -- path # the index lock, queued
#   run_in_background: true                            # you are re-invoked
#
# That last one is the big one and it is not a syntax at all: background
# execution was used on **2.1%** of Bash calls across the week. A long tool run
# does not need a babysitter -- end the turn, and the completion re-invokes you.
# A blocking ten-minute `TaskOutput` is a poll loop wearing a tool costume.
#
# Contract: reads the PreToolUse JSON on stdin, inspects .tool_input.command,
# exits 2 (blocking) with a stderr explanation, else 0 (allow).
#
# Escape: CC_ALLOW_POLL=1, logged to ~/.cache/ffxv-harness/pollban.log with the
# command that used it. Every use so far has been a missing affordance; the log
# is what makes the next one findable rather than folklore.

set -euo pipefail

raw="$(jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[ -z "$raw" ] && exit 0

log_escape() {
  d="$HOME/.cache/ffxv-harness"
  mkdir -p "$d" 2>/dev/null || return 0
  printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(printf '%s' "$1" | tr '\n' ' ' | cut -c1-300)" \
    >> "$d/pollban.log" 2>/dev/null || true
}

# Strip heredoc BODIES before matching, for the same reason guard-harness.sh
# does: every long commit message here arrives through a heredoc, and a guard
# that fires on prose *about* polling is a guard that gets disabled. The
# opening line survives, so `until foo; do sleep 5; done <<EOF` is still caught.
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

# Strip MESSAGE ARGUMENTS too, for the same reason and one step further.
#
# Heredoc stripping is not enough here: this repo's commit messages are
# long-form and describe exactly the habits this guard bans, so `git commit -m
# "... until ...; do sleep ..."` is a sentence about a poll loop and gets
# blocked as one. That is not hypothetical -- it blocked the commit that added
# this file.
#
# Narrowed to the flags that carry prose on the commands that carry prose, so a
# genuine `bash -c "until ...; do sleep"` is still caught everywhere else.
case "$cmd" in
  *"git commit"*|*"git tag"*|*"gh pr"*|*"gh issue"*|*"git notes"*)
    cmd="$(printf '%s' "$cmd" | sed -E "s/(-m|--message|-b|--body|--body-file)[ =]+'[^']*'//g; s/(-m|--message|-b|--body|--body-file)[ =]+\"[^\"]*\"//g")"
    ;;
esac

# The escape, checked AFTER the heredoc strip and only in COMMAND POSITION.
#
# The first version matched `CC_ALLOW_POLL=1` anywhere in the raw command, which
# meant that writing *about* the escape -- a commit message, a doc patch, this
# comment -- exempted the whole command from the guard. That is a false allow
# rather than a false block, so it is quiet, which makes it worse. An env prefix
# only means anything at the start of a command, so that is where it is matched.
if printf '%s\n' "$cmd" | grep -Eq '(^|[;&|]|&&|\|\|)[[:space:]]*CC_ALLOW_POLL=1[[:space:]]'; then
  log_escape "$cmd"
  exit 0
fi

REPLACEMENTS="What to do instead — each of these EXISTS, and each replaces a whole loop:

  run_in_background: true          You are re-invoked when it exits. This is the
                                   answer for check/perf/longplay/drawcheck and
                                   for anything you would have babysat. It was
                                   used on 2.1% of Bash calls last week; that is
                                   the single biggest lever in this repo.

  node src/tools/daemon.mts --wait quiet --for 600
  node src/tools/daemon.mts --wait exclusive-free --for 600
  node src/tools/daemon.mts --wait idle --for 300
                                   One blocking call that returns the moment the
                                   condition holds, and prints WHY it is still
                                   waiting if it gives up. The poll happens
                                   inside the daemon, against local state.

  node src/tools/gitlock.mts commit -m \"...\" -- path/a path/b
                                   git's index lock has no queue; this one does.
                                   It waits with capped backoff and names the
                                   pid holding it. The 94-minute \`git reset\`
                                   and every \`[ -f .git/index.lock ]\` spin loop
                                   in the transcripts are the receipts.

  Every daemon-backed tool now prints  [harness] queued 12.3 s - ran 41.0 s
  so a slow call names its own reason. You do not need to poll /health to find
  out whether you are queued; the answer arrives with the result."

block() {
  echo "BLOCKED by .claude/hooks/guard-poll.sh: $1" >&2
  echo >&2
  echo "$2" >&2
  echo >&2
  echo "$REPLACEMENTS" >&2
  echo >&2
  echo "If this really is the case none of the above covers, prefix with CC_ALLOW_POLL=1" >&2
  echo "(it is logged to ~/.cache/ffxv-harness/pollban.log) and say why in your handoff." >&2
  exit 2
}

# --- 1. a loop whose body is a sleep ---------------------------------------
# `until ...; do ... sleep`, `while ...; do ... sleep`, `for i in $(seq ...); do
# ... sleep`. Matched across the whole command because these are written on one
# line as often as on five.
flat="$(printf '%s' "$cmd" | tr '\n' ' ')"
if printf '%s' "$flat" | grep -Eq '\b(until|while)\b.*\bdo\b.*\bsleep\b' \
  || printf '%s' "$flat" | grep -Eq '\bfor\b.*\bin\b.*\bseq\b.*\bdo\b.*\bsleep\b'; then
  block "a poll loop (a loop whose body sleeps)" \
"The audit found these on the newest day in its window:

    until grep -q 'gates passed' log; do sleep 20; done
    while [ ! -f tmp/draws-before.json ]; do sleep 15; done
    for i in \$(seq 1 60); do [ -f .git/index.lock ] || break; sleep 10; done
    until pnpm run typecheck >/dev/null 2>&1; do sleep 30; done

That last one re-runs the whole typecheck as its poll body. Together with
blocking TaskOutput calls and /health polls, this shape was ~468 minutes in
3.5 days — about a third of all tool wall-clock in that window."
fi

# --- 2. a bare sleep long enough to be a wait ------------------------------
# 60 s and up. Short sleeps are legitimate (letting a detached process write its
# first line, spacing two captures); a minute is somebody waiting for an event.
if printf '%s' "$flat" | grep -Eq '(^|[;&|] *)sleep +([6-9][0-9]|[0-9]{3,}|[0-9]+m|[0-9]+h)\b'; then
  block "a bare sleep of a minute or more" \
"A long sleep is a guess about how long something takes, and it is wrong in both
directions: too short and you poll again, too long and you burn the difference.
Nothing here needs to be timed by hand."
fi

# --- 3. a busy-wait ---------------------------------------------------------
if printf '%s' "$flat" | grep -Eq 'while *\( *Date\.now\(\)' \
  || printf '%s' "$flat" | grep -Eq 'while *\[ *! *-f' ; then
  block "a busy-wait" \
"The transcripts contain a literal \`node -e \"while(Date.now()<t);\"\` inside a
ten-iteration loop. That is a core spun at 100% to pass time on a box whose
whole harness design is about not wasting it."
fi

# --- 4. babysitting a process you started ----------------------------------
if printf '%s' "$flat" | grep -Eq '\b(pgrep|ps +-p|kill +-0)\b.*\bsleep\b'; then
  block "babysitting a background process" \
"You do not have to watch it. Start it with run_in_background and end the turn —
the completion re-invokes you with its output. A watcher loop costs a turn of
context every iteration and tells you nothing the exit notification will not."
fi

exit 0
