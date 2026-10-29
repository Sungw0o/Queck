// PreToolUse guard shared by Claude Code (.claude/settings.json) and Codex (.codex/hooks.json).
// Blocks shell commands that destroy the user's data or git history. Node, not bash: Codex runs
// Windows hooks without Git Bash on PATH. Reads the hook JSON on stdin; exit 2 = blocked, stderr goes to the agent.
// ponytail: regex on the raw JSON, so a command that merely mentions these strings (echo, grep) is blocked too.
let input = '';
for await (const chunk of process.stdin) input += chunk;

const rules = [
  [/compose[^"]*\sdown[^"]*\s(-v|--volumes)/, 'docker compose down -v deletes the data volume'],
  [/docker[^"]*\svolume\s+(rm|prune)/, 'docker volume rm/prune deletes the data volume'],
  [/git[^"]*\spush[^"]*\s(--force[a-z-]*|-f)([\s=]|\\?"|$)/, 'force push rewrites remote history'],
  [/git[^"]*\sreset[^"]*--hard/, 'git reset --hard discards work'],
  [/(drop|truncate)\s+(table|database|schema)/i, 'DROP/TRUNCATE wipes data'],
  [/delete\s+from\s+items\s*(;|\\?"|\\n|$)/i, 'DELETE without WHERE wipes every item'],
];

for (const [pattern, why] of rules) {
  if (pattern.test(input)) {
    console.error(`guard blocked: ${why} (see AGENTS.md 하지 말 것). Ask the user to run it themselves if it is really needed.`);
    process.exit(2);
  }
}
