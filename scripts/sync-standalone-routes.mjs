import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { applyMetadata, metadata } from './seo.mjs';

// Directory indexes also work on static preview servers without rewrite support.
export async function syncStandaloneRoutes(root) {
  // Every embedded tool needs a real destination when opened from a standalone page.
  let homepage;
  try { homepage = await readFile(path.join(root, 'index.html'), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (homepage !== undefined) for (const route of Object.keys(metadata).filter(route => route !== '/')) {
    const [title, description] = metadata[route];
    const html = applyMetadata(homepage, route, title, description)
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, '');
    const directory = path.join(root, route.slice(1));
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.html'), html);
  }
  for (const route of ['jsonc-formatter', 'json-to-toml', 'json-to-go', 'json-to-pydantic']) {
    let html;
    try { html = await readFile(path.join(root, route + '.html')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const directory = path.join(root, route);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.html'), html);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await syncStandaloneRoutes(fileURLToPath(new URL('../', import.meta.url)));
}
