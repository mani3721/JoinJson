// Run after changing inline scripts, JSON-LD, or the homepage minifier.
// The policy covers both readable source and production-minified scripts.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { minifyHome } from './build-home.mjs';
const root = new URL('../', import.meta.url);
const pages = ['index.html', 'curl-to-js.html', '404.html', ...['about', 'contact', 'privacy', 'terms', 'disclaimer', 'deep-merge-vs-shallow-merge-json', 'merge-json-arrays-by-id', 'merge-json-files-python'].map(name => name + '/index.html')];
const hashes = new Set();
for (const page of pages) {
  const html = await readFile(new URL(page, root), 'utf8');
  const variants = page === 'index.html' ? [html, await minifyHome(html)] : [html];
  for (const source of variants) for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc=/.test(match[1])) continue;
    hashes.add("'sha256-" + createHash('sha256').update(match[2]).digest('base64') + "'");
  }
}
let headers = await readFile(new URL('_headers', root), 'utf8');
headers = headers.replace(/script-src(?:-elem)?[^;]*;/g, directive => directive.split(' ')[0] + " 'self' https://www.googletagmanager.com https://cdn.jsdelivr.net/npm/js-yaml@4.3.2/dist/js-yaml.min.js https://cdn.jsdelivr.net/npm/jsondiffpatch@0.7.6/+esm " + [...hashes].join(' ') + ';');
await writeFile(new URL('_headers', root), headers);
const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
const security = headers.split('\n').filter(line => /^  [A-Z][^:]+:/.test(line)).map(line => {
  const index = line.indexOf(':'); return { key: line.slice(2, index), value: line.slice(index + 1).trim() };
});
// Ignore path-specific Cache-Control while translating the global security policy.
config.headers = [
  { source: '/(.*)', headers: security.filter(item => item.key !== 'Cache-Control') },
  { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, must-revalidate' }] },
  { source: '/favicon.svg', headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }] }
];
await writeFile(new URL('vercel.json', root), JSON.stringify(config, null, 2) + '\n');
console.log(`Synchronized ${hashes.size} inline script hashes for source, production, and Vercel.`);
