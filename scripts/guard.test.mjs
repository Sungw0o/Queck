// Self-check for scripts/guard.mjs: node scripts/guard.test.mjs
// Feeds hook-shaped JSON (Claude: command string, Codex: command array) and checks block/pass.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const guard = fileURLToPath(new URL('./guard.mjs', import.meta.url));
const cases = {
  block: [
    'docker compose down -v', 'docker compose down --volumes', 'docker volume rm quack_pgdata',
    'git push --force', 'git push -f origin main', 'git push --force-with-lease', 'git push origin main --force',
    'git reset --hard HEAD~1', 'psql -c "DROP TABLE items"', 'TRUNCATE table items',
    'psql -c "DELETE FROM items"', 'DELETE FROM items;', ['bash', '-lc', 'git push --force origin main'],
  ],
  pass: [
    'docker compose down', 'docker compose up -d --build app', 'git push -u origin main', 'git push --follow-tags',
    'git reset --soft HEAD~1', 'psql -c "DELETE FROM items WHERE id = 3"', 'git status', 'docker compose logs -f app',
  ],
};

let failed = 0;
for (const [want, commands] of Object.entries(cases)) {
  for (const command of commands) {
    const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
    const got = spawnSync(process.execPath, [guard], { input }).status === 2 ? 'block' : 'pass';
    if (got !== want) { failed++; console.error(`FAIL want ${want}, got ${got}: ${JSON.stringify(command)}`); }
  }
}
console.log(failed ? `guard test: ${failed} failed` : 'guard test passed');
process.exit(failed ? 1 : 0);
