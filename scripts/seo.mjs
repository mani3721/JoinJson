// Build-time metadata for existing SPA routes; does not alter tool markup or logic.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
export const origin = 'https://www.joinjson.com';
export const metadata = JSON.parse(await readFile(new URL('./seo-pages.json', import.meta.url), 'utf8'));
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
export function applyMetadata(html, route, title, description) {
  html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>' + escape(title) + '</title>');
  const values = { description, 'og:title': title, 'twitter:title': title, 'og:description': description, 'twitter:description': description, 'og:url': origin + route, 'og:site_name': 'JoinJson', 'twitter:card': 'summary_large_image', 'og:image': origin + '/assets/social-card.svg', 'twitter:image': origin + '/assets/social-card.svg', 'og:image:width': '1200', 'og:image:height': '630', 'og:image:alt': 'JoinJson — JSON tools and guides in your browser', 'twitter:image:alt': 'JoinJson — JSON tools and guides in your browser', robots: route === '/404.html' ? 'noindex' : 'index,follow,max-image-preview:large' };
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp('<meta\\s+(?:name|property)="' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s+content="[^"]*"\\s*/?>', 'g');
    const tag = '<meta ' + (key.startsWith('og:') ? 'property' : 'name') + '="' + key + '" content="' + escape(value) + '">';
    if (pattern.test(html)) html = html.replace(pattern, () => tag);
    else html = html.replace('</head>', tag + '\n</head>');
  }
  return html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, '<link rel="canonical" href="' + origin + route + '">');
}
export async function buildSeo(directory) {
  const home = await readFile(join(directory, 'index.html'), 'utf8');
  for (const [route, [title, description]] of Object.entries(metadata)) {
    if (route === '/') continue;
    const destination = join(directory, route.slice(1));
    await mkdir(destination, { recursive: true });
    let html = applyMetadata(home, route, title, description);
    // Home-only structured data must not describe another tool's page.
    html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, '');
    await writeFile(join(destination, 'index.html'), html);
  }
  const client = `/* SEO metadata only; tool behavior stays in its existing controller. */\n(function(){'use strict';const pages=${JSON.stringify(metadata)},origin=${JSON.stringify(origin)};function update(){const key=document.body.dataset.tool==='merge'?'/':'/'+document.body.dataset.tool;const data=pages[key];if(!data)return;document.title=data[0];for(const [name,value] of Object.entries({'description':data[1],'og:title':data[0],'twitter:title':data[0],'og:description':data[1],'twitter:description':data[1],'og:url':origin+key})){const node=document.querySelector('meta[name="'+name+'"],meta[property="'+name+'"]');if(node)node.content=value;}document.querySelector('link[rel="canonical"]').href=origin+key;}document.addEventListener('jm:tool-change',update);update();})();\n`;
  await writeFile(join(directory, 'assets/seo.js'), client);
}
export const root = fileURLToPath(new URL('../', import.meta.url));
