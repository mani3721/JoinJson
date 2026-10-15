import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Worker as NodeWorker } from 'node:worker_threads';
import { JSDOM } from 'jsdom';
import { minifyHome } from '../scripts/build-home.mjs';
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function setup(t, html = source) {
  const workers = new Set(), urls = new Map(); let count = 0;
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://joinjson.com/', beforeParse(win) {
    win.Blob = Blob;
    win.URL.createObjectURL = blob => { const url = 'blob:test/' + urls.size; urls.set(url, blob); return url; };
    win.URL.revokeObjectURL = url => urls.delete(url);
    win.Worker = class {
      constructor(url) {
        count++; this.stopped = false;
        const blob = urls.get(url);
        this.ready = blob.text().then(code => {
          if (this.stopped) return;
          this.worker = new NodeWorker(`const {parentPort}=require('node:worker_threads'); let onmessage; const postMessage=data=>parentPort.postMessage(data); ${code}; parentPort.on('message',data=>onmessage({data}));`, { eval: true });
          workers.add(this.worker);
          this.worker.on('message', data => this.onmessage?.({ data }));
          this.worker.on('error', error => this.onerror?.(error));
        });
      }
      postMessage(data) { this.ready.then(() => this.worker?.postMessage(data)); }
      terminate() { this.stopped = true; this.worker?.terminate(); }
    };
  } });
  t.after(() => { for (const worker of workers) worker.terminate(); dom.window.close(); });
  const get = id => dom.window.document.getElementById(id);
  const set = (id, value) => { get(id).value = value; get(id).dispatchEvent(new dom.window.Event('input')); };
  return { dom, get, set, count: () => count };
}
async function until(predicate) { for (let i = 0; i < 150; i++) { if (predicate()) return; await wait(20); } throw new Error('Timed out'); }

test('homepage SEO, heading hierarchy, accessible controls, and matching FAQ schema', t => {
  const { dom } = setup(t), d = dom.window.document;
  assert.equal(d.querySelectorAll('title').length, 1);
  assert.ok(d.title.length >= 50 && d.title.length <= 60, d.title.length);
  const description = d.querySelector('meta[name=description]').content;
  assert.ok(description.length >= 140 && description.length <= 160, description.length);
  assert.match(d.title.toLowerCase(), /merge json/); assert.match(description.toLowerCase(), /merge json/);
  assert.equal(d.querySelectorAll('h1').length, 1);
  let level = 0; for (const h of d.querySelectorAll('h1,h2,h3,h4')) { const next = +h.tagName[1]; assert.ok(next <= level + 1); level = next; }
  for (const name of ['robots', 'theme-color', 'viewport', 'twitter:card', 'twitter:title', 'twitter:description']) assert.ok(d.querySelector(`meta[name="${name}"]`));
  assert.equal(d.documentElement.lang, 'en');
  const data = [...d.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent));
  assert.ok(data.find(item => item['@type'] === 'WebApplication'));
  const faq = data.find(item => item['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, 5);
  [...d.querySelectorAll('#faq details')].forEach((item, i) => {
    assert.equal(faq.mainEntity[i].name, item.querySelector('summary').textContent);
    assert.equal(faq.mainEntity[i].acceptedAnswer.text, item.querySelector('p').textContent);
  });
  for (const button of d.querySelectorAll('.icon-button')) assert.ok(button.getAttribute('aria-label'));
  for (const image of d.images) { assert.ok(image.hasAttribute('alt')); assert.ok(image.width && image.height); }
  assert.equal(d.getElementById('editorial-styles').media, 'all');
});
for (const minified of [false, true]) {
  test(`large merge uses a lazy worker, preserves full exports, bounds preview (${minified ? 'minified' : 'readable'})`, async t => {
    const s = setup(t, minified ? await minifyHome(source) : source);
    assert.equal(s.count(), 0);
    const data = Array.from({ length: 18000 }, (_, i) => ({ id: i, name: 'Item ' + i }));
    s.set('first', JSON.stringify({ items: data })); s.set('second', '{"added":true}');
    await until(() => !s.get('merge').disabled);
    s.get('merge').click(); assert.equal(s.get('merge').getAttribute('aria-busy'), 'true');
    await until(() => !s.get('copy').disabled);
    assert.equal(s.count(), 1);
    assert.ok(s.get('result-lines').children.length <= 5000);
    assert.equal(s.get('preview-notice').hidden, false);
    let copied; Object.defineProperty(s.dom.window.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
    await s.get('copy').onclick(); assert.equal(JSON.parse(copied).items.length, data.length);
    assert.equal(JSON.parse(copied).added, true);
    s.get('format-result').click(); await s.get('copy').onclick(); assert.equal(JSON.parse(copied).items.length, data.length);
  });
}
test('clear cancels a pending large merge and prevents stale output', async t => {
  const s = setup(t);
  s.set('first', JSON.stringify({ data: 'a'.repeat(300000) })); s.set('second', '{}');
  await until(() => !s.get('merge').disabled);
  s.get('merge').click(); s.get('clear').click(); await wait(100);
  assert.equal(s.get('copy').disabled, true); assert.equal(s.get('result-output').hidden, true);
});
