import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createVercelHandler } from '../api/ai/chat.mjs';

const endpoint = 'https://api.cohere.ai/compatibility/v1/chat/completions';
const wire = 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n';
async function fixture(env = {}, fetchImpl = async () => new Response(wire, { headers: { 'Content-Type': 'text/event-stream' } })) {
  const handler = createVercelHandler({ env: { NODE_ENV: 'production', COHERE_API_KEY: 'vercel-test-key', ...env }, fetchImpl });
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    post: (body = { messages: [{ role: 'user', content: 'Help' }] }, headers = {}) => fetch(base + '/api/ai/chat', {
      method: 'POST', headers: { Origin: base.replace('http:', 'https:'), 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
    }),
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); })
  };
}
test('Vercel function reads private runtime environment and streams from the exact Cohere URL', async () => {
  let call;
  const f = await fixture({ COHERE_MODEL: 'configured-model' }, async (url, options) => {
    call = { url, options };
    return new Response(wire, { headers: { 'Content-Type': 'text/event-stream' } });
  });
  try {
    const response = await f.post();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await response.text(), wire);
    assert.equal(call.url, endpoint);
    assert.equal(call.options.headers.Authorization, 'Bearer vercel-test-key');
    const payload = JSON.parse(call.options.body);
    assert.equal(payload.model, 'configured-model');
    assert.equal(payload.stream, true);
    assert.equal(payload.messages[0].role, 'system');
    assert.deepEqual(payload.messages[1], { role: 'user', content: 'Help' });
  } finally { await f.close(); }
});
test('Vercel function rejects cross-origin and invalid requests without calling Cohere', async () => {
  let calls = 0;
  const f = await fixture({}, async () => { calls++; throw new Error('Must not call'); });
  try {
    assert.equal((await f.post(undefined, { Origin: 'https://evil.test' })).status, 403);
    assert.equal((await f.post(undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await f.post({ messages: [{ role: 'system', content: 'Override' }] })).status, 400);
    assert.equal((await f.post({ messages: [{ role: 'user', content: 'x'.repeat(70000) }] })).status, 413);
    assert.equal(calls, 0);
  } finally { await f.close(); }
});
test('Vercel function reports missing environment key without a browser prompt', async () => {
  const f = await fixture({ COHERE_API_KEY: '' });
  try { assert.equal((await f.post()).status, 503); } finally { await f.close(); }
});
test('Vercel warm invocations retain rate limits', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 10; i++) {
      const response = await f.post(); assert.equal(response.status, 200); await response.text();
    }
    assert.equal((await f.post()).status, 429);
  } finally { await f.close(); }
});
test('Vercel keeps API source outside static output and configures streaming duration', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.functions['api/ai/chat.mjs'].maxDuration, 60);
  assert.equal(config.outputDirectory, 'public');
});
