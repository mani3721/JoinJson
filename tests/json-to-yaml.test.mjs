import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const { convert, MAX_LENGTH } = require('../assets/json-to-yaml.js');
const yaml = require('js-yaml');
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
test('CDN dependency is pinned with integrity matching the tested browser library', () => {
  const html = read('index.html');
  const script = html.match(/<script src="(https:\/\/cdn\.jsdelivr\.net\/npm\/js-yaml@4\.3\.2\/dist\/js-yaml\.min\.js)" integrity="(sha384-[^"]+)" crossorigin="anonymous" defer><\/script>/);
  assert.ok(script);
  const library = readFileSync(new URL('../node_modules/js-yaml/dist/js-yaml.min.js', import.meta.url));
  assert.equal(script[2], 'sha384-' + createHash('sha384').update(library).digest('base64'));
});
test('nested values, arrays, primitives, ambiguous strings and keys round trip', () => {
  for (const text of ['{"name":"Ana","nested":{"active":true,"n":null},"items":[1,"true","2026-01-01",{},[]]}', 'null', 'false', '2.5', '"yes"', '[]', '{}', '{"__proto__":{"safe":true},"constructor":"x"}']) {
    for (const indent of [2, 4]) {
      const output = convert(text, { indent });
      assert.deepEqual(JSON.parse(convert(output, { direction: 'yaml-to-json', indent })), JSON.parse(text));
    }
  }
  assert.match(convert('{"a":{"b":1}}', { indent: 4 }), /\n    b: 1/);
  assert.match(convert('a:\n  b: 1', { direction: 'yaml-to-json', indent: 4 }), /\n        "b": 1/);
});
test('YAML comments, dates and aliases use JSON-compatible values', () => {
  const result = JSON.parse(convert('# comment\ndate: 2026-01-01\na: &a [1, 2]\nb: *a\n', { direction: 'yaml-to-json' }));
  assert.equal(result.date, '2026-01-01'); assert.deepEqual(result.a, result.b);
});
test('invalid, multi-document, custom tags, cycles and non-finite values fail safely', () => {
  assert.throws(() => convert('{broken'), SyntaxError);
  for (const text of ['a: [', 'a: 1\na: 2', '---\na: 1\n---\nb: 2', '!!js/function function() {}', '.inf', 'a: &a [*a]']) {
    assert.throws(() => convert(text, { direction: 'yaml-to-json' }));
  }
  assert.throws(() => convert('1e400'), /finite/);
  assert.throws(() => convert(' '.repeat(MAX_LENGTH + 1)), /1 MB/);
  assert.throws(() => convert('['.repeat(102) + '0' + ']'.repeat(102)), /nested/);
  const aliases = 'a: &a [1,2,3,4,5,6,7,8,9,0]\n' + ['b', 'c', 'd', 'e', 'f'].map((name, i) => name + ': &' + name + ' [' + Array(10).fill('*' + 'abcdef'[i]).join(',') + ']').join('\n');
  assert.throws(() => convert(aliases, { direction: 'yaml-to-json' }), /too many/);
});
function app(t, path = '/json-to-yaml', merger = false, library = true) {
  const dom = new JSDOM(read('index.html'), { url: 'https://www.joinjson.com' + path, runScripts: merger ? 'dangerously' : 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  if (library) dom.window.jsyaml = yaml;
  for (const file of ['json-error-helper.js', 'json-to-zod-ui.js', 'json-to-yaml.js', 'json-to-yaml-ui.js']) dom.window.eval(read('assets/' + file));
  return dom.window;
}
test('direct routes, title, live input, direction, indentation, errors and clear', async t => {
  for (const path of ['/json-to-yaml', '/json-to-yaml/', '/?tool=json-to-yaml']) {
    const w = app(t, path), d = w.document, get = id => d.getElementById('yaml-' + id);
    assert.equal(w.location.pathname, '/json-to-yaml');
    assert.equal(d.title, 'JSON to YAML & YAML to JSON Converter | JoinJSON');
    assert.equal(d.getElementById('yaml-converter-tool').hidden, false);
    get('example').click(); assert.match(get('output').value, /name: Ana/);
    for (const event of ['input', 'keyup', 'paste']) {
      get('input').value = '{"a":{"b":true}}'; get('input').dispatchEvent(new w.Event(event));
      assert.equal(get('output').value, ''); await wait(220);
      assert.match(get('output').value, /b: true/);
    }
    get('indent').value = '4'; get('indent').dispatchEvent(new w.Event('change'));
    assert.match(get('output').value, /\n    b: true/);
    get('input').value = '{\n"a":\n}'; get('input').dispatchEvent(new w.Event('change'));
    assert.match(get('input-status').textContent, /line 3/);
    assert.equal(get('copy').disabled, true);
    get('to-json').click(); get('example').click(); assert.equal(JSON.parse(get('output').value).name, 'Ana');
    assert.match(get('download').textContent, /\.json/);
    get('input').value = 'a: [\n'; get('input').dispatchEvent(new w.Event('change'));
    assert.match(get('input-status').textContent, /line/); assert.equal(get('input').getAttribute('aria-invalid'), 'true');
    get('clear').click(); assert.equal(get('input').value, ''); assert.equal(get('output').value, '');
    assert.equal(get('input').getAttribute('aria-invalid'), 'false');
  }
});
test('copy, download extension and MIME in both directions, revoke, clipboard failure', async t => {
  const w = app(t), get = id => w.document.getElementById('yaml-' + id);
  let copied, filename, blob, revoked;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
  w.URL.createObjectURL = value => { blob = value; return 'blob:yaml'; };
  w.URL.revokeObjectURL = value => { revoked = value; };
  w.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  get('example').click(); get('copy').click(); await wait(0); assert.equal(copied, get('output').value);
  for (const [mode, extension] of [['to-yaml', 'yaml'], ['to-json', 'json']]) {
    get(mode).click(); get('example').click(); get('download').click();
    assert.equal(filename, 'output.' + extension); assert.match(blob.type, new RegExp('application/' + extension));
  }
  await wait(1050); assert.equal(revoked, 'blob:yaml');
  w.navigator.clipboard.writeText = async () => { throw Error('denied'); };
  get('copy').click(); await wait(0); assert.match(get('action-status').textContent, /unavailable/);
});
test('merger transfers full JSON and resets YAML direction without URL payloads', t => {
  const w = app(t, '/', true), d = w.document, button = d.getElementById('merge-yaml');
  d.getElementById('yaml-to-json').click();
  assert.equal(button.disabled, true);
  d.getElementById('example').click(); d.getElementById('merge').click();
  assert.equal(button.disabled, false); button.click();
  assert.equal(w.location.pathname, '/json-to-yaml'); assert.equal(w.location.search, '');
  assert.equal(d.getElementById('yaml-to-yaml').checked, true);
  assert.equal(JSON.parse(d.getElementById('yaml-input').value).role, 'Developer');
  assert.match(d.getElementById('yaml-output').value, /role: Developer/);
  d.querySelector('[data-tool="merge"]').click();
  d.getElementById('first').value = '{'; d.getElementById('first').dispatchEvent(new w.Event('input'));
  assert.equal(button.disabled, true);
  d.querySelector('[data-tool="json-to-yaml"]').click(); assert.match(d.getElementById('yaml-output').value, /role: Developer/);
});
test('missing CDN library fails inline and data scripts have no networking or storage', t => {
  const w = app(t, '/json-to-yaml', false, false), d = w.document;
  d.getElementById('yaml-example').click();
  assert.match(d.getElementById('yaml-input-status').textContent, /library could not load/);
  assert.equal(d.getElementById('yaml-copy').disabled, true);
  for (const file of ['assets/json-to-yaml.js', 'assets/json-to-yaml-ui.js']) assert.doesNotMatch(read(file), /\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage)\b/);
});
