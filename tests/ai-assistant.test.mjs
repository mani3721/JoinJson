import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createServer, COHERE_API_URL } from '../server/ai-server.mjs';
const require = createRequire(import.meta.url);
const { read } = require('../assets/ai-stream.js');
const encoder = new TextEncoder();
const wire = 'data: {"choices":[{"delta":{"content":"Hello 🌍"}}]}\r\n\r\ndata: [DONE]\r\n\r\n';
function stream(text, chunkSize = 1) {
  const bytes = encoder.encode(text);
  return new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
    controller.close();
  } });
}
test('SSE parsing handles split UTF-8, CRLF, metadata and completion', async () => {
  let text = '';
  await read(stream(': ping\r\n\r\n' + wire), value => { text += value; });
  assert.equal(text, 'Hello 🌍');
});
test('SSE malformed, error, empty and truncated responses fail clearly', async () => {
  for (const text of ['data: bad\n\n', 'data: {"error":"secret"}\n\n', 'data: [DONE]\n\n', 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n']) {
    await assert.rejects(read(stream(text), () => {}));
  }
});
async function fixture(env = {}, fetchImpl = async () => new Response(stream(wire), { headers: { 'Content-Type': 'text/event-stream' } })) {
  const server = createServer({ env: { COHERE_API_KEY: 'test-only-key', ...env }, fetchImpl });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, post: (body, headers = {}) => fetch(base + '/api/ai/chat', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }), close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
test('proxy uses server-only key and reference model and streams provider output', async () => {
  let call;
  const f = await fixture({}, async (url, options) => { call = { url, options }; return new Response(stream(wire), { headers: { 'Content-Type': 'text/event-stream' } }); });
  try {
    const response = await f.post({ prompt: 'Make CSV', context: { inputs: ['{"x":1}'] } });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const text = await response.text(); assert.equal(text, wire); assert(!text.includes('test-only-key'));
    assert.equal(call.url, COHERE_API_URL); assert.equal(call.options.headers.Authorization, 'Bearer test-only-key');
    const payload = JSON.parse(call.options.body);
    assert.equal(payload.model, 'north-mini-code-1-0'); assert.equal(payload.temperature, 0.3); assert.equal(payload.stream, true);
    assert.equal(payload.messages.length, 2); assert(payload.messages[1].content.includes('Untrusted JSON workspace context'));
    const home = await fetch(f.base); assert.equal(home.status, 200); assert((home.headers.get('content-security-policy') || '').includes("connect-src 'self'"));
    for (const url of ['/server/ai-server.mjs', '/.env', '/package.json', '/node_modules/jsdom/package.json', '/assets/../package.json']) assert.equal((await fetch(f.base + url)).status, 404);
  } finally { await f.close(); }
});
test('proxy rejects invalid inputs, cross-origin requests and rate overflow', async () => {
  let calls = 0;
  const f = await fixture({}, async () => { calls++; return new Response(stream(wire), { headers: { 'Content-Type': 'text/event-stream' } }); });
  try {
    assert.equal((await fetch(f.base + '/api/ai/chat')).status, 405);
    assert.equal((await f.post({ prompt: 'x' }, { Origin: 'https://evil.test' })).status, 403);
    assert.equal((await f.post({ prompt: 'x' }, { 'Content-Type': 'text/plain' })).status, 415);
    for (const value of ['{', { prompt: '' }, { prompt: 'x', model: 'override' }, { prompt: 'x', context: [] }]) assert.equal((await f.post(value)).status, 400);
    assert.equal((await f.post({ prompt: 'x'.repeat(70000) })).status, 413);
    for (let i = 0; i < 5; i++) { const response = await f.post({ prompt: 'x' }); assert.equal(response.status, 200); await response.text(); }
    assert.equal((await f.post({ prompt: 'x' })).status, 429); assert.equal(calls, 5);
  } finally { await f.close(); }
});
test('missing configuration, production guard and upstream errors do not leak details', async () => {
  for (const env of [{ COHERE_API_KEY: '' }, { NODE_ENV: 'production' }]) {
    const f = await fixture(env);
    try { assert.equal((await f.post({ prompt: 'x' })).status, 503); } finally { await f.close(); }
  }
  for (const status of [401, 429]) {
    const f = await fixture({}, async () => new Response('private upstream detail', { status }));
    try { const response = await f.post({ prompt: 'x' }); assert.equal(response.status, status === 429 ? 429 : 502); assert(!(await response.text()).includes('private')); } finally { await f.close(); }
  }
});
async function ui() {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost' });
  const w = dom.window, $ = id => w.document.getElementById(id);
  w.TextEncoder = TextEncoder; w.AbortController = AbortController;
  w.JMAIStream = { read }; w.JMFlow = { snapshot: () => ({ files: [{ name: 'secret-name', text: '{"private":1}' }], options: { method: 'join' } }), resultText: () => '[1]' };
  w.eval(await readFile(new URL('../assets/ai-assistant.js', import.meta.url), 'utf8'));
  assert.equal($('ai-api-key'), null, 'The assistant must not ask visitors for an API key');
  const submit = () => $('ai-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  const settle = async () => { for (let i = 0; i < 30 && $('ai-send').disabled; i++) await new Promise(resolve => setTimeout(resolve, 5)); assert.equal($('ai-send').disabled, false); };
  return { dom, w, $, submit, settle };
}
test('popup starts closed, opens without requests and restores keyboard focus', async () => {
  const f = await ui(); let calls = 0;
  f.w.fetch = async () => { calls++; throw new Error('Unexpected request'); };
  try {
    assert(f.$('ai-assistant').hidden);
    assert.equal(f.$('ai-toggle').hidden, false);
    assert.equal(f.$('ai-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(f.$('ai-assistant').getAttribute('role'), 'dialog');
    f.$('ai-toggle').click();
    assert.equal(f.$('ai-assistant').hidden, false);
    assert.equal(f.$('ai-toggle').getAttribute('aria-expanded'), 'true');
    assert.equal(f.w.document.activeElement, f.$('ai-prompt'));
    f.$('ai-prompt').value = 'Keep my draft';
    f.$('ai-prompt').dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(f.$('ai-assistant').hidden);
    assert.equal(f.w.document.activeElement, f.$('ai-toggle'));
    f.$('ai-toggle').click();
    assert.equal(f.$('ai-prompt').value, 'Keep my draft');
    f.$('ai-close').click();
    assert(f.$('ai-assistant').hidden);
    f.$('ai-toggle').click(); f.$('ai-toggle').click();
    assert(f.$('ai-assistant').hidden);
    assert.equal(calls, 0);
  } finally { f.dom.window.close(); }
});
test('closing popup preserves an in-flight response and reopening focuses an enabled control', async () => {
  const f = await ui(); let resolveResponse, aborted = false;
  f.w.fetch = (url, options) => {
    options.signal.addEventListener('abort', () => { aborted = true; });
    return new Promise(resolve => { resolveResponse = resolve; });
  };
  try {
    f.$('ai-toggle').click();
    f.$('ai-prompt').value = 'Help';
    f.submit();
    f.$('ai-close').click(); assert(f.$('ai-assistant').hidden); assert.equal(aborted, false);
    f.$('ai-toggle').click(); assert.equal(f.w.document.activeElement, f.$('ai-close'));
    f.$('ai-close').click();
    resolveResponse(new Response(stream(wire), { headers: { 'Content-Type': 'text/event-stream' } }));
    await f.settle();
    assert(f.$('ai-assistant').hidden); assert.equal(f.$('ai-response').textContent, 'Hello 🌍');
    f.$('ai-toggle').click(); assert.equal(f.w.document.activeElement, f.$('ai-prompt'));
  } finally { f.dom.window.close(); }
});
test('clean chat has no checkboxes, keeps conversation and never attaches workspace JSON', async () => {
  const f = await ui(); const bodies = [];
  f.w.fetch = async (url, options) => {
    assert.equal(url, COHERE_API_URL);
    assert.match(options.headers.Authorization, /^Bearer \S+$/);
    bodies.push(JSON.parse(options.body));
    return new Response(stream('data: {"choices":[{"delta":{"content":"<img src=x onerror=alert(1)>"}}]}\n\ndata: [DONE]\n\n'), { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    assert.equal(f.$('ai-assistant').querySelectorAll('input[type="checkbox"]').length, 0);
    f.$('ai-prompt').value = 'Help'; f.submit(); await f.settle();
    assert.equal(bodies[0].messages[1].content, 'Help');
    assert.equal(f.$('ai-response').children.length, 0);
    assert(f.$('ai-response').textContent.includes('<img'));
    assert.equal(f.$('ai-prompt').value, '');
    f.$('ai-prompt').value = 'Explain that'; f.submit(); await f.settle();
    assert.equal(bodies[1].messages.length, 4);
    assert.equal(bodies[1].messages[2].role, 'assistant');
    assert.equal(bodies[1].messages[3].content, 'Explain that');
    assert(!JSON.stringify(bodies).includes('private'));
    assert.equal(f.$('ai-messages').querySelectorAll('.ai-message').length, 4);
    f.$('clear-data').click();
    assert.equal(f.$('ai-response'), null); assert.equal(f.$('ai-empty').hidden, false);
    assert.equal(f.$('ai-prompt').value, ''); assert.equal(f.w.localStorage.length, 0);
    f.$('ai-prompt').value = 'New chat'; f.submit(); await f.settle();
    assert.equal(bodies[2].messages.length, 2);
  } finally { f.dom.window.close(); }
});
test('UI handles unavailable backend, stop and stale response after clear', async () => {
  const f = await ui();
  try {
    f.$('ai-prompt').value = 'Help';
    f.w.fetch = async () => new Response('{}', { status: 503 }); f.submit(); await f.settle(); assert(f.$('ai-status').textContent.includes('temporarily unavailable'));
    f.w.fetch = (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' }))));
    f.$('ai-prompt').value = 'Again'; f.submit(); assert(f.$('ai-send').disabled); f.$('ai-stop').click(); await f.settle(); assert(f.$('ai-status').textContent.includes('Stopped'));
    f.$('ai-prompt').value = 'Again'; f.submit(); f.$('ai-clear').click(); await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(f.$('ai-response'), null); assert.equal(f.$('ai-status').textContent, '');
  } finally { f.dom.window.close(); }
});

test('direct requests use the configured default key and explain browser network failures', async () => {
  const f = await ui(); let calls = 0;
  try {
    f.$('ai-prompt').value = 'Help';
    f.w.fetch = async (url, options) => {
      calls++;
      assert.equal(url, COHERE_API_URL);
      assert.match(options.headers.Authorization, /^Bearer \S+$/);
      assert.notEqual(options.headers.Authorization, 'Bearer browser-test-key');
      assert(!options.body.includes(options.headers.Authorization.slice(7)));
      throw new TypeError('Failed to fetch');
    };
    f.submit(); await f.settle();
    assert.equal(calls, 1); assert(f.$('ai-status').textContent.includes('CORS'));
    assert.equal(f.w.localStorage.length, 0);
  } finally { f.dom.window.close(); }
});
