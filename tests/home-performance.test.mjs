import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { minifyHome } from '../scripts/build-home.mjs';
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for (const production of [false, true]) {
  test(`first-paint safeguards (${production ? 'production' : 'readable'})`, async t => {
    const html = production ? await minifyHome(source) : source;
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://www.joinjson.com/' });
    t.after(() => dom.window.close());
    const d = dom.window.document;
    // No startup media mutation, duplicate CSS fallback, fonts, or eager vendors.
    assert.equal(d.getElementById('editorial-styles').media, 'all');
    assert.doesNotMatch(html, /getElementById\(["']editorial-styles["']\)\.media\s*=/);
    assert.equal(d.querySelectorAll('noscript style').length, 0);
    assert.equal(d.querySelectorAll('script[src],link[rel=stylesheet],link[rel=preload][as=font]').length, 0);
    const css = [...d.querySelectorAll('style')].map(n => n.textContent).join('\n');
    assert.match(css, /content-visibility:\s*auto/);
    assert.match(css, /contain-intrinsic-block-size:\s*auto 1000px/);
    // Retain all crawlable content and the complete interactive interface.
    assert.ok(d.querySelector('#merge-guide').textContent.split(/\s+/).length > 500);
    assert.equal(d.querySelectorAll('#faq details').length, 5);
    assert.equal(d.querySelectorAll('.input-card').length, 2);
    assert.equal(d.querySelectorAll('body *').length < 300, true);
    d.getElementById('example').click(); d.getElementById('merge').click();
    assert.equal(d.getElementById('copy').disabled, false);
    assert.equal(d.getElementById('result-output').hidden, false);
    assert.ok(d.querySelectorAll('#result-lines code').length > 0);
  });
}
