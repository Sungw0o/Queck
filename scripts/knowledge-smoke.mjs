// Real REST/MCP integration checks. Only ids created by this run are deleted.
import assert from 'node:assert/strict';
const base = process.argv[2] || 'http://localhost:8765';
const ids = [], sources = [];
const token = `[SMOKE] wiki ${Date.now()}`;
async function request(path, method = 'GET', body, expected = 200) {
  const r = await fetch(base + '/api/' + path, {method, headers:{'Content-Type':'application/json'}, body:body === undefined ? undefined : JSON.stringify(body)});
  const text = await r.text(); assert.equal(r.status, expected, `${method} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}
const create = async body => {const i = await request('items','POST',body); ids.push(i.id); return i;};
let session, rpcId=0;
async function rpc(method, params, notify=false) {
  const r = await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(session?{'Mcp-Session-Id':session}:{})},body:JSON.stringify({jsonrpc:'2.0',...(notify?{}:{id:++rpcId}),method,params})});
  assert.ok(r.ok); session=r.headers.get('mcp-session-id')||session;
  const raw=await r.text(); if(notify)return;
  const msg=r.headers.get('content-type').includes('text/event-stream')?JSON.parse(raw.split(/\r?\n/).find(l=>l.startsWith('data:')).slice(5)):JSON.parse(raw);
  assert.ok(!msg.error,JSON.stringify(msg));return msg.result;
}
async function call(name,args,error=false){const r=await rpc('tools/call',{name,arguments:args});assert.equal(!!r.isError,error,JSON.stringify(r));return error?r:JSON.parse(r.content.find(b=>b.type==='text').text);}
try {
  let note=await create({kind:'page',title:token,body:'initial'});
  await request(`items/${note.id}`,'PATCH',{body:'missing'},428);
  await request(`items/${note.id}`,'PATCH',{title:42,expected_revision:1},400);
  await request(`items/${note.id}`,'PATCH',{body:'bad',expected_revision:1.5},400);
  const attempts=await Promise.all(['first','second'].map(body=>fetch(base+`/api/items/${note.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({body,expected_revision:1})})));
  assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
  note=await request(`items/${note.id}`);assert.equal(note.revision,2);
  let revisions=await request(`items/${note.id}/history`);assert.equal(revisions.length,2);assert.equal(revisions[1].body,'initial');
  note=await request(`items/${note.id}/restore`,'POST',{revision:1,expected_revision:2});assert.equal(note.body,'initial');assert.equal(note.revision,3);
  await request(`items/${note.id}/restore`,'POST',{revision:1,expected_revision:2},409);
  console.log('ok   concurrent writers, required revision, validation, history and safe restore');

  const original=await request('sources','POST',{title:token+' 원본',body:token+'\r\n원본 가이드',source_url:'https://example.com/'+Date.now()});
  let source=original.item;sources.push(source.id);
  const duplicate=await request('sources','POST',{title:'duplicate',body:token+'\n원본 가이드\n'});assert.equal(duplicate.item.id,source.id);assert.equal(duplicate.duplicate,true);
  await request('sources','POST',{title:'changed',body:'different',source_url:source.source_url},409);
  const publish={title:token+' 지식',body:`확인된 근거 [원본](#docs/${source.id})`,sources:[{id:source.id,revision:1}],related_ids:[note.id],summary:'원본에서 첫 정리'};
  let wiki=await request('wiki/publish','POST',publish);ids.push(wiki.id);assert.equal(wiki.needs_review,false);
  let links=await request(`items/${source.id}/links`);assert.ok(links.backlinks.some(l=>l.id===wiki.id));
  await request(`items/${source.id}`,'DELETE',undefined,409);
  source=await request(`items/${source.id}`,'PATCH',{body:token+'\n새 근거',expected_revision:1});
  assert.equal((await request(`items/${wiki.id}`)).needs_review,true);
  const before=(await request('wiki/log')).filter(e=>e.item_id===wiki.id).length;
  await request('wiki/publish','POST',{...publish,id:wiki.id,expected_revision:wiki.revision,body:'SHOULD ROLLBACK'},409);
  assert.equal((await request(`items/${wiki.id}`)).body,wiki.body);
  assert.equal((await request('wiki/log')).filter(e=>e.item_id===wiki.id).length,before);
  await request('wiki/publish','POST',{...publish,title:token+' failed atomic',sources:[{id:source.id,revision:2}],related_ids:[2147483647]},400);
  assert.ok(!(await request('items')).some(i=>i.title===token+' failed atomic'));
  wiki=await request('wiki/publish','POST',{...publish,id:wiki.id,expected_revision:wiki.revision,sources:[{id:source.id,revision:2}],summary:'새 원본 반영'});
  assert.equal(wiki.needs_review,false);
  wiki=await request(`items/${wiki.id}`,'PATCH',{expected_revision:wiki.revision,body:'[broken](#docs/2147483647)'});assert.equal(wiki.needs_review,true);
  const findings=await request('wiki/check');assert.ok(findings.some(f=>f.item_id===wiki.id&&f.type==='broken_link'));assert.ok(findings.some(f=>f.item_id===wiki.id&&f.type==='review'));
  console.log('ok   source dedup, URL collision, source retention, stale wiki, atomic publication, backlinks and checks');

  let issue=await create({kind:'issue',title:token+' issue',body:'verified result',agent_body:'agent evidence'});
  await request(`items/${issue.id}/knowledge`,'POST',{expected_revision:1},400);
  issue=await request(`items/${issue.id}`,'PATCH',{status:'done',expected_revision:1});
  const promoted=await request(`items/${issue.id}/knowledge`,'POST',{expected_revision:2});ids.push(promoted.id);
  links=await request(`items/${promoted.id}/links`);sources.push(...links.outgoing.filter(l=>l.relation==='source').map(l=>l.id));
  assert.equal((await request(`items/${issue.id}/knowledge`,'POST',{expected_revision:2})).id,promoted.id);
  assert.ok(promoted.body.includes('agent evidence'));
  const imported=await request('markdown/import','POST',{markdown:'# '+token+' imported\n\ntext'});ids.push(imported.id);assert.equal(imported.page_type,'note');
  const md=await fetch(base+`/api/items/${issue.id}/export`);assert.ok((await md.text()).includes('agent evidence'));
  const zip=await fetch(base+'/api/export');assert.equal(Buffer.from(await zip.arrayBuffer()).subarray(0,2).toString(),'PK');
  console.log('ok   done issue snapshot, idempotent promotion, Markdown import/export and ZIP');

  await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'knowledge-smoke',version:'1'}});await rpc('notifications/initialized',{},true);
  const tools=await rpc('tools/list',{});assert.equal(tools.tools.length,10);
  const s=await call('ingest_source',{title:token+' MCP',body:token+' MCP original'});sources.push(s.item.id);
  const w=await call('publish_wiki',{title:token+' MCP wiki',body:'MCP verified citation',sources:[{id:s.item.id,revision:s.item.revision}],summary:'MCP compile'});ids.push(w.id);
  assert.equal(w.needsReview,false);
  const sourceHits=await call('search',{query:token,kind:'page',pageType:'source'});assert.ok(sourceHits.some(i=>i.id===s.item.id));assert.ok(sourceHits.every(i=>i.pageType==='source'));
  const sourceHitsRest=await request('search?q='+encodeURIComponent(token)+'&page_type=source');assert.ok(sourceHitsRest.every(i=>i.page_type==='source'));
  assert.ok((await call('wiki_context',{view:'index'})).some(i=>i.id===w.id));
  assert.ok((await call('wiki_context',{view:'links',id:s.item.id})).backlinks.some(i=>i.id===w.id));
  assert.equal((await call('history',{id:note.id})).length,3);
  const restored=await call('restore',{id:note.id,revision:1,expectedRevision:3});assert.equal(restored.revision,4);
  await call('update',{id:s.item.id,expectedRevision:1,body:'overwrite'},true);
  await call('publish_wiki',{id:w.id,expectedRevision:1,title:w.title,body:'stale',sources:[{id:s.item.id,revision:999}],summary:'stale'},true);
  assert.equal((await call('promote_issue',{id:issue.id,expectedRevision:2})).id,promoted.id);
  await call('wiki_context',{view:'check'});await call('wiki_context',{view:'log'});
  console.log('ok   all 10 MCP tools, source protection, revision conflicts and compile workflow');
} finally {
  for(const id of [...ids.reverse(),...sources.reverse()]) {
    try{await request(`items/${id}`,'DELETE');}catch(e){console.error('Cleanup failed',id,e.message);process.exitCode=1;}
  }
}
