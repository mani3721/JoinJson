import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function setup() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://joinjson.com/', pretendToBeVisual: true });
  const win = dom.window, doc = win.document;
  const get = id => doc.getElementById(id);
  function set(id, text) { get(id).value = text; get(id).dispatchEvent(new win.Event('input', { bubbles: true })); }
  function merge(a, b) { set('first', JSON.stringify(a)); set('second', JSON.stringify(b)); get('merge').click();
    // Disabled buttons intentionally cannot be clicked before validation debounce.
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); }
  const output = () => [...get('result-lines').querySelectorAll('code')].map(n => n.textContent).join('\n');
  return { dom, win, doc, get, set, merge, output };
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('standalone page defaults to Paste, empty status and disabled merge', t => {
  const s = setup(); t.after(() => s.dom.window.close());
  assert.equal(s.get('merge').disabled, true);
  for (const id of ['first', 'second']) {
    assert.equal(s.get(id + '-paste').hidden, false);
    assert.equal(s.get(id + '-upload').hidden, true);
    assert.equal(s.get(id + '-url-panel').hidden, true);
    assert.equal(s.get(id + '-status').textContent, 'Empty');
  }
  assert.equal(s.doc.querySelectorAll('script[src],link[rel=stylesheet]').length, 0);
});
test('tabs expose only one method and support keyboard navigation', t => {
  const s = setup(); t.after(() => s.dom.window.close());
  s.get('first-tab-upload').click();
  assert.equal(s.get('first-upload').hidden, false);
  assert.equal(s.get('first-paste').hidden, true);
  s.get('first-tab-upload').dispatchEvent(new s.win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(s.get('first-url-panel').hidden, false);
  assert.equal(s.get('first-tab-url').getAttribute('aria-selected'), 'true');
});
test('live validation, line error, ready state and result invalidation', async t => {
  const s = setup(); t.after(() => s.dom.window.close());
  s.set('first', '{\n"name":\n}'); s.set('second', '{}'); await wait(220);
  assert.match(s.get('first-status').textContent, /Error on line 3/);
  assert.equal(s.get('first').getAttribute('aria-invalid'), 'true');
  assert.equal(s.get('merge').disabled, true);
  s.set('first', '{"name":"Ana"}'); await wait(220);
  assert.equal(s.get('merge').disabled, false); s.get('merge').click();
  assert.equal(s.get('copy').disabled, false);
  s.set('first', '{}'); assert.equal(s.get('copy').disabled, true);
});
test('deep merge, array policy, shallow option and changed-line annotations', t => {
  const s = setup(); t.after(() => s.dom.window.close());
  s.merge({ name: 'Ana', settings: { a: 1, b: 2 }, tags: [1] }, { name: 'Bea', city: 'Paris', settings: { a: 3 }, tags: [2] });
  assert.deepEqual(JSON.parse(s.output()), { name: 'Bea', settings: { a: 3, b: 2 }, tags: [2], city: 'Paris' });
  assert.ok(s.doc.querySelector('.result-lines .added'));
  assert.ok(s.doc.querySelector('.result-lines .overridden'));
  s.get('arrays').value = 'concat'; s.get('merge').click();
  assert.deepEqual(JSON.parse(s.output()).tags, [1, 2]);
  s.get('deep').checked = false; s.get('merge').click();
  assert.deepEqual(JSON.parse(s.output()).settings, { a: 3 });
});
test('primitive, null, root arrays and dangerous object keys merge safely', t => {
  const s = setup(); t.after(() => s.dom.window.close());
  s.merge({ a: 1 }, null); assert.equal(s.output(), 'null');
  s.merge([1], [2]); assert.deepEqual(JSON.parse(s.output()), [2]);
  s.get('arrays').value = 'concat'; s.get('merge').click(); assert.deepEqual(JSON.parse(s.output()), [1, 2]);
  s.set('first', '{"__proto__":{"polluted":true},"constructor":{"x":1}}'); s.set('second', '{"__proto__":{"safe":true}}');
  s.doc.dispatchEvent(new s.win.KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
  assert.deepEqual(JSON.parse(s.output()).__proto__, { polluted: true, safe: true });
  assert.equal(s.win.Object.prototype.polluted, undefined);
});
test('example, swap, find toggle, wrap and clear controls', t => {
  const s = setup(); t.after(() => s.dom.window.close());
  s.get('example').click(); assert.equal(s.get('merge').disabled, false);
  const first = s.get('first').value, second = s.get('second').value;
  s.get('swap').click(); assert.equal(s.get('first').value, second); assert.equal(s.get('second').value, first);
  const card = s.get('first').closest('article');
  card.querySelector('[data-action=find]').click(); assert.equal(s.get('first-find-bar').hidden, false);
  card.querySelector('[data-action=find]').click(); assert.equal(s.get('first-find-bar').hidden, true);
  card.querySelector('[data-action=wrap]').click(); assert.equal(s.get('first-lines').hidden, true);
  s.get('clear').click(); assert.equal(s.get('first').value, ''); assert.equal(s.get('merge').disabled, true);
});
test('URL import success and failure preserve data, use no credentials and validate HTTPS', async t => {
  const s = setup(); t.after(() => s.dom.window.close());
  s.get('example').click(); const original = s.get('first').value;
  s.get('first-tab-url').click();
  const load = s.get('first').closest('article').querySelector('[data-action=load]');
  s.get('first-url').value = 'http://example.com/a.json'; await load.onclick();
  assert.match(s.get('first-import-status').textContent, /HTTPS/);
  s.get('first-url').value = 'https://example.com/a.json';
  s.win.fetch = async (_url, options) => { assert.equal(options.credentials, 'omit'); return { ok: true, headers: new Map(), text: async () => '{bad}' }; };
  s.win.TextEncoder = TextEncoder;
  await load.onclick(); assert.equal(s.get('first').value, original);
  assert.match(s.get('first-import-status').textContent, /valid JSON/);
  s.win.fetch = async () => ({ ok: true, headers: new Map(), text: async () => '{"from":"url"}' });
  await load.onclick(); assert.equal(s.get('first').value, '{"from":"url"}');
});
test('file upload metadata, rejection, remove and successful validation', async t => {
  const s = setup(); t.after(() => s.dom.window.close());
  s.get('first-tab-upload').click();
  const fileInput = s.get('first-file');
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [{ name: 'test.json', size: 7, text: async () => '{"a":1}' }] });
  await fileInput.onchange({ target: fileInput }); await wait(10);
  assert.equal(s.get('first').value, '{"a":1}');
  assert.equal(s.get('first-file-info').hidden, false);
  assert.match(s.get('first-file-info').textContent, /test.json/);
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [{ name: 'too-big.json', size: 21 * 1024 * 1024 }] });
  await fileInput.onchange({ target: fileInput });
  assert.match(s.get('first-import-status').textContent, /larger than 20 MB/);
  assert.equal(s.get('first').value, '{"a":1}');
  s.get('first').closest('article').querySelector('[data-action=remove]').click();
  assert.equal(s.get('first').value, ''); assert.equal(s.get('first-file-info').hidden, true);
});
test('untrusted JSON stays literal text and preview limits do not truncate downloads', async t => {
  const s = setup(); t.after(() => s.dom.window.close());
  s.merge({}, { html: '<img src=x onerror=alert(1)>' });
  assert.equal(s.get('result-output').querySelector('img'), null);
  const data = Array.from({ length: 6000 }, (_, i) => i);
  s.merge([], data); assert.equal(s.get('preview-notice').hidden, false);
  let copied;
  Object.defineProperty(s.win.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
  await s.get('copy').onclick(); assert.deepEqual(JSON.parse(copied), data);
});
