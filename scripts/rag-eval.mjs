// Repeatable retrieval evaluation, not a test of LLM answer truthfulness.
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://localhost:8765', ids=[];
const token=Date.now();
const cases=[
  ['body','재발급','토큰 재발급은 만료 후 진행한다.'],
  ['body','백업','백업은 매일 수행한다.'],
  ['agent_body','인수인계','검증 결과를 인수인계 문서에 남겼다.'],
  ['agent_body','동시수정','동시수정은 버전으로 충돌을 감지한다.'],
  ['body','리터럴%_\\','리터럴%_\\ 문자를 정확하게 찾는다.'],
  ['body','출처원본','출처원본을 보존한다.'],
  ['body','캐시정책','캐시정책은 no-cache다.'],
  ['agent_body','복원절차','복원절차는 새 버전을 만든다.'],
  ['body','😀유니코드','😀유니코드와 한글 근거를 함께 찾는다.'],
  ['body','문서연결','문서연결은 역방향으로도 확인한다.'],
];
let hits=0, correctSource=0, excerpts=0, baseline=0;
try {
  for(const [index,[field,keyword,evidence]] of cases.entries()) {
    const unique=keyword+token+index;
    const body='배경 설명. '.repeat(100)+'\n## 검증된 근거\n'+unique+' '+evidence;
    const created=await fetch(base+'/api/items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:field==='agent_body'?'issue':'page',title:'[SMOKE] retrieval '+index,[field]:body})});
    assert.ok(created.ok);const item=await created.json();ids.push(item.id);
    const r=await fetch(base+'/api/search?q='+encodeURIComponent(unique));assert.ok(r.ok);const rows=await r.json();
    const hit=rows.find(h=>h.id===item.id);
    if(hit)hits++;if(hit?.source===field)correctSource++;
    if(hit?.snippet.includes(unique)&&hit.offset>300&&hit.heading==='검증된 근거')excerpts++;
    if(body.slice(0,300).includes(unique))baseline++;
    assert.ok(hit);assert.equal(hit.source,field);assert.ok(hit.snippet.includes(unique));assert.equal(hit.heading,'검증된 근거');assert.ok(hit.offset>300);
    assert.equal(hit.url,field==='agent_body'?`#issue/${item.id}/agent`:`#docs/${item.id}`);
    assert.ok(!/[\uD800-\uDBFF]$/.test(hit.snippet));
  }
  console.log(`ok   RAG fixed 10 queries: retrieval ${hits}/10, source ${correctSource}/10, evidence excerpt ${excerpts}/10 (first-300 baseline ${baseline}/10). LLM answers not evaluated.`);
} finally {
  for(const id of ids){const r=await fetch(base+`/api/items/${id}`,{method:'DELETE'});if(!r.ok){process.exitCode=1;console.error('Cleanup failed',id);}}
}
