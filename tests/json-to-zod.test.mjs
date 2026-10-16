import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { z } from 'zod';
const require = createRequire(import.meta.url);
const { convert, MAX_LENGTH } = require('../assets/json-to-zod.js');
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('all JSON types, nested structures, arrays and type export', () => {
  const code = convert('{"name":"Ana","age":2,"active":true,"none":null,"nested":{},"items":[1,2],"mixed":[1,"a",null],"empty":[]}', true);
  for (const pattern of ['z.string()', 'z.number()', 'z.boolean()', 'z.unknown().nullable()', 'z.object({})', 'z.array(z.number())', 'z.union([', 'z.array(z.unknown())', 'export type Output = z.infer<typeof schema>;']) assert.ok(code.includes(pattern), pattern);
  assert.ok(!convert('{}').includes('export type'));
  assert.equal(convert('[1,2,3]').match(/z.number/g).length, 1);
});
// Only execute converter-generated code from trusted test fixtures, never user input.
function validator(value) {
  const code = convert(JSON.stringify(value));
  return new Function('z', code.replace('import { z } from "zod";', '').replace('export const schema =', 'return'))(z);
}
test('normalizes identifier keys while preserving arbitrary keys and prototype safety', () => {
  const sample = JSON.parse('{"username":"Ana","$id":1,"_active":true,"default":false,"a-b":2,"first name":"Ana","123":3,"quote\\\"key":4,"__proto__":null}');
  const code = convert(JSON.stringify(sample));
  for (const key of ['username', '$id', '_active', 'default']) {
    assert.ok(code.includes('\n  ' + key + ': z.'));
    assert.ok(!code.includes(JSON.stringify(key) + ':'));
  }
  for (const key of ['a-b', 'first name', '123', 'quote"key']) assert.ok(code.includes(JSON.stringify(key) + ':'));
  assert.ok(code.includes('["__proto__"]: z.unknown().nullable()'));
  const schema = validator(sample);
  assert.ok(Object.hasOwn(schema.shape, '__proto__'));
  assert.equal(schema.safeParse(sample).success, true);
  assert.equal(schema.safeParse({ ...sample, username: 42 }).success, false);
});
test('null-only fields and roots accept future values with nullable unknown schemas', () => {
  const code = convert('{"joined":null,"nested":{"value":null}}');
  assert.match(code, /joined: z.unknown\(\).nullable\(\)/);
  assert.match(code, /value: z.unknown\(\).nullable\(\)/);
  assert.ok(!code.includes('z.null()'));
  const schema = validator({ joined: null, nested: { value: null } });
  for (const joined of [null, '2026-01-01', 42, false, { id: 1 }]) {
    assert.equal(schema.safeParse({ joined, nested: { value: joined } }).success, true);
    assert.equal(validator(null).safeParse(joined).success, true);
  }
});
test('nullable arrays retain concrete element validation and deduplication', () => {
  assert.match(convert('[true,null,true]'), /z.array\(z.boolean\(\).nullable\(\)\)/);
  assert.match(convert('[null,null]'), /z.array\(z.unknown\(\).nullable\(\)\)/);
  assert.equal(validator([null]).safeParse([null, 'later', 42]).success, true);
  const booleans = validator([true, null]);
  assert.equal(booleans.safeParse([null, false, true]).success, true);
  assert.equal(booleans.safeParse(['invalid']).success, false);
  const mixed = validator([1, 'a', null, 2]);
  assert.equal(mixed.safeParse([null, 'later', 42]).success, true);
  assert.equal(mixed.safeParse([false]).success, false);
  assert.equal(convert('[1,null,2]').match(/z.number/g).length, 1);
});
test('arbitrary keys, root primitives, and bounded failures', () => {
  assert.match(convert('{"__proto__":null,"a-b":true,"quote\\\"key":1}'), /\["__proto__"\]: z.unknown\(\).nullable\(\)/);
  for (const value of ['null', '1', 'true', '"text"', '[]']) assert.match(convert(value), /export const schema = z\./);
  assert.throws(() => convert('{bad'), SyntaxError);
  assert.throws(() => convert(' '.repeat(MAX_LENGTH + 1)), /1 MB/);
  assert.throws(() => convert('['.repeat(102) + '0' + ']'.repeat(102)), /nested/);
  assert.throws(() => convert('1e400'), /finite/);
});
function app(url = 'https://www.joinjson.com/?tool=json-to-zod') {
  const dom = new JSDOM(read('index.html'), { url, runScripts: 'outside-only', pretendToBeVisual: true });
  for (const file of ['json-error-helper.js', 'json-to-zod.js', 'json-to-zod-ui.js']) dom.window.eval(read('assets/' + file));
  return dom;
}
test('direct URL, SPA switching and back navigation preserve inputs', async t => {
  const dom = app(); t.after(() => dom.window.close());
  const { document: d } = dom.window;
  assert.equal(d.getElementById('zod-tool').hidden, false);
  d.getElementById('zod-example').click();
  const generated = d.getElementById('zod-output').value;
  assert.match(generated, /z.object/);
  d.getElementById('zod-type').click();
  assert.match(d.getElementById('zod-output').value, /export type Output/);
  const menu = d.getElementById('tool-menu');
  assert.equal(menu.querySelector('select'), null);
  assert.ok(!menu.textContent.includes('🛡'));
  assert.equal(menu.querySelector('[aria-current="page"]').dataset.tool, 'json-to-zod');
  menu.querySelector('[data-tool="merge"]').click();
  assert.equal(menu.querySelector('[aria-current="page"]').dataset.tool, 'merge');
  assert.equal(dom.window.location.search, '');
  assert.equal(d.getElementById('zod-tool').hidden, true);
  dom.window.history.back();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(d.getElementById('zod-tool').hidden, false);
  assert.ok(d.getElementById('zod-input').value.includes('Ana'));
});
test('invalid JSON clears stale output and reports a line; clear resets', async t => {
  const dom = app(); t.after(() => dom.window.close());
  const d = dom.window.document;
  d.getElementById('zod-example').click();
  const input = d.getElementById('zod-input'); input.value = '{\n"a":\n}';
  input.dispatchEvent(new dom.window.Event('input'));
  assert.equal(d.getElementById('zod-output').value, '');
  assert.equal(d.getElementById('zod-copy').disabled, true);
  await new Promise(resolve => setTimeout(resolve, 220));
  assert.match(d.getElementById('zod-input-status').textContent, /line 3/);
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  d.getElementById('zod-clear').click(); assert.equal(input.value, '');
  assert.equal(input.getAttribute('aria-invalid'), 'false');
});
test('copy and download use the complete displayed code', async t => {
  const dom = app(); t.after(() => dom.window.close());
  const w = dom.window, d = w.document; let copied, blob, downloaded, revoked;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
  w.URL.createObjectURL = value => { blob = value; return 'blob:test'; };
  w.URL.revokeObjectURL = value => { revoked = value; };
  w.HTMLAnchorElement.prototype.click = function () { downloaded = this.download; };
  d.getElementById('zod-example').click(); d.getElementById('zod-copy').click();
  await Promise.resolve(); assert.equal(copied, d.getElementById('zod-output').value);
  d.getElementById('zod-download').click(); assert.equal(downloaded, 'schema.ts');
  assert.match(blob.type, /typescript/);
  await new Promise(resolve => setTimeout(resolve, 1050)); assert.equal(revoked, 'blob:test');
});
test('existing merger still loads and merges on the default route', t => {
  const dom = new JSDOM(read('index.html'), { url: 'https://www.joinjson.com/', runScripts: 'dangerously' });
  t.after(() => dom.window.close()); const d = dom.window.document;
  d.getElementById('example').click(); d.getElementById('merge').click();
  assert.equal(d.getElementById('copy').disabled, false);
  assert.equal(d.getElementById('result-output').hidden, false);
});
