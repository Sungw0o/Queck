// Make this repo's MCP servers (Quack, Notion, GitHub) available in every project folder.
// Sources of truth stay in the repo: .mcp.json -> Claude Code user scope, .codex/config.toml -> ~/.codex/config.toml.
// Only adds missing servers; never overwrites or removes an existing entry. The guard hook stays project-only.
// Usage: node scripts/register-global.mjs [--dry-run]   (quack global)
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dry = process.argv.includes('--dry-run');
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const home = homedir();
const tag = dry ? '[미리보기] ' : '';

// Claude Code: user-scope servers live in ~/.claude.json; writes go through the CLI.
const servers = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8')).mcpServers;
const claudeJson = join(home, '.claude.json');
const userServers = existsSync(claudeJson) ? JSON.parse(readFileSync(claudeJson, 'utf8')).mcpServers ?? {} : {};
for (const [name, cfg] of Object.entries(servers)) {
  if (userServers[name]) { console.log(`Claude Code: ${name} 이미 있음, 건너뜀`); continue; }
  console.log(`${tag}Claude Code: ${name} 추가 -> ${cfg.url}`);
  // claude is an npm .cmd shim, so this goes through cmd: quote each header, keep ${VAR} literal for Claude to expand.
  const headers = Object.entries(cfg.headers ?? {}).map(([k, v]) => ` --header "${k}: ${v}"`).join('');
  // Run from home so the repo's project-scope .mcp.json is not in play.
  if (!dry) execFileSync(`claude mcp add --scope user --transport ${cfg.type} ${name} ${cfg.url}${headers}`, { cwd: home, stdio: 'inherit', shell: true });
}

// Codex: copy each [mcp_servers.<name>...] section whose server is missing from the global config.
const codexToml = join(home, '.codex', 'config.toml');
const global = existsSync(codexToml) ? readFileSync(codexToml, 'utf8') : '';
const sections = readFileSync(join(repo, '.codex', 'config.toml'), 'utf8').split(/^(?=\[)/m);
const missing = [...new Set(sections.map(s => s.match(/^\[mcp_servers\.([\w-]+)[\].]/)?.[1]).filter(Boolean))]
  .filter(name => !new RegExp(`^\\[mcp_servers\\.${name}\\]`, 'm').test(global));
for (const name of missing) console.log(`${tag}Codex: ${name} 추가`);
if (!missing.length) console.log('Codex: 추가할 서버 없음');
if (missing.length && !dry) {
  const add = sections.filter(s => missing.includes(s.match(/^\[mcp_servers\.([\w-]+)/)?.[1]))
    .map(s => s.replace(/(\n#[^\n]*)+\n*$/, '\n'));  // drop trailing comments that belong to the next repo section
  mkdirSync(dirname(codexToml), { recursive: true });
  if (global) copyFileSync(codexToml, codexToml + '.bak');
  writeFileSync(codexToml, global.replace(/\n*$/, '\n\n') + '# Added by quack global (from the Quack repo .codex/config.toml)\n' + add.join(''));
}

console.log(dry ? '바뀐 것 없음. 실제로 등록하려면 quack global' : '완료. Claude Code·Codex를 새로 열고 서버 사용을 승인하세요. Notion은 로그인, GitHub은 GITHUB_PAT가 필요합니다.');
