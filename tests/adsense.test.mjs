import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function setup(t) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://www.joinjson.com/' });
  t.after(() => dom.window.close());
  const d = dom.window.document, get = id => d.getElementById(id);
  const merge = () => d.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
  const hidden = () => [...d.querySelectorAll('.ad-slot')].every(n => n.hidden);
  return { dom, d, get, merge, hidden };
}
test('original guide is 500+ words, five FAQs and semantic metadata are present', t => {
  const s = setup(t);
  assert.ok(s.get('merge-guide').textContent.trim().split(/\s+/).length >= 500);
  assert.equal(s.get('faq').querySelectorAll('details').length, 5);
  for (const tag of ['h1', 'header', 'main', 'footer']) assert.equal(s.d.querySelectorAll(tag).length, 1);
  assert.ok(s.d.querySelector('meta[name=description]').content);
  assert.equal(s.d.querySelectorAll('.ad-slot').length, 2);
  assert.ok(s.get('result').compareDocumentPosition(s.get('ad-after-result')) & 4);
  assert.ok(s.get('merge-guide').compareDocumentPosition(s.get('ad-before-faq')) & 4);
  assert.ok(s.get('ad-before-faq').compareDocumentPosition(s.get('faq')) & 4);
});
test('slots are hidden empty, shown only after merge, hidden immediately on edit/error/options/clear', t => {
  const s = setup(t); assert.ok(s.hidden());
  s.get('example').click(); assert.ok(s.hidden()); s.merge(); assert.equal(s.hidden(), false);
  s.get('first').value = '{bad}'; s.get('first').dispatchEvent(new s.dom.window.Event('input')); assert.ok(s.hidden());
  s.merge(); assert.ok(s.hidden());
  s.get('example').click(); s.merge(); assert.equal(s.hidden(), false);
  s.get('deep').dispatchEvent(new s.dom.window.Event('change')); assert.ok(s.hidden());
  s.merge(); assert.equal(s.hidden(), false); s.get('clear').click(); assert.ok(s.hidden());
});
test('URL/import errors hide slots even when previous valid JSON and result are retained', async t => {
  const s = setup(t); s.get('example').click(); s.merge(); assert.equal(s.hidden(), false);
  s.get('first-tab-url').click(); s.get('first-url').value = 'http://invalid.example/data.json';
  await s.get('first').closest('article').querySelector('[data-action=load]').onclick();
  assert.ok(s.hidden()); s.merge(); assert.ok(s.hidden());
  s.get('first-tab-paste').click(); s.merge(); assert.equal(s.hidden(), false);
  s.get('first-tab-upload').click();
  const file = s.get('first-file');
  await file.onchange({ target: { files: [{ name: 'bad.txt', size: 1 }] } }); assert.ok(s.hidden());
});
test('default template makes no advertising/CMP requests and policies disclose Google choices', t => {
  const s = setup(t); s.get('example').click(); s.merge();
  assert.equal(s.d.querySelectorAll('iframe,ins.adsbygoogle,script[src*="googlesyndication"],script[src*="doubleclick"],script[src*="fundingchoicesmessages"]').length, 0);
  const privacy = readFileSync(new URL('../privacy/index.html', import.meta.url), 'utf8');
  for (const expected of ['https://policies.google.com/technologies/partner-sites', 'https://adssettings.google.com/', 'https://www.aboutads.info/choices/', 'processed locally', 'source host']) assert.ok(privacy.includes(expected));
  for (const page of ['about', 'contact', 'privacy', 'terms']) {
    const d = new JSDOM(readFileSync(new URL('../' + page + '/index.html', import.meta.url), 'utf8')).window.document;
    for (const tag of ['h1', 'main', 'header', 'footer']) assert.equal(d.querySelectorAll(tag).length, 1, page + ' ' + tag);
    assert.ok(d.querySelector('meta[name=description]').content);
    assert.ok(!d.documentElement.innerHTML.includes('[EMAIL]'));
  }
});
