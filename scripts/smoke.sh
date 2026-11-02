#!/usr/bin/env bash
# Smoke test a running Quack: REST CRUD, Korean search, 404, cascade delete, MCP tools.
# Creates [SMOKE] items and always deletes them, so it is safe on the real DB.
# Usage: bash scripts/smoke.sh [base_url]    (default http://localhost:8765)
# Bodies go through files: Git Bash on Windows mangles Korean in curl arguments.
set -euo pipefail
BASE=${1:-http://localhost:8765}
TMP=$(mktemp -d)
IDS=()
cleanup() {
  for id in "${IDS[@]}"; do curl -s -o /dev/null -X DELETE "$BASE/api/items/$id" || true; done
  rm -rf "$TMP"
}
trap cleanup EXIT

fail() { echo "FAIL $*" >&2; exit 1; }
ok() { echo "ok   $*"; }
# send METHOD PATH JSON -> response body
send() { printf '%s' "$3" > "$TMP/req.json"; curl -sf -X "$1" "$BASE$2" -H 'Content-Type: application/json' --data-binary @"$TMP/req.json"; }
id_of() { grep -o '"id":[0-9]*' <<<"$1" | head -1 | cut -d: -f2; }
status_of() { curl -s -o /dev/null -w '%{http_code}' "$BASE$1"; }

for i in $(seq 60); do
  curl -sf -o /dev/null "$BASE/api/items" && break
  [ "$i" = 60 ] && fail "no answer from $BASE/api/items"
  sleep 1
done

# Bundled guides must be available from the same app as the home page.
for guide in user-guide.md agent-guide.md; do
  curl -sf "$BASE/$guide" > "$TMP/$guide" || fail "$guide is unavailable"
  [ -s "$TMP/$guide" ] || fail "$guide is empty"
done
ok "bundled human and agent guides"

# REST
parent=$(send POST /api/items '{"kind":"page","title":"[SMOKE] 부모 문서","body":"토큰 재발급 절차"}')
pid=$(id_of "$parent"); IDS+=("$pid")
child=$(send POST /api/items "{\"kind\":\"page\",\"title\":\"[SMOKE] 하위\",\"parent_id\":$pid}")
cid=$(id_of "$child")
grep -q "\"parent_id\":$pid" <<<"$child" || fail "child page has no parent_id: $child"
ok "page + child page"

issue=$(send POST /api/items '{"kind":"issue","title":"[SMOKE] issue"}')
iid=$(id_of "$issue"); IDS+=("$iid")
grep -q '"status":"todo"' <<<"$issue" && grep -q '"prio":"mid"' <<<"$issue" || fail "issue defaults: $issue"
ok "issue defaults todo/mid"

patched=$(send PATCH "/api/items/$iid" '{"status":"doing","expected_revision":1}')
grep -q '"status":"doing"' <<<"$patched" && grep -q '"title":"\[SMOKE\] issue"' <<<"$patched" || fail "patch: $patched"
ok "patch changes only sent keys"

proj=$(send POST /api/items '{"kind":"issue","title":"[SMOKE] project issue","project":" Smoke-Proj "}')
jid=$(id_of "$proj"); IDS+=("$jid")
grep -q '"project":"smoke-proj"' <<<"$proj" || fail "project not normalized: $proj"
in_proj=$(curl -sf "$BASE/api/search?kind=issue&project=smoke-proj")
grep -q "\"id\":$jid" <<<"$in_proj" && ! grep -q "\"id\":$iid," <<<"$in_proj" || fail "project filter: $in_proj"
grep -q "\"id\":$jid" <<<"$(curl -sf "$BASE/api/search?kind=issue&project=other-proj")" && fail "other project returned $jid"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/items/$jid" -H 'Content-Type: application/json' -d '{"project":"a b","expected_revision":1}')" = 400 ] || fail "invalid project accepted"
cleared=$(send PATCH "/api/items/$jid" '{"project":"","expected_revision":1}')
grep -q '"project":""' <<<"$cleared" || fail "project not cleared: $cleared"
ok "project normalize, filter, validate, clear"

printf '재발급' > "$TMP/q.txt"
hits=$(cd "$TMP" && curl -sf -G "$BASE/api/search" --data-urlencode "q@q.txt")  # relative: Windows curl can't read /tmp paths here
grep -q "\"id\":$pid" <<<"$hits" || fail "korean search missed page $pid: $hits"
ok "korean search"

[ "$(status_of /api/items/2147483647)" = 404 ] || fail "missing item is not 404"
ok "404 on missing item"

curl -sf -o /dev/null -X DELETE "$BASE/api/items/$pid"
[ "$(status_of "/api/items/$cid")" = 404 ] || fail "child $cid survived parent delete"
ok "cascade delete"

# MCP: initialize -> session id -> initialized -> tools/list
mcp() {
  printf '%s' "$1" > "$TMP/mcp.json"
  curl -s -D "$TMP/headers" "$BASE/mcp" -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' ${SID:+-H "Mcp-Session-Id: $SID"} --data-binary @"$TMP/mcp.json"
}
SID=
mcp '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}' > /dev/null
SID=$(grep -i '^mcp-session-id:' "$TMP/headers" | cut -d' ' -f2 | tr -d '\r')
[ -n "$SID" ] || fail "MCP initialize returned no session id"
mcp '{"jsonrpc":"2.0","method":"notifications/initialized"}' > /dev/null
tools=$(mcp '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')
for t in search get create update ingest_source publish_wiki wiki_context history restore promote_issue; do grep -q "\"name\":\"$t\"" <<<"$tools" || fail "MCP tool $t missing: $tools"; done
[ "$(grep -o '"inputSchema"' <<<"$tools" | wc -l)" = 10 ] || fail "MCP should expose exactly 10 tools: $tools"
ok "MCP 10 tools"

prompts=$(mcp '{"jsonrpc":"2.0","id":3,"method":"prompts/list"}')
for p in organize_source import_notion github_retro; do grep -q "\"name\":\"$p\"" <<<"$prompts" || fail "MCP prompt $p missing: $prompts"; done
got=$(mcp '{"jsonrpc":"2.0","id":4,"method":"prompts/get","params":{"name":"github_retro","arguments":{"target":"octo/repo#7"}}}')
grep -q '"role":"user"' <<<"$got" && grep -q 'octo/repo#7' <<<"$got" && grep -q 'publish_wiki' <<<"$got" || fail "prompts/get github_retro: $got"
ok "MCP 3 prompts"

# Claude Desktop reaches the same tools through the stdio bridge
if command -v node > /dev/null; then
  node "$(dirname "$0")/rag-smoke.mjs" "$BASE"
  node "$(dirname "$0")/knowledge-smoke.mjs" "$BASE"
  node "$(dirname "$0")/rag-eval.mjs" "$BASE"
  printf '%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' > "$TMP/bridge.jsonl"
  bridged=$(node "$(dirname "$0")/mcp-bridge.mjs" "$BASE/mcp" < "$TMP/bridge.jsonl")
  [ "$(grep -o '"inputSchema"' <<<"$bridged" | wc -l)" = 10 ] || fail "stdio bridge tools/list: $bridged"
  ok "stdio bridge for Claude Desktop"
fi

echo "smoke passed"
