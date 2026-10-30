import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../assets/paste-download.js', import.meta.url), 'utf8');
function setup(t) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://www.joinjson.com/' });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document, get = name => d.getElementById('paste-download-' + name);
  const downloads = [], blobs = [], revoked = [], timers = [];
  w.Blob = Blob;
  w.URL.createObjectURL = blob => { blobs.push(blob); return 'blob:local-' + blobs.length; };
  w.URL.revokeObjectURL = url => revoked.push(url);
  w.setTimeout = fn => timers.push(fn);
  w.HTMLAnchorElement.prototype.click = function () { downloads.push({ name: this.download, href: this.href }); };
  w.eval(script);
  const set = (id, value, event = 'input') => { get(id).value = value; get(id).dispatchEvent(new w.Event(event, { bubbles: true })); };
  return { w, d, get, set, downloads, blobs, revoked, timers };
}

test('homepage exposes labeled controls and disables empty downloads', t => {
  const s = setup(t);
  assert.ok(s.d.querySelector('script[src="/assets/paste-download.js"][defer]'));
  for (const id of ['content', 'type', 'name', 'extension']) assert.ok(s.d.querySelector(`label[for="paste-download-${id}"]`));
  assert.equal(s.get('save').disabled, true);
  assert.equal(s.get('extension-label').hidden, true);
  s.get('save').click();
  assert.equal(s.downloads.length, 0);
  s.set('content', '{}');
  assert.equal(s.get('save').disabled, false);
  s.set('content', '');
  assert.equal(s.get('save').disabled, true);
});

test('every supported type preserves Unicode, whitespace, and even invalid JSON', async t => {
  const s = setup(t);
  const source = '  { invalid JSON }\nconst message = "你好 🚀";\n</script><script>window.executed = true</script>\n\n';
  s.set('content', source);
  s.set('name', 'example');
  for (const option of s.get('type').options) {
    if (option.value === 'custom') continue;
    s.set('type', option.value, 'change');
    s.get('save').click();
    assert.equal(s.downloads.at(-1).name, 'example.' + option.value);
    assert.equal(await s.blobs.at(-1).text(), source);
    assert.equal(s.blobs.at(-1).type, 'application/octet-stream');
    assert.equal(s.get('content').value, source);
  }
  assert.equal(s.w.executed, undefined);
  assert.equal(s.d.querySelectorAll('a[download]').length, 0);
  assert.equal(s.revoked.length, 0);
  s.timers.forEach(fn => fn());
  assert.equal(s.revoked.length, s.downloads.length);
});

test('Jupyter notebooks download as unchanged .ipynb files', async t => {
  const s = setup(t);
  const notebook = '{\n "cells": [],\n "metadata": {},\n "nbformat": 4,\n "nbformat_minor": 5\n}\n';
  assert.ok(s.d.querySelector('#paste-download-type option[value="ipynb"]'));
  s.set('content', notebook);
  s.set('name', 'analysis');
  s.set('type', 'ipynb', 'change');
  assert.equal(s.get('save').textContent, 'Download .ipynb');
  s.get('save').click();
  assert.equal(s.downloads[0].name, 'analysis.ipynb');
  assert.equal(await s.blobs[0].text(), notebook);
});

test('custom extensions validate, update the button, and cannot inject paths', t => {
  const s = setup(t);
  s.set('content', 'type Item = string;');
  s.set('type', 'custom', 'change');
  assert.equal(s.get('extension-label').hidden, false);
  assert.equal(s.get('save').disabled, true);
  for (const invalid of ['../html', 'a/b', '<svg>', '.', 'a..b']) {
    s.set('extension', invalid);
    assert.equal(s.get('save').disabled, true);
    assert.equal(s.get('extension').getAttribute('aria-invalid'), 'true');
  }
  s.set('extension', '.D.TS');
  assert.equal(s.get('save').textContent, 'Download .d.ts');
  assert.equal(s.get('save').disabled, false);
  s.get('save').click();
  assert.equal(s.downloads[0].name, 'snippet.d.ts');
  s.set('type', 'txt', 'change');
  assert.equal(s.get('extension-label').hidden, true);
  assert.equal(s.get('save').disabled, false);
});

test('filenames are safe, defaults work, and matching extensions are not duplicated', t => {
  const s = setup(t);
  s.set('content', ' ');
  for (const [input, expected] of [['', 'snippet.json'], ['data.json', 'data.json'], ['../bad:name', '.._bad_name.json'], ['CON', '_CON.json'], ['...', 'snippet.json']]) {
    s.set('name', input);
    s.get('save').click();
    assert.equal(s.downloads.at(-1).name, expected);
  }
});

test('clear resets content without changing export settings', t => {
  const s = setup(t);
  s.set('content', 'print("hello")');
  s.set('type', 'py', 'change');
  s.set('name', 'hello');
  s.get('clear').click();
  assert.equal(s.get('content').value, '');
  assert.equal(s.get('save').disabled, true);
  assert.equal(s.get('type').value, 'py');
  assert.equal(s.get('name').value, 'hello');
  assert.equal(s.d.activeElement, s.get('content'));
});

test('download failures are reported without destroying pasted content', t => {
  const s = setup(t);
  s.set('content', 'keep me');
  s.w.URL.createObjectURL = () => { throw new Error('unavailable'); };
  s.get('save').click();
  assert.match(s.get('status').textContent, /Unable to download/);
  assert.equal(s.get('content').value, 'keep me');
  assert.equal(s.get('save').disabled, false);
});
