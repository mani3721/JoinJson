import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { inlineHomeStyles, minifyHome } from '../scripts/build-home.mjs';
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('index.html', root), 'utf8');

for (const production of [false, true]) {
  test(`inputs reserve their real layout before JavaScript (${production ? 'production' : 'source'})`, async t => {
    const html = production ? await minifyHome(await inlineHomeStyles(source)) : source;
    const dom = new JSDOM(html);
    t.after(() => dom.window.close());
    const d = dom.window.document;
    const cards = [...d.querySelectorAll('#inputs .input-card')];
    assert.equal(cards.length, 2);
    for (const id of ['first', 'second']) {
      assert.ok(d.getElementById(id));
      assert.equal(d.getElementById(id + '-paste').hidden, false);
      assert.equal(d.getElementById(id + '-upload').hidden, true);
      assert.equal(d.getElementById(id + '-url-panel').hidden, true);
    }
    const ids = [...d.querySelectorAll('[id]')].map(n => n.id);
    assert.equal(ids.length, new Set(ids).size, 'no duplicate IDs');
    // Hydration must reuse the server-rendered controls, not duplicate/replace them.
    const hydrated = new JSDOM(html, { runScripts: 'dangerously' });
    t.after(() => hydrated.window.close());
    assert.equal(hydrated.window.document.querySelectorAll('#inputs .input-card').length, 2);
    hydrated.window.document.getElementById('example').click();
    hydrated.window.document.getElementById('merge').click();
    assert.equal(hydrated.window.document.getElementById('copy').disabled, false);
  });
}

test('production embeds every homepage stylesheet in original cascade order', async () => {
  const html = await minifyHome(await inlineHomeStyles(source));
  const d = new JSDOM(html).window.document;
  assert.equal(d.querySelectorAll('link[rel=stylesheet]').length, 0);
  const expected = [...source.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual([...d.querySelectorAll('style[data-source]')].map(n => n.dataset.source), expected);
  assert.ok(expected.includes('/assets/ai-assistant.css'), 'include the AI assistant styles');
});

test('both hosting configurations cache the favicon for 30 days without immutable', async () => {
  const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
  const headers = await readFile(new URL('_headers', root), 'utf8');
  const value = config.headers.find(rule => rule.source === '/favicon.svg').headers.find(h => h.key === 'Cache-Control').value;
  assert.equal(value, 'public, max-age=2592000');
  assert.ok(headers.includes('/favicon.svg\n  Cache-Control: ' + value));
});
