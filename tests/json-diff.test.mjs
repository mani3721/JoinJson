import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import * as library from 'jsondiffpatch';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const api = require('../assets/json-diff.js');
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const changes = (a, b) => api.rows(api.compare(a, b, library), a, b);
test('semantic comparison ignores object order and supports every JSON root', () => {
  assert.deepEqual(changes({ a: 1, b: [true, null] }, { b: [true, null], a: 1 }), []);
  for (const value of [null, false, 0, 'text', {}, []]) assert.deepEqual(changes(value, value), []);
  assert.equal(changes(1, {})[0].path, '(root)');
  assert.equal(changes(null, true)[0].status, 'modified');
});
test('nested additions, deletions, modifications and JSON pointer escapes', () => {
  const a = { nested: { old: null, 'a/b~c': false }, items: [1, 2] };
  const b = { nested: { new: true, 'a/b~c': true }, items: [3, 2, 4] };
  const rows = changes(a, b);
  assert.ok(rows.some(row => row.path === '/nested/old' && row.status === 'removed'));
  assert.ok(rows.some(row => row.path === '/nested/new' && row.status === 'added'));
  assert.ok(rows.some(row => row.path === '/nested/a~1b~0c' && row.status === 'modified'));
  assert.ok(rows.some(row => row.path === '/items/0' && row.before === 1 && row.after === 3));
  assert.equal(changes([1, 2], [1])[0].status, 'removed');
  assert.equal(changes([1], [0, 1]).length, 2);
});
test('special keys, array-like object keys and immutable inputs', () => {
  const a = JSON.parse('{"__proto__":{"x":1},"constructor":1,"_t":"a","_0":1}');
  const b = JSON.parse('{"__proto__":{"x":2},"constructor":2,"_t":"a","_0":2}');
  const snapshot = JSON.stringify([a, b]);
  const result = changes(a, b);
  assert.equal(result.length, 3);
  assert.equal(JSON.stringify([a, b]), snapshot);
  assert.equal({}.x, undefined);
});
test('validation limits, invalid JSON and unavailable dependency', () => {
  assert.throws(() => api.parse('{'), SyntaxError);
  assert.throws(() => api.parse('1e400'), /finite/);
  assert.throws(() => api.parse(' '.repeat(api.MAX_LENGTH + 1)), /1 MB/);
  assert.throws(() => api.parse('['.repeat(102) + '0' + ']'.repeat(102)), /nested/);
  assert.throws(() => api.compare({}, {}, null), /could not load/);
  assert.equal(changes(Array.from({ length: 10000 }, (_, i) => i), []).length, 10000);
});
function app(t, merger = false, missing = false) {
  const dom = new JSDOM(read('index.html'), { url: 'https://www.joinjson.com/json-diff', runScripts: merger ? 'dangerously' : 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  t.after(() => w.close());
  w.TextEncoder = TextEncoder;
  w.testLibrary = library;
  for (const file of ['json-error-helper.js', 'json-to-zod-ui.js', 'json-diff.js', 'json-diff-ui.js']) {
    let source = read('assets/' + file);
    if (file === 'json-diff-ui.js') source = source.replace("import('https://cdn.jsdelivr.net/npm/jsondiffpatch@0.7.6/+esm')", missing ? "Promise.reject(new Error('blocked'))" : 'Promise.resolve(window.testLibrary)');
    w.eval(source);
  }
  return w;
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test('direct route, title, visual labels, independent errors, swap and clear', async t => {
  const w = app(t), d = w.document, get = id => d.getElementById('diff-' + id);
  assert.equal(d.title, 'Online JSON Diff & Compare Tool | JoinJSON');
  assert.equal(d.getElementById('json-diff-tool').hidden, false);
  get('example').click(); await tick();
  for (const status of ['added', 'removed', 'modified']) assert.ok(get('output-container').querySelector('.diff-' + status));
  get('swap').click(); await tick();
  assert.equal(JSON.parse(get('input-a').value).role, 'Developer');
  get('input-a').value = '{\n"bad":\n}'; get('input-b').value = '{'; get('compare').click(); await tick();
  assert.match(get('status-a').textContent, /line 3/); assert.match(get('status-b').textContent, /Error/);
  assert.equal(get('input-a').getAttribute('aria-invalid'), 'true');
  assert.equal(get('output-container').querySelector('table'), null);
  get('clear').click(); assert.equal(get('input-a').value, ''); assert.equal(get('input-b').value, '');
  assert.equal(get('input-b').getAttribute('aria-invalid'), 'false');
});
test('untrusted keys render as text, stale results clear and identical report works', async t => {
  const w = app(t), d = w.document, a = d.getElementById('diff-input-a'), b = d.getElementById('diff-input-b');
  a.value = '{}'; b.value = '{"<img src=x onerror=alert(1)>":"<script>bad</script>"}';
  d.getElementById('diff-compare').click(); await tick();
  const output = d.getElementById('diff-output-container');
  assert.equal(output.querySelector('img,script'), null); assert.match(output.textContent, /<img/);
  a.dispatchEvent(new w.Event('input')); assert.equal(output.querySelector('table'), null);
  a.value = b.value; d.getElementById('diff-compare').click(); await tick(); assert.match(output.textContent, /identical/);
});
test('blocked CDN produces recoverable inline error', async t => {
  const w = app(t, false, true), d = w.document;
  d.getElementById('diff-example').click(); await tick();
  assert.match(d.getElementById('diff-action-status').textContent, /library could not load/);
  assert.equal(d.getElementById('diff-compare').hasAttribute('aria-busy'), false);
});
test('merger transfers full result to original input without modifying right input or URL data', t => {
  const w = app(t, true), d = w.document, button = d.getElementById('merge-diff');
  assert.equal(button.disabled, true);
  d.getElementById('diff-input-b').value = '{"keep":true}';
  d.querySelector('[data-tool="merge"]').click();
  d.getElementById('example').click(); d.getElementById('merge').click();
  assert.equal(button.disabled, false); button.click();
  assert.equal(w.location.pathname, '/json-diff'); assert.equal(w.location.search, '');
  assert.equal(JSON.parse(d.getElementById('diff-input-a').value).role, 'Developer');
  assert.equal(d.getElementById('diff-input-b').value, '{"keep":true}');
  d.querySelector('[data-tool="merge"]').click();
  d.getElementById('first').value = '{'; d.getElementById('first').dispatchEvent(new w.Event('input'));
  assert.equal(button.disabled, true);
});
test('diff scripts never upload or persist payloads', () => {
  for (const file of ['assets/json-diff.js', 'assets/json-diff-ui.js']) assert.doesNotMatch(read(file), /\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|innerHTML)\b/);
});
