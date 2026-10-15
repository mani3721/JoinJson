import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const api = require('../assets/json-url.js');
const source = readFileSync(new URL('../assets/json-url.js', import.meta.url), 'utf8');
// Retained legacy adapter; the new standalone flow has its own integration tests.
const html = readFileSync(new URL('./fixtures/legacy-url.html', import.meta.url), 'utf8');

test('only complete HTTPS URLs without embedded credentials are accepted', () => {
  for (const url of ['', 'data:application/json,{}', 'http://example.com/a.json', '/data.json', 'https://user:pass@example.com/a.json', 'javascript:alert(1)']) {
    assert.throws(() => api.validateUrl(url));
  }
  assert.equal(api.validateUrl(' https://example.com/a.json#fragment ').href, 'https://example.com/a.json');
});
test('valid JSON fetch omits credentials, referrer and storage, and strips query from source name', async () => {
  let request;
  const result = await api.fetchJson('https://example.com/a.json?token=private', { fetch: async (url, options) => {
    request = { url, options }; return new Response('{"ok":true}');
  } });
  assert.deepEqual(result, { name: 'a.json', text: '{"ok":true}' });
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
  assert.equal(request.options.mode, 'cors');
  assert.equal(request.options.cache, 'no-store');
});
test('JSON scalars and streamed Unicode are accepted', async () => {
  const result = await api.fetchJson(api.EXAMPLE_URL, { fetch: async () => new Response('"日本語"') });
  assert.equal(result.text, '"日本語"');
});
test('invalid JSON, HTTP failure and CORS failure produce actionable errors', async () => {
  await assert.rejects(api.fetchJson(api.EXAMPLE_URL, { fetch: async () => new Response('<html>no JSON</html>') }), /valid JSON/);
  await assert.rejects(api.fetchJson(api.EXAMPLE_URL, { fetch: async () => new Response('', { status: 404 }) }), /HTTP 404/);
  await assert.rejects(api.fetchJson(api.EXAMPLE_URL, { fetch: async () => { throw new TypeError('Failed to fetch'); } }), /CORS/);
});
test('declared and streamed oversized downloads are refused', async () => {
  await assert.rejects(api.fetchJson(api.EXAMPLE_URL, { fetch: async () => new Response('{}', { headers: { 'content-length': String(api.MAX_BYTES + 1) } }) }), /20 MB/);
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(api.MAX_BYTES + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(api.fetchJson(api.EXAMPLE_URL, { fetch: async () => new Response(body) }), /20 MB/);
  assert.equal(cancelled, true);
});
test('cancelled requests do not return JSON', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.fetchJson(api.EXAMPLE_URL, { signal: controller.signal, fetch: async () => new Response('{}') }), /cancelled/);
});
function setup() {
  const dom = new JSDOM(html, { url: 'https://www.joinjson.com/', runScripts: 'outside-only' });
  const w = dom.window;
  Object.assign(w, { AbortController, TextDecoder, TextEncoder });
  w.fetch = async () => new Response('[{"id":1}]');
  const added = [];
  w.JMFlow = { addSource: source => added.push(source) };
  w.eval(source);
  const panel = target => w.document.querySelector('[data-json-url="' + target + '"]');
  const load = target => panel(target).querySelector('[data-url-load]');
  const input = target => w.document.getElementById(target + '-url');
  return { dom, w, added, panel, load, input };
}
test('quick import works without example controls and fetches only on load', async () => {
  const { dom, w, panel, load, input } = setup();
  try {
    let changed = 0, calls = 0;
    w.document.getElementById('first').addEventListener('input', () => changed++);
    w.fetch = async () => { calls++; return new Response('[{"id":1}]'); };
    assert.equal(w.document.querySelector('[data-url-example]'), null);
    input('first').value = api.EXAMPLE_URL;
    assert.equal(calls, 0);
    const pending = load('first').onclick();
    assert.equal(load('first').disabled, true);
    assert.equal(panel('first').querySelector('[data-url-cancel]').hidden, false);
    await pending;
    assert.equal(changed, 1); assert.equal(w.document.getElementById('first').value, '[{"id":1}]');
    assert.equal(w.document.getElementById('second').value, '');
    assert.equal(load('first').disabled, false);
    assert.equal(panel('first').querySelector('[data-url-cancel]').hidden, true);
  } finally { dom.window.close(); }
});
test('advanced import adds an ordered source instead of replacing quick inputs', async () => {
  const { dom, added, load, input } = setup();
  try {
    input('advanced').value = api.EXAMPLE_URL; await load('advanced').onclick();
    assert.deepEqual(JSON.parse(JSON.stringify(added)), [{ name: '5MB.json', text: '[{"id":1}]' }]);
  } finally { dom.window.close(); }
});
test('invalid responses preserve existing inputs', async () => {
  const { dom, w, load, input } = setup();
  try {
    w.document.getElementById('first').value = '{"keep":true}';
    w.fetch = async () => new Response('bad JSON');
    input('first').value = api.EXAMPLE_URL; await load('first').onclick();
    assert.equal(w.document.getElementById('first').value, '{"keep":true}');
    assert.match(w.document.getElementById('first-url-status').textContent, /valid JSON/);
  } finally { dom.window.close(); }
});
test('clear, cancellation and intervening edits prevent stale downloads from replacing JSON', async () => {
  for (const action of ['clear', 'cancel', 'edit']) {
    const { dom, w, panel, load, input } = setup();
    try {
      let resolve;
      w.fetch = () => new Promise(done => { resolve = done; });
      input('first').value = api.EXAMPLE_URL;
      const pending = load('first').onclick();
      w.document.getElementById('first').value = 'new input';
      if (action === 'clear') w.document.getElementById('clear-data').click();
      if (action === 'cancel') panel('first').querySelector('[data-url-cancel]').click();
      resolve(new Response('{}')); await pending;
      assert.equal(w.document.getElementById('first').value, 'new input');
      assert.equal(load('first').disabled, false);
      if (action === 'edit') assert.match(w.document.getElementById('first-url-status').textContent, /Input changed/);
      if (action === 'clear') assert.equal(input('first').value, '');
    } finally { dom.window.close(); }
  }
});
