// node scripts/issue-preview.test.mjs — check dialog state without a browser or DB.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../src/main/resources/static/index.html', import.meta.url), 'utf8');
const elements = Object.fromEntries(['dlg', 'dlgKey', 'del', 'iPreview', 'iPreviewToggle', 'iHuman', 'iAgent', 'iDocHelp'].map(id => [id, {
  hidden: false, innerHTML: '', textContent: '', attributes: {},
  setAttribute(key, value) { this.attributes[key] = value },
  replaceChildren() { this.innerHTML = '' },
  showModal() {},
}]));
const fields = Object.fromEntries(['title', 'body', 'agent_body', 'prio', 'status'].map(name => [name, { value: '' }]));
const context = vm.createContext({
  $: id => elements[id], F: fields, editing: null, issueDoc: 'body',
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
elements.dlg.querySelector = () => form;
context.api = async (path, options) => { calls.push({ path, ...options }) };
context.renderBoard = () => {};
const submitStart = html.indexOf("$('dlg').querySelector('form').onsubmit");
const submitEnd = html.indexOf("$('del').onclick", submitStart);
vm.runInContext(html.slice(submitStart, submitEnd), context);
context.edit({ id: 7, title: '이슈', body: '요약', agent_body: '에이전트 기록', status: 'todo', prio: 'mid' });
fields.body.value = '바뀐 요약';
await form.onsubmit({ submitter: { value: 'save' } });
assert.equal(calls.at(-1).body.body, '바뀐 요약');
assert.equal('agent_body' in calls.at(-1).body, false);
context.edit({ id: 7, title: '이슈', body: '요약', agent_body: '에이전트 기록', status: 'todo', prio: 'mid' });
fields.agent_body.value = '다음 작업';
await form.onsubmit({ submitter: { value: 'save' } });
assert.equal(calls.at(-1).body.agent_body, '다음 작업');
assert.equal('body' in calls.at(-1).body, false);
console.log('issue preview state test passed');
