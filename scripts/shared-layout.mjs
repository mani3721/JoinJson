import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const sitePages = [
  'index.html', '404.html', 'about/index.html', 'contact/index.html',
  'privacy/index.html', 'terms/index.html', 'disclaimer/index.html', 'merge-json-files-python/index.html',
  'merge-json-arrays-by-id/index.html', 'deep-merge-vs-shallow-merge-json/index.html'
];

// The homepage is the single source of truth. Keep complete HTML in every page
// so navigation remains usable without JavaScript or client-side fetching.
export async function syncSharedLayout(directory) {
  const home = await readFile(join(directory, 'index.html'), 'utf8');
  const blocks = ['header', 'footer'].map(tag => {
    const pattern = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'g');
    const matches = home.match(pattern);
    if (!matches || matches.length !== 1) throw new Error(`Expected one homepage ${tag}`);
    return [pattern, matches[0]];
  });
  for (const page of sitePages.slice(1)) {
    const path = join(directory, page);
    let html = await readFile(path, 'utf8');
    for (const [pattern, markup] of blocks) {
      if ((html.match(pattern) || []).length !== 1) throw new Error(`Expected one layout block in ${page}`);
      html = html.replace(pattern, () => markup);
    }
    if (!html.includes('href="/assets/site-layout.css"')) {
      html = html.replace('</head>', '<link rel="stylesheet" href="/assets/site-layout.css">\n</head>');
    }
    await writeFile(path, html);
  }
}

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await syncSharedLayout(root);
  console.log('Shared header and footer synchronized from the homepage.');
}
