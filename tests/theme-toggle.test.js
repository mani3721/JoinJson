'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/theme.js'), 'utf8');

function setup({saved = null, dark = false, blocked = false} = {}) {
  const attributes = {};
  const label = {};
  const listeners = {};
  const toggle = {
    setAttribute: (name, value) => { attributes[name] = value; },
    querySelector: () => label,
    addEventListener: (name, callback) => { listeners[name] = callback; }
  };
  const status = {isConnected: true};
  const document = {
    documentElement: {dataset: {}},
    getElementById: id => ({'theme-toggle': toggle, 'preference-status': status})[id],
    querySelectorAll: () => []
  };
  let systemChanged;
  const media = {matches: dark, addEventListener: (_, callback) => { systemChanged = callback; }};
  const storage = new Map(saved ? [['jm:v1:theme', JSON.stringify(saved)]] : []);
  const window = {
    document,
    matchMedia: () => media,
    localStorage: {
      getItem(key) { if (blocked) throw Error('blocked'); return storage.get(key) || null; },
      setItem(key, value) { if (blocked) throw Error('blocked'); storage.set(key, value); }
    }
  };
  vm.runInNewContext(source, {window, document});
  return {document, attributes, label, storage, status, click: () => listeners.click(), systemChange(value) { media.matches = value; systemChanged(); }};
}

test('toggles both ways and persists only the theme preference', () => {
  const app = setup();
  assert.equal(app.attributes['aria-pressed'], 'false');
  app.click();
  assert.equal(app.document.documentElement.dataset.theme, 'dark');
  assert.equal(app.attributes['aria-pressed'], 'true');
  assert.equal(app.label.textContent, 'Light');
  assert.equal(app.storage.get('jm:v1:theme'), '"dark"');
  app.click();
  assert.equal(app.document.documentElement.dataset.theme, 'light');
  assert.equal(app.label.textContent, 'Dark');
  assert.deepEqual([...app.storage], [['jm:v1:theme', '"light"']]);
});

test('restores a saved dark preference', () => {
  const app = setup({saved: 'dark'});
  assert.equal(app.attributes['aria-pressed'], 'true');
  app.click();
  assert.equal(app.document.documentElement.dataset.theme, 'light');
});

test('follows system changes until the user chooses a theme', () => {
  const app = setup({dark: true});
  assert.equal(app.attributes['aria-pressed'], 'true');
  app.systemChange(false);
  assert.equal(app.attributes['aria-pressed'], 'false');
  app.click();
  app.systemChange(false);
  assert.equal(app.attributes['aria-pressed'], 'true');
});

test('blocked storage does not prevent switching themes', () => {
  const app = setup({blocked: true});
  app.click();
  assert.equal(app.document.documentElement.dataset.theme, 'dark');
  assert.match(app.status.textContent, /storage is unavailable/);
});
