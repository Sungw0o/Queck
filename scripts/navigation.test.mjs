// node scripts/navigation.test.mjs — navigation and guide loading without DB/browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../src/main/resources/static/index.html', import.meta.url), 'utf8');
const elements = Object.fromEntries(['home', 'board', 'docs', 'guide', 'guideHuman', 'guideAgent', 'guideDownload', 'guideBody'].map(id => [id, {
  hidden: true, textContent: '', innerHTML: '', attributes: {},
  setAttribute(key, value) { this.attributes[key] = value },
}]));
const calls = [];
const context = vm.createContext({
  $: id => elements[id], current: 'home', routed: '', editNext: false,
  location: { hash: '' }, history: { replaceState: (_state, _title, hash) => { context.location.hash = hash } },
  window: { scrollTo: () => { calls.push('top') } },
  renderTree: async () => {}, renderBoard: () => { calls.push('board') },
  renderDoc: (id, edit) => { calls.push({ page: id, edit }) },
  api: async () => ({ id: 12 }), edit: item => { calls.push({ issue: item.id }) },
  showIssueDoc: name => { calls.push(name) },
  fetch: async () => ({ ok: true, text: async () => 'guide markdown' }),
  marked: { parse: value => `parsed(${value})` }, DOMPurify: { sanitize: value => `clean(${value})` },
});
const start = html.indexOf('async function renderGuide(');
const end = html.indexOf('document.onkeydown', start);
vm.runInContext(html.slice(start, end), context);

await context.route();
assert.equal(context.current, 'home');
assert.equal(context.routed, '#home');
assert.equal(elements.home.hidden, false);
assert.equal(elements.board.hidden, true);
assert.ok(calls.includes('top'));
context.location.hash = '#board';
await context.route();
assert.equal(elements.home.hidden, true);
assert.equal(elements.board.hidden, false);
assert.ok(calls.includes('board'));
context.location.hash = '#docs/12';
context.editNext = true;
await context.route();
assert.equal(elements.docs.hidden, false);
assert.ok(calls.some(c => c.page === 12 && c.edit === true));
assert.equal(context.editNext, false);
context.location.hash = '#issue/12/agent';
await context.route();
assert.equal(context.location.hash, '#board');
assert.equal(elements.board.hidden, false);
assert.ok(calls.some(c => c.issue === 12));
assert.ok(calls.includes('agent_body'));

context.location.hash = '#guide/agent';
await context.route();
await context.renderGuide(true);
assert.equal(elements.guide.hidden, false);
assert.equal(context.current, 'guide/agent');
assert.equal(elements.guideAgent.attributes['aria-current'], 'page');
assert.equal(elements.guideDownload.href, '/agent-guide.md');
assert.equal(elements.guideBody.innerHTML, 'clean(parsed(guide markdown))');
context.current = 'guide';
await context.renderGuide(false);
assert.equal(elements.guideDownload.href, '/user-guide.md');
assert.equal(elements.guideHuman.attributes['aria-current'], 'page');

// A slow human-guide response must not replace the newer agent-guide selection.
const pending = {};
context.fetch = path => new Promise(resolve => { pending[path] = resolve });
const human = context.renderGuide(false);
context.current = 'guide/agent';
const agent = context.renderGuide(true);
pending['/agent-guide.md']({ ok: true, text: async () => 'agent' });
await agent;
pending['/user-guide.md']({ ok: true, text: async () => 'human' });
await human;
assert.equal(elements.guideBody.innerHTML, 'clean(parsed(agent))');
context.fetch = async () => ({ ok: false, status: 503 });
await context.renderGuide(true);
assert.match(elements.guideBody.textContent, /가이드를 불러오지 못했어요/);

console.log('home, guides and existing issue/wiki navigation test passed');
