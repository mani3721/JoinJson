import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createServer } from '../server/ai-server.mjs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { syncStandaloneRoutes } from '../scripts/sync-standalone-routes.mjs';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('static previews have a complete formatter directory index', () => {
  assert.equal(read('jsonc-formatter/index.html'), read('jsonc-formatter.html'));
});

test('directory route generation refreshes stale content', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'joinjson-routes-'));
  try {
    for (const content of ['first version', 'updated version']) {
      await writeFile(path.join(root, 'jsonc-formatter.html'), content);
      await syncStandaloneRoutes(root);
      assert.equal(await readFile(path.join(root, 'jsonc-formatter/index.html'), 'utf8'), content);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('formatter menu link uses native navigation rather than SPA routing', () => {
  const dom = new JSDOM(read('index.html'), { url: 'https://www.joinjson.com/', runScripts: 'outside-only' });
  try {
    const w = dom.window;
    w.eval(read('assets/json-to-zod-ui.js'));
    const link = w.document.querySelector('#tool-menu a[href="/jsonc-formatter"]');
    assert.ok(link);
    let intercepted;
    // Observe cancellation before suppressing jsdom's unsupported native navigation.
    w.document.addEventListener('click', event => { intercepted = event.defaultPrevented; event.preventDefault(); }, { once: true });
    link.click();
    assert.equal(intercepted, false);
    assert.equal(w.location.pathname, '/');
    assert.equal(w.document.body.dataset.tool, 'merge');
  } finally { dom.window.close(); }
});

test('standalone formatter retains its active header link', () => {
  const dom = new JSDOM(read('jsonc-formatter.html'), { url: 'https://www.joinjson.com/jsonc-formatter', runScripts: 'outside-only' });
  try {
    const w = dom.window;
    w.matchMedia = () => ({ matches: false, addEventListener() {} });
    w.eval(read('assets/header.js'));
    w.eval(read('assets/json-to-zod-ui.js'));
    assert.equal(w.document.querySelector('#tool-menu [aria-current="page"]').getAttribute('href'), '/jsonc-formatter');
  } finally { dom.window.close(); }
});

test('local server opens clean formatter routes, tools and legal links safely', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ['/jsonc-formatter', '/jsonc-formatter/', '/jsonc-formatter.html']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type'), /text\/html/);
      const doc = new JSDOM(await response.text());
      assert.ok(doc.window.document.getElementById('jsonc-input'));
      assert.ok(doc.window.document.querySelector('footer a[href="/jsonc-formatter"]'));
      doc.window.close();
    }
    for (const route of ['/json-diff', '/json-to-typescript', '/json-to-yaml', '/json-to-python', '/json-to-zod', '/curl-to-js', '/curl-to-js.html', '/disclaimer/']) {
      assert.equal((await fetch(base + route)).status, 200, route);
    }
    for (const route of ['/server/ai-server.mjs', '/.env', '/package.json', '/not-a-tool']) {
      assert.equal((await fetch(base + route)).status, 404, route);
    }
  } finally {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
});
