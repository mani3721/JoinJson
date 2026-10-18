import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHeader } from './header.mjs';

export const sitePages = [
  'index.html', 'curl-to-js.html', 'jsonc-formatter.html', 'json-to-toml.html', 'json-to-go.html', 'json-to-pydantic.html', '404.html', 'about/index.html', 'contact/index.html',
  'privacy/index.html', 'terms/index.html', 'disclaimer/index.html', 'merge-json-files-python/index.html',
  'merge-json-arrays-by-id/index.html', 'deep-merge-vs-shallow-merge-json/index.html'
];

// Render complete shared navigation into every page; no client-side link injection.
export async function syncSharedLayout(directory) {
  const home = await readFile(join(directory, 'index.html'), 'utf8');
  const footer = home.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/g);
  if (!footer || footer.length !== 1) throw new Error('Expected one homepage footer');
  const blocks = [['header', renderHeader()], ['footer', footer[0]]];
  for (const page of sitePages) {
    const path = join(directory, page);
    let html = await readFile(path, 'utf8');
    for (const [tag, markup] of blocks) {
      const pattern = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'g');
      if ((html.match(pattern) || []).length !== 1) throw new Error(`Expected one layout block in ${page}`);
      html = html.replace(pattern, () => markup);
    }
    if (!html.includes('href="/assets/site-layout.css"')) {
      html = html.replace('</head>', '<link rel="stylesheet" href="/assets/site-layout.css">\n</head>');
    }
    if (!html.includes('href="/assets/json-to-zod.css"')) {
      html = html.replace('</head>', '<link rel="stylesheet" href="/assets/json-to-zod.css">\n<script src="/assets/json-to-zod-ui.js" defer></script>\n</head>');
    }
    if (!html.includes('href="/assets/header.css"')) {
      html = html.replace('</head>', '<link rel="stylesheet" href="/assets/header.css">\n<script src="/assets/header.js" defer></script>\n</head>');
    }
    // SEO metadata follows SPA route changes without modifying the tool controller.
    if (page === 'index.html' && !html.includes('src="/assets/seo.js"')) {
      html = html.replace('</head>', '<script src="/assets/seo.js" defer></script>\n</head>');
    }
    await writeFile(path, html);
  }
}

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await syncSharedLayout(root);
  console.log('Shared header and footer synchronized.');
}
