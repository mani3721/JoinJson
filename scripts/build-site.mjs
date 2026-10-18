import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildHome, securityHeaders } from './build-home.mjs';
import { syncSharedLayout } from './shared-layout.mjs';
import { syncStandaloneRoutes } from './sync-standalone-routes.mjs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'public');
// Explicit allowlist: never publish credentials, Git history, or server code.
const entries = [
  'index.html', 'curl-to-js.html', 'jsonc-formatter.html', 'json-to-toml.html', 'json-to-go.html', 'json-to-pydantic.html', '404.html', 'favicon.svg', 'robots.txt', 'sitemap.xml', 'ads.txt',
  '_headers', 'assets', 'about', 'contact', 'privacy', 'terms', 'disclaimer',
  'deep-merge-vs-shallow-merge-json', 'merge-json-arrays-by-id',
  'merge-json-files-python'
];

await mkdir(output, { recursive: true });
for (const entry of entries) {
  await cp(join(root, entry), join(output, entry), { recursive: true });
}
await syncSharedLayout(output);
// Keep standalone tools aligned with the homepage's exact styles.
const homepage = await readFile(join(root, 'index.html'), 'utf8');
await writeFile(join(output, 'assets/converter-page.css'), '/* Shared homepage styles for standalone tools. */\n' + homepage.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1]);
await buildHome(output);
await (await import('./seo.mjs')).buildSeo(output);
const pages = ['index.html', 'curl-to-js.html', 'jsonc-formatter.html', 'json-to-toml.html', 'json-to-go.html', 'json-to-pydantic.html', '404.html', ...entries.filter(entry => !entry.includes('.') && entry !== 'assets' && entry !== '_headers').map(entry => entry + '/index.html')];
await securityHeaders(output, pages);
// Support static preview servers that do not read deployment rewrites.
await syncStandaloneRoutes(root);
await syncStandaloneRoutes(output);
console.log(`Static site ready in public/ (${entries.length} entries); minified homepage and generated CSP headers.`);
