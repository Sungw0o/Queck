// node scripts/issue-preview.test.mjs — check dialog state without a browser or DB.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../src/main/resources/static/index.html', import.meta.url), 'utf8');
const elements = Object.fromEntries(['dlg', 'dlgKey', 'del', 'iPreview', 'iPreviewToggle', 'iHuman', 'iAgent', 'iDocHelp'].map(id => [id, {
  hidden: false, innerHTML: '', textContent: '', attributes: {},
  setAttribute(key, value) { this.attributes[key] = value },
  replaceChildren() { this.innerHTML = '' },
  showModal() { this.open = true },
  close() { this.open = false },
}]));
const fields = Object.fromEntries(['title', 'body', 'agent_body', 'prio', 'status'].map(name => [name, { value: '' }]));
fields[Symbol.iterator] = function* () { yield* Object.values(fields) };
const errors = [];
const context = vm.createContext({
  $: id => elements[id], F: fields, editing: null, issueDoc: 'body', issueSaving: false,
  confirm: () => { throw new Error('Unexpected discard prompt') },
  console: { error: error => errors.push(error) },
  marked: { parse: text => `parsed(${text})` },
  DOMPurify: { sanitize: text => `sanitized(${text})` },
});
const start = html.indexOf('function showIssueDoc(name) {');
const end = html.indexOf("$('dlg').querySelector('form').onsubmit", start);
assert.ok(start >= 0 && end > start);
vm.runInContext(html.slice(start, end), context);

context.edit({ id: 7, body: '**설명**', title: '이슈', status: 'doing', prio: 'high' });
elements.iPreviewToggle.onclick();
assert.equal(fields.body.hidden, true);
assert.equal(elements.iPreview.hidden, false);
assert.equal(elements.iPreview.innerHTML, 'sanitized(parsed(**설명**))');
assert.equal(elements.iPreviewToggle.attributes['aria-pressed'], 'true');
assert.equal(fields.body.value, '**설명**');

elements.iPreviewToggle.onclick();
assert.equal(fields.body.hidden, false);
assert.equal(elements.iPreview.hidden, true);
fields.body.value = '수정한 설명';
elements.iPreviewToggle.onclick();
assert.equal(elements.iPreview.innerHTML, 'sanitized(parsed(수정한 설명))');

elements.iAgent.onclick();
assert.equal(fields.body.hidden, true);
assert.equal(fields.agent_body.hidden, false);
assert.equal(elements.iPreview.hidden, true);
fields.agent_body.value = '## 다음 작업';
elements.iPreviewToggle.onclick();
assert.equal(elements.iPreview.innerHTML, 'sanitized(parsed(## 다음 작업))');
assert.equal(fields.agent_body.hidden, true);
elements.iHuman.onclick();
assert.equal(fields.body.value, '수정한 설명');
assert.equal(fields.agent_body.value, '## 다음 작업');
assert.equal(fields.body.hidden, false);
assert.equal(fields.agent_body.hidden, true);

context.edit(null);
assert.equal(fields.body.hidden, false);
assert.equal(fields.body.value, '');
assert.equal(fields.agent_body.value, '');
assert.equal(elements.iPreview.hidden, true);
assert.equal(elements.iPreview.innerHTML, '');
assert.equal(elements.iPreviewToggle.textContent, '미리보기');
assert.equal(elements.iPreviewToggle.attributes['aria-pressed'], 'false');
elements.iPreviewToggle.onclick();
assert.match(elements.iPreview.innerHTML, /문서가 비어 있어요/);

// A save must not resend an unchanged document that another agent may have updated.
const form = {};
const calls = [];
const event = value => ({ submitter: { value }, prevented: false, preventDefault() { this.prevented = true } });
elements.dlg.querySelector = () => form;
context.api = async (path, options) => { calls.push({ path, ...options }) };
context.renderBoard = () => {};
const submitStart = html.indexOf("$('dlg').querySelector('form').onsubmit");
const submitEnd = html.indexOf("$('del').onclick", submitStart);
vm.runInContext(html.slice(submitStart, submitEnd), context);
context.edit({ id: 7, title: '이슈', body: '요약', agent_body: '에이전트 기록', status: 'todo', prio: 'mid' });
fields.body.value = '바뀐 요약';
await form.onsubmit(event('save'));
assert.equal(calls.at(-1).body.body, '바뀐 요약');
assert.equal('agent_body' in calls.at(-1).body, false);
context.edit({ id: 7, title: '이슈', body: '요약', agent_body: '에이전트 기록', status: 'todo', prio: 'mid' });
fields.agent_body.value = '다음 작업';
await form.onsubmit(event('save'));
assert.equal(calls.at(-1).body.agent_body, '다음 작업');
assert.equal('body' in calls.at(-1).body, false);

// Failed saves keep both drafts; retry closes only after success.
context.edit({ id: 7, title: '이슈', body: '요약', agent_body: '기록', status: 'todo', prio: 'mid' });
fields.body.value = '저장할 요약';
fields.agent_body.value = '저장할 인수인계';
context.api = async () => { throw new Error('simulated request failure') };
const failedEvent = event('save');
await form.onsubmit(failedEvent);
assert.equal(failedEvent.prevented, true);
assert.equal(elements.dlg.open, true);
assert.equal(fields.body.value, '저장할 요약');
assert.equal(fields.agent_body.value, '저장할 인수인계');
assert.equal(errors.length, 1);
assert.ok(Object.values(fields).every(field => field.disabled === false));

// Refusing Cancel/Escape preserves both drafts; accepting discards.
let prompts = 0;
context.confirm = () => { prompts++; return false };
await form.onsubmit(event('cancel'));
assert.equal(elements.dlg.open, true);
const escape = event();
elements.dlg.oncancel(escape);
assert.equal(escape.prevented, true);
assert.equal(prompts, 2);
assert.equal(fields.agent_body.value, '저장할 인수인계');
context.confirm = () => true;
await form.onsubmit(event('cancel'));
assert.equal(elements.dlg.open, false);
context.edit(null);
context.confirm = () => { throw new Error('Unchanged draft must not prompt') };
await form.onsubmit(event('cancel'));
assert.equal(elements.dlg.open, false);

// While saving, prevent duplicate requests, editing, Cancel and Escape.
context.edit(null);
fields.title.value = '새 이슈';
fields.agent_body.value = '진행 기록';
let release;
let requests = 0;
context.api = () => { requests++; return new Promise(resolve => { release = resolve }) };
const pending = form.onsubmit(event('save'));
assert.equal(elements.dlg.open, true);
assert.ok(Object.values(fields).every(field => field.disabled === true));
await form.onsubmit(event('save'));
await form.onsubmit(event('cancel'));
const busyEscape = event();
elements.dlg.oncancel(busyEscape);
assert.equal(busyEscape.prevented, true);
assert.equal(requests, 1);
release();
await pending;
assert.equal(elements.dlg.open, false);
assert.ok(Object.values(fields).every(field => field.disabled === false));

// Refresh/close and hash navigation must also keep an unsaved issue draft.
context.isDirty = () => false;
const unloadStart = html.indexOf('onbeforeunload =');
const unloadEnd = html.indexOf('// Sidebar,', unloadStart);
vm.runInContext(html.slice(unloadStart, unloadEnd), context);
context.edit(null);
let unload = event();
context.onbeforeunload(unload);
assert.equal(unload.prevented, false);
fields.agent_body.value = '미저장 에이전트 문서';
unload = event();
context.onbeforeunload(unload);
assert.equal(unload.prevented, true);
let restored;
let routes = 0;
context.routed = '#board';
context.history = { replaceState: (_state, _title, url) => { restored = url } };
context.confirmDiscard = () => true;
context.confirm = () => false;
context.route = () => { routes++ };
const hashStart = html.indexOf('onhashchange =');
vm.runInContext(html.slice(hashStart, html.indexOf('\nroute();', hashStart)), context);
context.onhashchange();
assert.equal(restored, '#board');
assert.equal(routes, 0);
assert.equal(elements.dlg.open, true);
context.confirm = () => true;
context.onhashchange();
assert.equal(routes, 1);
assert.equal(elements.dlg.open, false);

// Network errors are shown by api(), while the caller can retain its draft.
let notice = '';
context.alert = text => { notice = text };
context.fetch = async () => { throw new Error('offline') };
const apiStart = html.indexOf('async function api(');
vm.runInContext(html.slice(apiStart, html.indexOf('// ---- sidebar', apiStart)), context);
await assert.rejects(context.api('items'), /offline/);
assert.match(notice, /서버에 연결하지 못했어요/);
console.log('issue documents and draft retention test passed');
