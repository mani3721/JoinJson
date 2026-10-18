import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const { format } = require('../assets/jsonc-formatter.js');
const root = new URL('../', import.meta.url);
const html = await readFile(new URL('jsonc-formatter.html', root), 'utf8');
// Use the exact pinned browser parser, downloaded by the test command or fetched here.
const parserSource = await (await fetch('https://cdnjs.cloudflare.com/ajax/libs/json5/2.2.3/index.min.js')).text();
const context = vm.createContext({});
vm.runInContext(parserSource, context);
const parser = context.JSON5;
const sample = `// header\n{unquoted: 'hello // not a comment', /* block */ nested: { a: [1, 2,], }, escaped: 'it\\'s fine', hex: 0xff, /* end */}`;

test('preserves comments and JSON5 values with two or four spaces', () => {
  for (const spaces of [2, 4]) {
    const result = format(sample, spaces, false, parser);
    assert.equal(JSON.stringify(parser.parse(result)), JSON.stringify(parser.parse(sample)));
    for (const comment of ['// header', '/* block */', '/* end */']) assert.ok(result.includes(comment));
    assert.ok(result.includes('\n' + ' '.repeat(spaces) + 'unquoted:'));
    assert.equal(format(result, spaces, false, parser), result);
    assert.ok(result.includes('0xff'));
  }
});
test('standard conversion strips comments and trailing commas', () => {
  const result = format(sample, 4, true, parser);
  assert.deepEqual(JSON.parse(result), { unquoted: 'hello // not a comment', nested: { a: [1, 2] }, escaped: "it's fine", hex: 255 });
  assert.ok(!result.includes('/* block */'));
  assert.ok(result.includes('\n    "unquoted"'));
});
test('handles comment positions, escaped strings, unicode and scalar roots', () => {
  for (const source of ['{a/*a*/:/*b*/1/*c*/,/*d*/b:2//e\n}', '[1,// a\n2,/* b */]', "{s:'line\\\ncontinued', url:'https://example.com', x:'/* literal */'}", '{\\u0061: 1}', '/* before */ true // after', '{}', '[]', 'null', '42', "'hello'", '{n:NaN,i:Infinity,m:-Infinity}']) {
    const result = format(source, 2, false, parser);
    assert.equal(JSON.stringify(parser.parse(result)), JSON.stringify(parser.parse(source)));
    assert.equal(format(result, 2, false, parser), result);
  }
});
test('rejects invalid input, missing parser and non-finite JSON export', () => {
  for (const source of ['', '{x:', '{a:1,,}', '{/* unfinished}', '{a:alert(1)}']) assert.throws(() => format(source, 2, false, parser));
  for (const source of ['NaN', '{x:Infinity}', '[-Infinity]']) assert.throws(() => format(source, 2, true, parser), /Infinity or NaN/);
  assert.throws(() => format('{}', 2, false, {}), /could not load/);
});
test('UI formats, converts, invalidates stale output and reports failures', async () => {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://www.joinjson.com/jsonc-formatter' });
  const { window } = dom;
  window.eval(parserSource);
  for (const file of ['assets/jsonc-formatter.js', 'assets/jsonc-formatter-ui.js']) window.eval(await readFile(new URL(file, root), 'utf8'));
  const $ = id => window.document.getElementById(id);
  $('jsonc-input').value = sample;
  $('jsonc-format').click();
  assert.ok($('jsonc-output').value.includes('/* block */'));
  assert.equal($('jsonc-copy').disabled, false);
  let copied;
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async value => { copied = value; } }, configurable: true });
  $('jsonc-copy').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(copied, $('jsonc-output').value);
  $('jsonc-standard').click();
  assert.equal(JSON.parse($('jsonc-output').value).hex, 255);
  $('jsonc-input').dispatchEvent(new window.Event('input'));
  assert.equal($('jsonc-output').value, '');
  assert.equal($('jsonc-copy').disabled, true);
  $('jsonc-input').value = '{broken';
  $('jsonc-format').click();
  assert.equal($('jsonc-input').getAttribute('aria-invalid'), 'true');
  assert.equal($('jsonc-status').dataset.state, 'error');
  dom.window.close();
});
test('page metadata, clean route, build inclusion and CDN security policy', async () => {
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.title, 'JSONC & JSON5 Formatter Online (Supports Comments) | JoinJSON');
  assert.equal(doc.querySelector('meta[name=description]').content, 'Format, validate, and clean JSON5 and JSONC files with comments and trailing commas. 100% client-side, browser-only, and fast.');
  const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
  assert.ok(config.rewrites.some(rule => rule.source === '/jsonc-formatter' && rule.destination === '/jsonc-formatter.html'));
  assert.ok(config.headers[0].headers.find(item => item.key === 'Content-Security-Policy').value.includes('https://cdnjs.cloudflare.com/ajax/libs/json5/2.2.3/index.min.js'));
  const built = await readFile(new URL('public/jsonc-formatter.html', root), 'utf8');
  assert.ok(built.includes('href="/jsonc-formatter"'));
  assert.equal((built.match(/<footer\b/g) || []).length, 1);
});
