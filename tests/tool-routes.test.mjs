import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { syncStandaloneRoutes } from '../scripts/sync-standalone-routes.mjs';
import { JSDOM } from 'jsdom';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const routes = { merge: '/', 'json-to-zod': '/json-to-zod', 'json-to-typescript': '/json-to-typescript', 'json-to-python': '/json-to-python', 'json-to-yaml': '/json-to-yaml', 'json-diff': '/json-diff' };
function app(t, path) {
  const dom = new JSDOM(read('index.html'), { url: 'https://www.joinjson.com' + path, runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  dom.window.eval(read('assets/json-to-zod-ui.js'));
  return dom.window;
}
for (const [tool, path] of Object.entries(routes)) {
  test(`${tool}: direct visits, trailing slashes and legacy queries use clean routes`, t => {
    for (const entry of new Set([path, path === '/' ? path : path + '/', '/?tool=' + tool])) {
      const w = app(t, entry + (entry.includes('?') ? '&' : '?') + 'source=test#editor');
      assert.equal(w.location.pathname, path);
      assert.equal(w.location.search, '?source=test');
      assert.equal(w.location.hash, '#editor');
      assert.equal(w.document.body.dataset.tool, tool);
      assert.equal(w.document.querySelector('#tool-menu [aria-current="page"]').dataset.tool, tool);
      assert.equal(w.document.getElementById('zod-tool').hidden, tool !== 'json-to-zod');
      assert.equal(w.document.getElementById('typescript-tool').hidden, tool !== 'json-to-typescript');
      assert.equal(w.document.getElementById('yaml-converter-tool').hidden, tool !== 'json-to-yaml');
      assert.equal(w.document.getElementById('json-diff-tool').hidden, tool !== 'json-diff');
      // A fresh app at the canonical location simulates reloading a direct link.
      const reload = app(t, w.location.pathname + w.location.search + w.location.hash);
      assert.equal(reload.document.body.dataset.tool, tool);
    }
  });
}
test('every available menu link and SPA transition uses a clean route', t => {
  const w = app(t, '/?source=test'), d = w.document;
  const page = d.documentElement;
  for (const [tool, path] of Object.entries(routes)) {
    const link = d.querySelector(`#tool-menu [data-tool="${tool}"]`);
    assert.equal(link.getAttribute('href'), path);
    link.click();
    assert.equal(w.location.pathname, path);
    assert.equal(w.location.search, '?source=test');
    assert.equal(d.body.dataset.tool, tool);
    assert.equal(d.documentElement, page);
  }
});
test('cross-tool transfers use clean paths and keep JSON out of the URL', t => {
  const w = app(t, '/'), text = '{"private":"sample"}';
  for (const tool of ['json-to-typescript', 'json-to-zod', 'json-to-python', 'json-to-yaml', 'json-diff']) {
    w.document.dispatchEvent(new w.CustomEvent('jm:tool-open', { detail: { tool, text } }));
    assert.equal(w.location.pathname, routes[tool]);
    assert.equal(w.location.search, '');
    assert.equal(w.document.getElementById(tool === 'json-diff' ? 'diff-input-a' : tool === 'json-to-zod' ? 'zod-input' : tool === 'json-to-python' ? 'python-json-input' : tool === 'json-to-yaml' ? 'yaml-input' : 'typescript-input').value, text);
  }
});
test('back and forward restore clean tool routes', async t => {
  const w = app(t, '/');
  w.document.querySelector('[data-tool="json-to-zod"]').click();
  w.document.querySelector('[data-tool="json-to-typescript"]').click();
  async function travel(direction, tool) {
    await new Promise(resolve => {
      w.addEventListener('popstate', resolve, { once: true });
      w.history[direction]();
    });
    assert.equal(w.location.pathname, routes[tool]);
    assert.equal(w.document.body.dataset.tool, tool);
  }
  await travel('back', 'json-to-zod');
  await travel('back', 'merge');
  await travel('forward', 'json-to-zod');
  await travel('forward', 'json-to-typescript');
});
test('static previews include a JSON Diff page with working tool routing and metadata', t => {
  const dom = new JSDOM(read('json-diff/index.html'), { url: 'https://www.joinjson.com/json-diff/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  assert.match(w.document.title, /JSON Diff/);
  assert.equal(w.document.querySelector('link[rel="canonical"]').href, 'https://www.joinjson.com/json-diff');
  assert.equal(w.document.querySelector('script[type="application/ld+json"]'), null);
  w.eval(read('assets/json-to-zod-ui.js'));
  assert.equal(w.document.body.dataset.tool, 'json-diff');
  assert.equal(w.document.getElementById('json-diff-tool').hidden, false);
});
test('build refreshes the JSON Diff static preview from the shared homepage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'joinjson-diff-route-'));
  try {
    for (const marker of ['first version', 'updated version']) {
      await writeFile(path.join(root, 'index.html'), read('index.html').replace('</body>', `<p>${marker}</p></body>`));
      await syncStandaloneRoutes(root);
      const html = await readFile(path.join(root, 'json-diff/index.html'), 'utf8');
      assert.ok(html.includes(`<p>${marker}</p>`));
      assert.ok(html.includes('https://www.joinjson.com/json-diff'));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('deployment rewrites every available converter route to the SPA', () => {
  const config = JSON.parse(read('vercel.json'));
  for (const path of Object.values(routes).filter(path => path !== '/')) {
    assert.ok(config.rewrites.some(rule => rule.source === path && rule.destination === path + '/index.html'));
  }
});
