import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'public');
// Explicit allowlist: never publish credentials, Git history, or server code.
const entries = [
  'index.html', '404.html', 'favicon.svg', 'robots.txt', 'sitemap.xml', 'ads.txt',
  '_headers', 'assets', 'about', 'contact', 'privacy', 'terms',
  'deep-merge-vs-shallow-merge-json', 'merge-json-arrays-by-id',
  'merge-json-files-python'
];

await mkdir(output, { recursive: true });
for (const entry of entries) {
  await cp(join(root, entry), join(output, entry), { recursive: true });
}
console.log(`Static site ready in public/ (${entries.length} entries).`);
