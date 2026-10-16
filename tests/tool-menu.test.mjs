import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import { renderHeader, toolGroups } from '../scripts/header.mjs';
import { sitePages } from '../scripts/shared-layout.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function app(t, { mobile = false, hover = false, flat = false, page = 'index.html', url = '/' } = {}) {
  const dom = new JSDOM(read(page), { url: 'https://www.joinjson.com' + url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  t.after(() => w.close());
  if (flat) d.querySelector('header').outerHTML = renderHeader({ flatTools: true, groups: [toolGroups[0]] });
  w.matchMedia = query => ({ matches: query.includes('859') ? mobile : hover, addEventListener() {} });
  w.scrollTo = () => {};
  w.eval(read('assets/header.js'));
  return { w, d, tools: d.getElementById('tools-trigger'), guides: d.getElementById('guides-trigger'), panel: d.getElementById('tool-panel') };
}
test('buttons toggle panels and keep aria-expanded synchronized', t => {
  const { tools, panel } = app(t);
  assert.equal(tools.tagName, 'BUTTON');
  assert.equal(panel.hidden, true);
  tools.click();
  assert.equal(tools.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.hidden, false);
  tools.click();
  assert.equal(tools.getAttribute('aria-expanded'), 'false');
  assert.equal(panel.hidden, true);
});
test('opening Guides closes Tools; Esc closes and returns focus', t => {
  const { w, d, tools, guides, panel } = app(t);
  tools.click(); guides.click();
  assert.equal(panel.hidden, true);
  assert.equal(tools.getAttribute('aria-expanded'), 'false');
  assert.equal(guides.getAttribute('aria-expanded'), 'true');
  d.querySelector('#guides-panel a').focus();
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(d.getElementById('guides-panel').hidden, true);
  assert.equal(d.activeElement, guides);
});
test('outside click and focus departure close panels, internal focus does not', async t => {
  const { d, tools, panel } = app(t);
  tools.click(); d.body.click(); assert.equal(panel.hidden, true);
  tools.click(); tools.focus(); panel.querySelector('a').focus();
  await Promise.resolve(); assert.equal(panel.hidden, false);
  d.querySelector('.brand').focus();
  await Promise.resolve(); assert.equal(panel.hidden, true);
});
test('route and link selection close navigation while tool routing remains intact', t => {
  const { w, d, tools, panel } = app(t);
  w.eval(read('assets/json-to-zod-ui.js'));
  tools.click(); d.querySelector('[data-tool="json-to-zod"]').click();
  assert.equal(w.location.pathname, '/json-to-zod');
  assert.equal(panel.hidden, true);
  assert.equal(d.querySelector('[aria-current="page"]').dataset.tool, 'json-to-zod');
  assert.equal(d.getElementById('zod-tool').hidden, false);
  tools.click(); w.dispatchEvent(new w.PopStateEvent('popstate'));
  assert.equal(panel.hidden, true);
});
test('hover intent opens after 120ms and closes after 200ms; click remains available', async t => {
  const { w, tools, panel } = app(t, { hover: true });
  const region = tools.parentElement;
  region.dispatchEvent(new w.Event('pointerenter'));
  assert.equal(panel.hidden, true);
  await new Promise(resolve => setTimeout(resolve, 145)); assert.equal(panel.hidden, false);
  region.dispatchEvent(new w.Event('pointerleave'));
  await new Promise(resolve => setTimeout(resolve, 225)); assert.equal(panel.hidden, true);
  region.dispatchEvent(new w.Event('pointerenter'));
  tools.click(); assert.equal(panel.hidden, false);
  await new Promise(resolve => setTimeout(resolve, 145)); assert.equal(panel.hidden, false);
});
test('single render flag exposes flat links without a Tools disclosure', t => {
  const { tools, panel, d } = app(t, { flat: true });
  assert.equal(tools.hidden, true); assert.equal(panel.hidden, false);
  assert.equal(d.querySelectorAll('#tool-menu a').length, 2);
  assert.equal(d.querySelector('.join-header').dataset.flatTools, 'true');
});
test('mobile sheet locks scroll, isolates background, cycles focus and restores focus', t => {
  const { w, d, tools, panel } = app(t, { mobile: true });
  const menu = d.getElementById('site-menu-toggle'), shell = d.getElementById('site-navigation');
  const close = d.getElementById('site-menu-close');
  menu.click();
  assert.equal(shell.getAttribute('aria-modal'), 'true');
  assert.equal(d.body.style.overflow, 'hidden');
  assert.equal(d.activeElement, close);
  assert.equal(d.querySelector('main').inert, true);
  const theme = d.getElementById('theme-toggle'); theme.focus();
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  assert.equal(d.activeElement, close);
  tools.click();
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(panel.hidden, true); assert.equal(shell.getAttribute('aria-modal'), 'true');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(shell.hasAttribute('aria-modal'), false);
  assert.equal(d.body.style.overflow, ''); assert.equal(d.activeElement, menu);
  assert.notEqual(d.querySelector('main').inert, true);
});
test('every shared page has identical HTML navigation and existing destination links', t => {
  const config = JSON.parse(read('vercel.json'));
  const paths = new Set(['/', '/merge-json-files-python/', '/merge-json-arrays-by-id/', '/deep-merge-vs-shallow-merge-json/', ...config.rewrites.map(rule => rule.source)]);
  for (const page of sitePages) {
    const { d } = app(t, { page });
    const header = d.querySelector('header');
    const brand = header.querySelector('a.brand');
    assert.equal(brand.getAttribute('href'), '/');
    assert.equal(brand.getAttribute('aria-label'), 'JoinJson home');
    const logo = brand.querySelector('img');
    assert.ok(logo, `Logo present in ${page}`);
    assert.equal(logo.getAttribute('src'), '/favicon.svg');
    assert.equal(logo.getAttribute('width'), '32');
    assert.equal(logo.getAttribute('height'), '32');
    assert.equal(logo.getAttribute('alt'), '');
    assert.match(read('favicon.svg'), /<svg\b/);
    assert.equal(header.querySelectorAll('a').length, 10);
    assert.equal(header.querySelectorAll('[role="menu"]').length, 0);
    assert.equal(header.querySelectorAll('.nav-tool').length, 6);
    assert.doesNotMatch(header.textContent, /Coming soon|Converters \/ Generators|Tool:/);
    for (const a of header.querySelectorAll('a')) assert.ok(paths.has(a.getAttribute('href')), a.href);
    for (const a of header.querySelectorAll('.nav-tool')) {
      assert.equal(a.querySelectorAll('svg[aria-hidden="true"]').length, 1);
      assert.ok(a.querySelector('.nav-description').textContent);
    }
    for (const path of ['/privacy/', '/terms/', '/about/', '/contact/']) assert.ok(d.querySelector(`footer a[href="${path}"]`));
  }
});
test('navigation script stays below 3 kB gzip', () => {
  assert.ok(gzipSync(read('assets/header.js')).length < 3072);
});
