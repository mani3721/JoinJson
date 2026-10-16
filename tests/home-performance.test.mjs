import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { minifyHome, inlineHomeStyles } from '../scripts/build-home.mjs';
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for (const production of [false, true]) {
  test(`first-paint safeguards (${production ? 'production' : 'readable'})`, async t => {
    const html = production ? await minifyHome(await inlineHomeStyles(source)) : source;
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://www.joinjson.com/' });
    t.after(() => dom.window.close());
    const d = dom.window.document;
    // No startup media mutation, duplicate CSS fallback, fonts, or eager vendors.
    assert.equal(d.getElementById('editorial-styles').media, 'all');
    assert.doesNotMatch(html, /getElementById\(["']editorial-styles["']\)\.media\s*=/);
    assert.equal(d.querySelectorAll('noscript style').length, 0);
    assert.equal(d.querySelectorAll('link[rel=preload][as=font],link[href*="fonts.googleapis"]').length, 0);
    assert.ok([...d.querySelectorAll('script[src]')].every(n => n.hasAttribute('defer') || n.hasAttribute('async')), 'external scripts must not block parsing');
    const css = [...d.querySelectorAll('style')].map(n => n.textContent).join('\n');
    assert.match(css, /content-visibility:\s*auto/);
    assert.match(css, /contain-intrinsic-block-size:\s*auto 1000px/);
    // Retain all crawlable content and the complete interactive interface.
    assert.ok(d.querySelector('#merge-guide').textContent.split(/\s+/).length > 500);
    assert.equal(d.querySelectorAll('#faq details').length, 5);
    assert.equal(d.querySelectorAll('#inputs .input-card').length, 2);
    assert.equal(d.querySelectorAll('body *').length < 700, true);
    if (production) assert.equal(d.querySelectorAll('link[rel=stylesheet]').length, 0);
    d.getElementById('example').click(); d.getElementById('merge').click();
    assert.equal(d.getElementById('copy').disabled, false);
    assert.equal(d.getElementById('result-output').hidden, false);
    assert.ok(d.querySelectorAll('#result-lines code').length > 0);
  });
}
