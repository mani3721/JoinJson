import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { transform } from 'esbuild';
const require = createRequire(import.meta.url);
const { convert, MAX_LENGTH } = require('../assets/json-to-typescript.js');
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('infers every JSON kind, nested properties, mixed arrays and safe keys', async () => {
  const code = convert('{"name":"Ana","age":2,"active":true,"none":null,"nested":{"a-b":1},"items":[1,2],"mixed":[1,"a",null],"empty":[],"__proto__":null,"quote\\\"key":true}');
  for (const fragment of ['export interface Root {', 'name: string;', 'age: number;', 'active: boolean;', 'none: null;', '"a-b": number;', 'items: Array<number>;', 'mixed: Array<number | string | null>;', 'empty: Array<unknown>;', '__proto__: null;', '"quote\\"key": boolean;']) assert.ok(code.includes(fragment), fragment);
  await transform(code, { loader: 'ts' });
  assert.equal({}.polluted, undefined);
});
test('options affect nested fields; aliases support all root values', async () => {
  const code = convert('{"profile":{"name":"Ana"}}', { mode: 'type', optional: true, export: false, rootName: 'Person' });
  assert.match(code, /^type Person = \{/);
  assert.match(code, /profile\?: \{/); assert.match(code, /name\?: string/);
  for (const value of ['null', '1', 'true', '"text"', '[]', '[{"id":1},{"name":"Ana"}]', '[[1],[true]]', '{}']) {
    const code = convert(value);
    await transform(code, { loader: 'ts' });
    if (value !== '{}') assert.match(code, /^export type Root =/);
  }
  assert.match(convert('[{"a":1},{"b":true}]'), /a: number;[\s\S]*\|[\s\S]*b: boolean;/);
});
test('rejects invalid JSON, unsafe names, non-finite numbers and oversized/deep samples', () => {
  assert.throws(() => convert('{bad'), SyntaxError);
  for (const rootName of ['', 'two words', '123', 'class', 'string', 'x;alert(1)']) assert.throws(() => convert('{}', { rootName }), /identifier/);
  assert.throws(() => convert(' '.repeat(MAX_LENGTH + 1)), /1 MB/);
  assert.throws(() => convert('['.repeat(102) + '0' + ']'.repeat(102)), /nested/);
  assert.throws(() => convert('1e400'), /finite/);
});
function app(t, url = 'https://www.joinjson.com/?tool=json-to-typescript', merger = false) {
  const dom = new JSDOM(read('index.html'), { url, runScripts: merger ? 'dangerously' : 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  for (const file of ['json-error-helper.js', 'json-to-zod.js', 'json-to-zod-ui.js', 'json-to-typescript.js', 'json-to-typescript-ui.js']) dom.window.eval(read('assets/' + file));
  return dom.window;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
test('query and path direct visits select TypeScript; SPA and history preserve workspaces', async t => {
  for (const path of ['/?tool=json-to-typescript', '/json-to-typescript', '/json-to-typescript/']) {
    const w = app(t, 'https://www.joinjson.com' + path), d = w.document;
    assert.equal(d.body.dataset.tool, 'json-to-typescript');
    assert.equal(w.location.pathname, '/json-to-typescript');
    assert.equal(w.location.search, '');
    assert.equal(d.getElementById('typescript-tool').hidden, false);
    assert.equal(d.getElementById('zod-tool').hidden, true);
    assert.equal(d.getElementById('tool-current').textContent, 'JSON to TypeScript');
    d.getElementById('typescript-example').click();
    const text = d.getElementById('typescript-input').value;
    d.querySelector('[data-tool="merge"]').click();
    assert.equal(w.location.pathname, '/'); assert.equal(w.location.search, '');
    w.history.back(); await wait(35);
    assert.equal(d.body.dataset.tool, 'json-to-typescript');
    assert.equal(d.getElementById('typescript-input').value, text);
  }
});
test('UI preferences regenerate output; invalid JSON and root names clear stale output', async t => {
  const w = app(t), d = w.document, get = id => d.getElementById('typescript-' + id);
  get('example').click(); assert.match(get('output').value, /export interface Root/);
  get('mode').value = 'type'; get('mode').dispatchEvent(new w.Event('change'));
  get('optional').checked = true; get('optional').dispatchEvent(new w.Event('change'));
  get('export').checked = false; get('export').dispatchEvent(new w.Event('change'));
  get('root').value = 'Person'; get('root').dispatchEvent(new w.Event('input'));
  assert.match(get('output').value, /^type Person =/); assert.match(get('output').value, /city\?: string/);
  get('root').value = 'class'; get('root').dispatchEvent(new w.Event('input'));
  assert.equal(get('output').value, ''); assert.equal(get('copy').disabled, true);
  assert.equal(get('input').getAttribute('aria-invalid'), 'false');
  assert.match(get('options-status').textContent, /identifier/);
  get('root').value = 'Root'; get('root').dispatchEvent(new w.Event('input'));
  get('input').value = '{\n"a":\n}'; get('input').dispatchEvent(new w.Event('input'));
  assert.equal(get('output').value, ''); assert.equal(get('zod').disabled, true);
  await wait(220); assert.match(get('input-status').textContent, /line 3/);
  assert.equal(get('input').getAttribute('aria-invalid'), 'true');
  get('clear').click(); assert.equal(get('input').value, ''); assert.equal(get('output').value, '');
  assert.equal(get('input').getAttribute('aria-invalid'), 'false');
});
test('copy, clipboard failure, download and one-click Zod transfer', async t => {
  const w = app(t), d = w.document, get = id => d.getElementById('typescript-' + id);
  let copied, blob, filename, revoked;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
  w.URL.createObjectURL = value => { blob = value; return 'blob:test'; };
  w.URL.revokeObjectURL = value => { revoked = value; };
  w.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  get('example').click(); get('copy').click(); await wait(0);
  assert.equal(copied, get('output').value);
  w.navigator.clipboard.writeText = async () => { throw Error('denied'); };
  get('copy').click(); await wait(0); assert.match(get('action-status').textContent, /unavailable/);
  get('download').click(); assert.equal(filename, 'Root.ts'); assert.match(blob.type, /typescript/);
  await wait(1050); assert.equal(revoked, 'blob:test');
  get('zod').click(); assert.equal(d.body.dataset.tool, 'json-to-zod');
  assert.equal(d.getElementById('zod-input').value, get('input').value);
  assert.match(d.getElementById('zod-output').value, /z.object/);
  assert.ok(!w.location.href.includes('Ana'));
});
test('merger transfers complete current output and disables action on invalidation', async t => {
  const w = app(t, 'https://www.joinjson.com/', true), d = w.document;
  const button = d.getElementById('merge-typescript');
  assert.equal(button.disabled, true);
  d.getElementById('example').click(); d.getElementById('merge').click();
  assert.equal(button.disabled, false); button.click();
  assert.equal(w.location.pathname, '/json-to-typescript');
  assert.equal(w.location.search, '');
  assert.equal(d.body.dataset.tool, 'json-to-typescript');
  const payload = JSON.parse(d.getElementById('typescript-input').value);
  assert.equal(payload.role, 'Developer'); assert.equal(payload.settings.theme, 'dark');
  assert.match(d.getElementById('typescript-output').value, /interface Root/);
  d.querySelector('[data-tool="merge"]').click();
  d.getElementById('first').value = '{'; d.getElementById('first').dispatchEvent(new w.Event('input'));
  assert.equal(button.disabled, true);
});
test('converter scripts contain no network or persistent-storage calls; deployment rewrites direct links', () => {
  for (const file of ['assets/json-to-typescript.js', 'assets/json-to-typescript-ui.js']) assert.doesNotMatch(read(file), /\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage)\b/);
  const config = JSON.parse(read('vercel.json'));
  assert.ok(config.rewrites.some(rule => rule.source === '/json-to-typescript' && rule.destination === '/index.html'));
});
