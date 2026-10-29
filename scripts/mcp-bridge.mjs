// stdio <-> streamable HTTP bridge, so Claude Desktop (stdio only for local servers) can use Quack's /mcp.
// Node stdlib only, instead of running a third-party npm package (mcp-remote) on every launch.
// Usage (Claude Desktop config): node scripts/mcp-bridge.mjs [url]   default http://localhost:8765/mcp
// ponytail: request/response only, no server-initiated GET stream; Quack's tools never push notifications.
import { createInterface } from 'node:readline';

const url = process.argv[2] ?? 'http://localhost:8765/mcp';
let session;   // Mcp-Session-Id from the server
let initLine;  // the client's initialize request, replayed when Quack restarts and forgets the session

const write = msg => process.stdout.write(JSON.stringify(msg) + '\n');

function post(body) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(session && { 'Mcp-Session-Id': session }),
    },
    body,
  });
}

// A response is either plain JSON or SSE events whose data lines carry JSON-RPC messages.
async function relay(res) {
  const text = await res.text();
  if (!(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    if (text.trim()) write(JSON.parse(text));
    return;
  }
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (data) write(JSON.parse(data));
  }
}

async function forward(line) {
  let msg;
  try {
    msg = JSON.parse(line);  // a bad line must not kill the bridge
    if (msg.method === 'initialize') { initLine = line; session = undefined; }
    let res = await post(line);
    if (res.status === 404 && session && initLine) {  // Quack restarted: open a new session, then retry once
      session = undefined;
      const init = await post(initLine);
      session = init.headers.get('mcp-session-id') ?? undefined;
      await init.text();
      await (await post('{"jsonrpc":"2.0","method":"notifications/initialized"}')).text();
      console.error(`quack bridge: session expired, reconnected to ${url}`);
      res = await post(line);
    }
    session = res.headers.get('mcp-session-id') ?? session;
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    await relay(res);
  } catch (e) {
    console.error(`quack bridge: ${e.message}`);
    if (msg?.id !== undefined) {
      write({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `Quack is not reachable at ${url} (${e.message}). Start it with quack.bat.` } });
    }
  }
}

// One request at a time, in order: initialize must set the session before anything else goes out.
let queue = Promise.resolve();
createInterface({ input: process.stdin }).on('line', raw => {
  const line = raw.replace(/^﻿/, '').trim();
  if (line) queue = queue.then(() => forward(line));
});
