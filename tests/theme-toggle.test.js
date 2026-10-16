'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/theme.js'), 'utf8');
function setup(t, {saved, dark = false, blocked = false} = {}) {
  const dom = new JSDOM('<button id="theme-toggle"><span class="theme-toggle-label"></span></button><span id="theme-tooltip"></span><p id="preference-status"></p>', {url:'https://www.joinjson.com', runScripts:'outside-only'});
  t.after(() => dom.window.close());
  const w = dom.window; let change;
  const media = {matches:dark, addEventListener:(_, callback) => {change = callback;}};
  w.matchMedia = () => media;
  if (saved) w.localStorage.setItem('jm:v1:theme', JSON.stringify(saved));
  if (blocked) Object.defineProperty(w, 'localStorage', {get() {throw Error('blocked');}});
  w.eval(source);
  return {w, d:w.document, toggle:w.document.getElementById('theme-toggle'), change(value) {media.matches = value; change();}};
}
test('cycles System, Light, Dark and back to System with explicit accessible action', t => {
  const {w, d, toggle} = setup(t);
  for (const [mode, next] of [['system','light'], ['light','dark'], ['dark','system']]) {
    assert.equal(d.documentElement.dataset.theme, mode);
    assert.match(toggle.getAttribute('aria-label'), new RegExp('switch to ' + next + ' mode'));
    assert.equal(d.getElementById('theme-tooltip').textContent, toggle.getAttribute('aria-label'));
    toggle.click();
    assert.equal(w.localStorage.getItem('jm:v1:theme'), JSON.stringify(next));
  }
  assert.equal(w.localStorage.length, 1);
});
test('restores dark and returns to System', t => {
  const {d, toggle} = setup(t, {saved:'dark'});
  assert.equal(d.documentElement.dataset.theme, 'dark');
  toggle.click(); assert.equal(d.documentElement.dataset.theme, 'system');
});
test('system changes update effective mode but not explicit preferences', t => {
  const {toggle, change} = setup(t, {dark:true});
  assert.match(toggle.getAttribute('aria-label'), /System theme \(dark\)/);
  change(false); assert.match(toggle.getAttribute('aria-label'), /System theme \(light\)/);
  toggle.click(); change(true); assert.match(toggle.getAttribute('aria-label'), /Light theme \(light\)/);
});
test('blocked storage permits theme changes with an announcement', t => {
  const {toggle, d} = setup(t, {blocked:true});
  toggle.click(); assert.equal(d.documentElement.dataset.theme, 'light');
  assert.match(d.getElementById('preference-status').textContent, /storage is unavailable/);
});
