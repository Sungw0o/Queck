// Register Quack in Claude Desktop's MCP config: mcpServers.quack -> node mcp-bridge.mjs.
// Desktop rewrites this file from memory while it runs (it also stores preferences there),
// so this waits until Desktop is closed, then merges only mcpServers.quack and keeps a .bak.
// Usage: node scripts/register-desktop.mjs [config path] [--no-wait]   (quack desktop)
import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const noWait = args.includes('--no-wait');  // for testing against a copy
const bridge = join(dirname(fileURLToPath(import.meta.url)), 'mcp-bridge.mjs');

// MSIX installs keep data in %LOCALAPPDATA%\Claude-Data\claude_<id>\, the classic installer in %APPDATA%\Claude\.
function findConfig() {
  const dataDir = join(process.env.LOCALAPPDATA ?? '', 'Claude-Data');
  const msix = existsSync(dataDir)
    ? readdirSync(dataDir).filter(d => d.startsWith('claude_')).map(d => join(dataDir, d, 'claude_desktop_config.json'))
    : [];
  const classic = join(process.env.APPDATA ?? '', 'Claude', 'claude_desktop_config.json');
  return [...msix, classic].find(existsSync) ?? classic;
}

// Desktop's claude.exe, not the Claude Code CLI (also claude.exe, under ...\claude-code\).
function desktopRunning() {
  const n = execFileSync('powershell', ['-NoProfile', '-Command',
    "@(Get-Process claude -ErrorAction SilentlyContinue | Where-Object { $_.Path -notlike '*\\claude-code\\*' }).Count"]);
  return Number(String(n).trim()) > 0;
}

const path = args.find(a => !a.startsWith('--')) ?? findConfig();
console.log(`config: ${path}`);

if (!noWait && desktopRunning()) {
  console.log('Claude Desktop이 켜져 있습니다. 트레이 아이콘에서 [종료]로 완전히 꺼 주세요. 기다리는 중...');
  const until = Date.now() + 15 * 60_000;
  while (desktopRunning()) {
    if (Date.now() > until) { console.error('15분 안에 종료되지 않아 그만둡니다. 다시 실행하세요.'); process.exit(1); }
    await new Promise(r => setTimeout(r, 1000));
  }
}

const cfg = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
if (existsSync(path)) copyFileSync(path, path + '.bak');
cfg.mcpServers = { ...cfg.mcpServers, quack: { command: process.execPath, args: [bridge] } };
writeFileSync(path + '.tmp', JSON.stringify(cfg, null, 2));
renameSync(path + '.tmp', path);
console.log(`등록 완료: mcpServers.quack -> ${process.execPath} ${bridge}`);
console.log('이제 Claude Desktop을 다시 켜세요.');
