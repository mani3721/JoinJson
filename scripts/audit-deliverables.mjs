// Reproducible full-source audit deliverables; baseline is optional and Git-ignored.
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { buildHome, sizes } from './build-home.mjs';
const root = new URL('../', import.meta.url);
const dir = new URL('../audit/', import.meta.url);
await mkdir(dir, { recursive: true });
const source = await readFile(new URL('index.html', root), 'utf8');
await writeFile(new URL('index.readable.html', dir), source);
const report = await buildHome(new URL('../audit/minified/', import.meta.url));
for (const [name, pattern] of [['home.css', /<style[^>]*>([\s\S]*?)<\/style>/g], ['home.js', /<script>([\s\S]*?)<\/script>/g]]) {
  // CSS's noscript fallback is the same editorial stylesheet, not a second sheet.
  const blocks = [...source.matchAll(pattern)].map(match => match[1]);
  await writeFile(new URL(name, dir), (name.endsWith('.css') ? blocks.slice(0, 2) : blocks).join('\n'));
  const mini = await readFile(new URL('minified/index.html', dir), 'utf8');
  const minBlocks = [...mini.matchAll(pattern)].map(match => match[1]);
  await writeFile(new URL(name.replace('.', '.min.'), dir), (name.endsWith('.css') ? minBlocks.slice(0, 2) : minBlocks).join('\n'));
}
let baseline;
try { baseline = sizes(await readFile(new URL('.audit-baseline/index.html', root), 'utf8')); }
catch { try { baseline = JSON.parse(await readFile(new URL('sizes.json', dir), 'utf8')).before; } catch { baseline = null; } }
await writeFile(new URL('sizes.json', dir), JSON.stringify({ unit: 'bytes; divide by 1024 for KiB', before: baseline, ...report }, null, 2) + '\n');
for (const file of ['sitemap.xml', 'robots.txt']) await cp(new URL(file, root), new URL(file, dir));
console.log(JSON.stringify({ before: baseline, ...report }, null, 2));
