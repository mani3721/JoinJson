import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createServer } from '../server/ai-server.mjs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const source = read('assets/json-to-toml.js');
const { convert, init, HANDOFF_KEY } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
// Exercise the exact pinned browser dependency; no production input is sent here.
const response = await fetch('https://cdn.jsdelivr.net/npm/smol-toml@1.9.1/+esm');
assert.ok(response.ok);
const toml = await import('data:text/javascript;base64,' + Buffer.from(await response.text()).toString('base64'));

test('nested JSON, tables, arrays, escaping, booleans and numbers round trip', () => {
  const data = { package: { name: 'example', version: '1.0.0' }, dependencies: { serde: '1' }, enabled: true, list: [1, 2], title: 'quote " and newline\n', empty: {} };
  assert.deepEqual(JSON.parse(convert(convert(JSON.stringify(data), 'json-to-toml', toml), 'toml-to-json', toml)), data);
});
test('formatter validates TOML and strips comments', () => {
  const output = convert('# comment\n[project]\nname="app"\nversion = "1.0"', 'toml-formatter', toml);
  assert.ok(!output.includes('# comment'));
  assert.equal(toml.parse(output).project.name, 'app');
});
test('invalid syntax, null, root arrays and unsafe numbers produce errors', () => {
  for (const value of ['null', '[]', '3', '{"x":null}', '{"x":[null]}', '{"x":9007199254740992}', '{"x":1e999}', '{']) assert.throws(() => convert(value, 'json-to-toml', toml));
  for (const value of ['x = ', 'x=1\nx=2', 'x=inf', 'x=nan', 'x=9223372036854775807']) assert.throws(() => convert(value, 'toml-to-json', toml));
  assert.equal(convert('', 'json-to-toml', toml), '');
  assert.throws(() => convert('{}', 'unknown', toml));
});
test('formatter retains exact large TOML integers and JSON export handles dates', () => {
  assert.match(convert('x=9223372036854775807', 'toml-formatter', toml), /9223372036854775807/);
  assert.equal(JSON.parse(convert('date=1979-05-27', 'toml-to-json', toml)).date, '1979-05-27');
});
test('special property names do not pollute prototypes', () => {
  const result = JSON.parse(convert(convert('{"__proto__":{"test":1}}', 'json-to-toml', toml), 'toml-to-json', toml));
  assert.equal(Object.getPrototypeOf(result).test, undefined);
  assert.equal(result.__proto__.test, 1);
});

test('UI consumes handoff once, converts live, toggles, clears errors, copies and downloads', async () => {
  const dom = new JSDOM(read('json-to-toml.html'), { url: 'https://www.joinjson.com/json-to-toml', pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  try {
    w.sessionStorage.setItem(HANDOFF_KEY, '{"name":"demo"}');
    let copied, blob, filename;
    Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async value => { copied = value; } } });
    w.URL.createObjectURL = value => { blob = value; return 'blob:test'; };
    w.URL.revokeObjectURL = () => {};
    w.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
    await init(d, async () => toml);
    const input = d.getElementById('toml-input'), output = d.getElementById('toml-output');
    assert.equal(w.sessionStorage.getItem(HANDOFF_KEY), null);
    assert.match(output.value, /name = "demo"/);
    d.getElementById('toml-copy').click(); await Promise.resolve();
    assert.equal(copied, output.value);
    assert.equal(d.getElementById('toml-copy').textContent, 'Copied!');
    d.getElementById('toml-download').click();
    assert.equal(filename, 'output.toml'); assert.equal(blob.type, 'application/toml;charset=utf-8');
    input.value = 'name="toml"';
    const mode = d.querySelector('[value="toml-to-json"]'); mode.checked = true; mode.dispatchEvent(new w.Event('change'));
    assert.deepEqual(JSON.parse(output.value), { name: 'toml' });
    d.getElementById('toml-download').click(); assert.equal(filename, 'output.json');
    input.value = 'broken'; input.dispatchEvent(new w.Event('input'));
    assert.equal(output.value, ''); assert.equal(d.getElementById('toml-copy').disabled, true);
    await new Promise(resolve => setTimeout(resolve, 230));
    assert.equal(input.getAttribute('aria-invalid'), 'true'); assert.equal(d.getElementById('toml-error').hidden, false);
    d.getElementById('toml-clear').click(); assert.equal(input.value, ''); assert.equal(output.value, '');
    assert.equal(input.hasAttribute('aria-invalid'), false);
    assert.equal(d.getElementById('toml-error').hidden, true);
  } finally { dom.window.close(); }
});
test('parser failure is visible and controls stay disabled', async () => {
  const dom = new JSDOM(read('json-to-toml.html'), { url: 'https://www.joinjson.com/json-to-toml' });
  try {
    await init(dom.window.document, async () => { throw Error('offline'); });
    assert.match(dom.window.document.getElementById('toml-status').textContent, /could not load/);
    assert.ok(dom.window.document.getElementById('toml-copy').disabled);
  } finally { dom.window.close(); }
});
test('clean routes, HTML and directory index serve the standalone tool', async () => {
  assert.equal(read('json-to-toml/index.html'), read('json-to-toml.html'));
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const path of ['/json-to-toml', '/json-to-toml/', '/json-to-toml.html']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
      assert.equal(response.status, 200);
      const html = await response.text(); assert.match(html, /id="toml-input"/);
      assert.match(response.headers.get('content-security-policy'), /smol-toml@1\.9\.1/);
      const dom = new JSDOM(html);
      assert.equal(dom.window.document.title, 'JSON to TOML Converter & TOML Formatter Online | JoinJSON');
      assert.ok(dom.window.document.querySelector('header a[href="/json-to-toml"]'));
      assert.ok(dom.window.document.querySelector('footer a[href="/json-to-toml"]'));
      dom.window.close();
    }
  } finally { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
});
test('merger has an enabled-state-managed handoff using complete result, not preview', () => {
  const html = read('index.html');
  assert.match(html, /id="merge-toml"[^>]*disabled/);
  assert.equal((html.match(/"merge-yaml", "merge-toml", "merge-diff"/g) || []).length, 2);
  assert.match(html, /sessionStorage\.setItem\('joinjson:toml-input', resultText\)/);
  assert.match(html, /window\.location\.assign\('\/json-to-toml'\)/);
});
