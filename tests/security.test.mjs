import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { minifyHome, securityHeaders } from '../scripts/build-home.mjs';
import { sitePages } from '../scripts/shared-layout.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
function assertAllowed(policy, html, label) {
  const directives = new Map(policy.split(';').map(value => {
    const [name, ...sources] = value.trim().split(/\s+/);
    return [name, sources];
  }));
  for (const name of ['script-src', 'script-src-elem']) {
    const sources = directives.get(name);
    assert.ok(sources, `${label}: missing ${name}`);
    assert.ok(sources.includes("'self'"));
    assert.ok(sources.includes('https://www.googletagmanager.com'));
    assert.ok(!sources.includes("'unsafe-inline'"));
    assert.ok(!sources.includes("'unsafe-eval'"));
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/\bsrc=/.test(match[1])) continue;
      const hash = "'sha256-" + createHash('sha256').update(match[2]).digest('base64') + "'";
      assert.ok(sources.includes(hash), `${label}: ${name} blocks ${hash}; run npm run audit:headers`);
    }
  }
}

test('committed hosting policies allow every source and minified inline script', async () => {
  const headers = await readFile(new URL('_headers', root), 'utf8');
  const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
  const policy = headers.match(/^  Content-Security-Policy: (.+)$/m)[1];
  const vercelPolicy = config.headers.find(rule => rule.source === '/(.*)').headers
    .find(header => header.key === 'Content-Security-Policy').value;
  assert.equal(vercelPolicy, policy);
  for (const page of sitePages) {
    const html = await readFile(new URL(page, root), 'utf8');
    assertAllowed(policy, html, page);
    if (page === 'index.html') assertAllowed(policy, await minifyHome(html), 'minified homepage');
  }
});

test('generated production policy hashes the actual output scripts', async t => {
  const output = await mkdtemp(join(tmpdir(), 'joinjson-csp-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  for (const page of sitePages) {
    const source = await readFile(new URL(page, root), 'utf8');
    const html = page === 'index.html' ? await minifyHome(source) : source;
    const path = join(output, page);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, html);
  }
  const headers = await securityHeaders(output, sitePages);
  const policy = headers.match(/^  Content-Security-Policy: (.+)$/m)[1];
  for (const page of sitePages) assertAllowed(policy, await readFile(join(output, page), 'utf8'), page);
});
