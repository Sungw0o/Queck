// node scripts/issue-preview.test.mjs — check dialog state without a browser or DB.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../src/main/resources/static/index.html', import.meta.url), 'utf8');
const elements = Object.fromEntries(['dlg', 'dlgKey', 'del', 'iPreview', 'iPreviewToggle'].map(id => [id, {
  hidden: false, innerHTML: '', textContent: '', attributes: {},
  setAttribute(key, value) { this.attributes[key] = value },
  replaceChildren() { this.innerHTML = '' },
  showModal() {},
}]));
const fields = Object.fromEntries(['title', 'body', 'prio', 'status'].map(name => [name, { value: '' }]));
const context = vm.createContext({
  $: id => elements[id], F: fields, editing: null,
  marked: { parse: text => `parsed(${text})` },
  DOMPurify: { sanitize: text => `sanitized(${text})` },
});
const start = html.indexOf('function edit(i) {');
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

context.edit(null);
assert.equal(fields.body.hidden, false);
assert.equal(fields.body.value, '');
assert.equal(elements.iPreview.hidden, true);
assert.equal(elements.iPreview.innerHTML, '');
assert.equal(elements.iPreviewToggle.textContent, '미리보기');
assert.equal(elements.iPreviewToggle.attributes['aria-pressed'], 'false');
elements.iPreviewToggle.onclick();
assert.match(elements.iPreview.innerHTML, /설명이 비어 있어요/);
console.log('issue preview state test passed');
