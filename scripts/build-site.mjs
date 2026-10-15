import { cp, mkdir } from 'node:fs/promises';
import { buildHome, securityHeaders } from './build-home.mjs';
import { syncSharedLayout } from './shared-layout.mjs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'public');
// Explicit allowlist: never publish credentials, Git history, or server code.
const entries = [
  'index.html', '404.html', 'favicon.svg', 'robots.txt', 'sitemap.xml', 'ads.txt',
  '_headers', 'assets', 'about', 'contact', 'privacy', 'terms', 'disclaimer',
  'deep-merge-vs-shallow-merge-json', 'merge-json-arrays-by-id',
  'merge-json-files-python'
];

await mkdir(output, { recursive: true });
for (const entry of entries) {
  await cp(join(root, entry), join(output, entry), { recursive: true });
}
await syncSharedLayout(output);
await buildHome(output);
const pages = ['index.html', '404.html', ...entries.filter(entry => !entry.includes('.') && entry !== 'assets' && entry !== '_headers').map(entry => entry + '/index.html')];
await securityHeaders(output, pages);
console.log(`Static site ready in public/ (${entries.length} entries); minified homepage and generated CSP headers.`);
