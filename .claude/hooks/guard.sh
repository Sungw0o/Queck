#!/usr/bin/env bash
# PreToolUse guard for Bash/PowerShell: block commands that destroy the user's data or git history.
# Reads the hook JSON on stdin and greps the raw text (no jq on this PC). Exit 2 = blocked, stderr goes to Claude.
# ponytail: regex on raw JSON, so a command that merely mentions these strings (grep, echo) is blocked too.
input=$(cat)
deny() { echo "guard.sh blocked: $1 (see AGENTS.md 하지 말 것). Ask the user to run it themselves if it is really needed." >&2; exit 2; }

grep -Eq 'compose[^"]*[[:space:]]down[^"]*[[:space:]](-v|--volumes)' <<<"$input" && deny "docker compose down -v deletes the data volume"
grep -Eq 'docker[^"]*[[:space:]]volume[[:space:]]+(rm|prune)' <<<"$input" && deny "docker volume rm/prune deletes the data volume"
grep -Eq 'git[^"]*[[:space:]]push[^"]*[[:space:]](--force[a-z-]*|-f)([[:space:]=]|\\?"|$)' <<<"$input" && deny "force push rewrites remote history"
grep -Eq 'git[^"]*[[:space:]]reset[^"]*--hard' <<<"$input" && deny "git reset --hard discards work"
grep -Eiq '(drop|truncate)[[:space:]]+(table|database|schema)' <<<"$input" && deny "DROP/TRUNCATE wipes data"
grep -Eiq 'delete[[:space:]]+from[[:space:]]+items[[:space:]]*(;|\\?"|\\n|$)' <<<"$input" && deny "DELETE without WHERE wipes every item"
exit 0
