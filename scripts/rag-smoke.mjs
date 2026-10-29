// node scripts/rag-smoke.mjs [base_url] — temporary items are deleted even on failure.
import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://localhost:8765';
const ids = [];
const token = `인수인계검증${Date.now()}`;
async function rest(path, method = 'GET', body) {
  const r = await fetch(base + '/api/' + path, {
    method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(r.ok, `${method} ${path}: ${r.status}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

let session;
let rpcId = 0;
async function rpc(method, params, notification = false) {
  const r = await fetch(base + '/mcp', {
    method: 'POST', headers: {
      'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      ...(session ? { 'Mcp-Session-Id': session } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id: ++rpcId }), method, params }),
  });
  assert.ok(r.ok, `MCP ${method}: ${r.status}`);
  session = r.headers.get('mcp-session-id') || session;
  const raw = await r.text();
  if (notification) return;
  const message = r.headers.get('content-type')?.includes('text/event-stream')
    ? JSON.parse(raw.split(/\r?\n/).find(line => line.startsWith('data:')).slice(5)) : JSON.parse(raw);
  assert.ok(!message.error, JSON.stringify(message.error));
  return message.result;
}
async function call(name, args) {
  const result = await rpc('tools/call', { name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result));
  return JSON.parse(result.content.find(block => block.type === 'text').text);
}

try {
  const item = await rest('items', 'POST', { kind: 'issue', title: '[SMOKE] two documents', body: '사람용 짧은 요약' });
  ids.push(item.id);
  assert.equal(item.agent_body, '');
  let saved = await rest(`items/${item.id}`, 'PATCH', { agent_body: `## 다음 작업\n${token} 리터럴%_\\검색` });
  assert.equal(saved.body, item.body);
  let hits = await rest(`search?q=${encodeURIComponent(token)}&kind=issue`);
  const hit = hits.find(h => h.id === item.id);
  assert.ok(hit);
  assert.equal(hit.source, 'agent_body');
  assert.equal(hit.url, `#issue/${item.id}/agent`);
  assert.ok(hit.snippet.includes(token));
  hits = await rest(`search?q=${encodeURIComponent('리터럴%_\\검색')}`);
  assert.ok(hits.some(h => h.id === item.id));
  assert.deepEqual(await rest(`search?q=${encodeURIComponent(token)}&kind=page`), []);
  saved = await rest(`items/${item.id}`, 'PATCH', { body: '요약만 변경' });
  assert.ok(saved.agent_body.includes(token));
  saved = await rest(`items/${item.id}`, 'PATCH', { agent_body: null });
  assert.equal(saved.agent_body, '');
  assert.equal(saved.body, '요약만 변경');
  console.log('ok   REST independent documents, agent search/source/link, literal search, clear');

  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'rag-smoke', version: '1' } });
  await rpc('notifications/initialized', {}, true);
  const created = await call('create', { kind: 'issue', title: '[SMOKE] MCP handoff', body: 'MCP 요약', agentBody: token });
  ids.push(created.id);
  assert.equal(created.agentBody, token);
  const full = await call('get', { id: created.id });
  assert.equal(full.body, 'MCP 요약');
  assert.equal(full.agentBody, token);
  const found = await call('search', { query: token, kind: 'issue', limit: 1 });
  assert.equal(found.length, 1);
  assert.equal(found[0].id, created.id);
  assert.equal(found[0].source, 'agent_body');
  assert.equal(found[0].url, `#issue/${created.id}/agent`);
  const updated = await call('update', { id: created.id, agentBody: '## 검증 결과\n완료' });
  assert.equal(updated.body, 'MCP 요약');
  assert.equal(updated.agentBody, '## 검증 결과\n완료');
  const cleared = await call('update', { id: created.id, agentBody: '' });
  assert.equal(cleared.agentBody, '');
  assert.equal(cleared.body, 'MCP 요약');
  console.log('ok   MCP create -> search -> get -> update, camelCase documents, source citation');
} finally {
  const cleanup = await Promise.allSettled(ids.map(id => rest(`items/${id}`, 'DELETE')));
  for (const result of cleanup) {
    if (result.status === 'rejected') { console.error('Test item cleanup failed:', result.reason); process.exitCode = 1 }
  }
}
