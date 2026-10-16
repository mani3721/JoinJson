import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('diff uses shared editable JSON editors, preserves workspaces and clears history', async t => {
  const dom = new JSDOM(read('index.html'), { url: 'https://www.joinjson.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  for (const name of ['window', 'document', 'navigator', 'MutationObserver', 'HTMLTextAreaElement', 'CustomEvent', 'Event', 'HTMLElement', 'Node', 'Window', 'getComputedStyle']) Object.defineProperty(globalThis, name, { value: name === 'getComputedStyle' ? win.getComputedStyle.bind(win) : name === 'window' ? win : win[name], configurable: true });
  globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win); globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
  win.TextEncoder = TextEncoder;
  win.Range.prototype.getClientRects = () => [];
  win.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  for (const file of ['json-error-helper.js', 'editor-find.js', 'json-to-zod-ui.js', 'json-diff.js', 'json-diff-ui.js']) win.eval(read('assets/' + file));
  const { enhance } = await import('../src/editors.mjs');
  enhance(); assert.equal(win.JMEditors.get('diff-input-a'), undefined);
  win.document.querySelector('[data-tool="json-diff"]').click(); enhance();
  const left = win.JMEditors.get('diff-input-a'), right = win.JMEditors.get('diff-input-b');
  t.after(() => { left?.destroy(); right?.destroy(); dom.window.close(); });
  for (const editor of [left, right]) {
    assert.ok(editor); assert.equal(editor.view.contentDOM.getAttribute('contenteditable'), 'true');
    assert.match(editor.view.dom.parentElement.previousElementSibling.textContent, /Format JSON/);
  }
  left.view.dispatch({ changes: { from: 0, insert: '{"left":true}' } });
  right.view.dispatch({ changes: { from: 0, insert: '{"right":true}' } });
  assert.equal(win.document.getElementById('diff-input-a').value, '{"left":true}');
  win.document.querySelector('[data-tool="json-to-zod"]').click();
  win.document.querySelector('[data-tool="json-diff"]').click();
  assert.equal(left.text(), '{"left":true}');
  win.document.getElementById('diff-input-a').value = '{';
  win.document.getElementById('diff-input-a').dispatchEvent(new win.Event('change'));
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(left.view.contentDOM.getAttribute('aria-invalid'), 'true');
  win.document.getElementById('diff-clear').click();
  const { undo } = await import('@codemirror/commands');
  for (const editor of [left, right]) { assert.equal(editor.text(), ''); assert.equal(undo(editor.view), false); }
});
