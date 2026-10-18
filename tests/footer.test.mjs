import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { sitePages } from '../scripts/shared-layout.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const metadata = JSON.parse(read('scripts/seo-pages.json'));
const rewrites = JSON.parse(read('vercel.json')).rewrites;

for (const page of sitePages) {
  test(`${page}: one accessible footer with supported, crawlable destinations`, () => {
    const dom = new JSDOM(read(page));
    const home = new JSDOM(read('index.html'));
    try {
      const d = dom.window.document;
      assert.equal(d.querySelectorAll('footer').length, 1);
      const footer = d.querySelector('footer');
      assert.equal(footer.outerHTML, home.window.document.querySelector('footer').outerHTML);
      home.window.close();
      assert.equal(footer.querySelectorAll('nav').length, 4);
      assert.ok(footer.querySelector('#footer-format-heading + ul a[href="/jsonc-formatter"]'));
      for (const nav of footer.querySelectorAll('nav')) {
        assert.ok(nav.querySelector('ul li a[href]'));
        assert.equal(d.getElementById(nav.getAttribute('aria-labelledby'))?.tagName, 'H2');
      }
      for (const link of footer.querySelectorAll('a')) {
        const href = link.getAttribute('href');
        assert.ok(link.textContent.trim());
        assert.ok(href.startsWith('/') && !href.includes('?') && !href.includes('#'));
        if (rewrites.some(rule => rule.source === href && rule.destination === href + '.html')) {
          assert.ok(rewrites.some(rule => rule.source === href && rule.destination === href + '.html'));
          assert.ok(existsSync(new URL('..' + href + '.html', import.meta.url)));
        } else if (href.startsWith('/json-')) {
          assert.ok(metadata[href], href);
          assert.ok(rewrites.some(rule => rule.source === href && rule.destination === href + '/index.html'), href);
        } else {
          const file = href.endsWith('.html') ? href.slice(1) : href.slice(1) + 'index.html';
          assert.ok(existsSync(new URL('../' + file, import.meta.url)), href);
        }
      }
      assert.equal(footer.querySelector('.footer-brand p').textContent,
        'Built for your browser. Simple, fast, and privacy-conscious JSON tools.');
    } finally { dom.window.close(); }
  });
}

for (const year of [2026, 2031]) {
  test(`copyright uses browser year ${year}, even when storage is blocked`, () => {
    const dom = new JSDOM(read('index.html'), { runScripts: 'outside-only' });
    try {
      dom.window.Date = class extends Date { getFullYear() { return year; } };
      dom.window.eval(read('assets/theme.js'));
      assert.equal(dom.window.document.querySelector('.footer-copyright').textContent,
        `© ${year} JoinJson. All rights reserved.`);
    } finally { dom.window.close(); }
  });
}
