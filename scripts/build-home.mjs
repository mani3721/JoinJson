// Minify only executable JS and CSS: never minify JSON examples or visible prose.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// These small, first-party styles are required before first paint. Embed them in
// document order, rather than deferring CSS and risking an unstyled layout shift.
export async function inlineHomeStyles(source) {
  let output = source;
  for (const match of source.matchAll(/<link rel="stylesheet" href="(\/assets\/[\w-]+\.css)">/g)) {
    const css = await readFile(join(root, match[1]), 'utf8');
    const result = await transform(css, { loader: 'css', minify: true, target: 'es2020' });
    output = output.replace(match[0], () => `<style data-source="${match[1]}">${result.code.trim()}</style>`);
  }
  return output;
}
export async function minifyHome(source) {
  let output = source;
  for (const match of [...source.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)]) {
    const result = await transform(match[2], { loader: 'css', minify: true, target: 'es2020' });
    output = output.replace(match[0], `<style${match[1]}>${result.code.trim()}</style>`);
  }
  for (const match of [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)]) {
    // Worker source uses function.toString(): preserve binding names shared by those functions.
    const result = await transform(match[1], { loader: 'js', minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, target: 'es2020', legalComments: 'none' });
    output = output.replace(match[0], `<script>${result.code.trim().replace(/<\/script/gi, '<\\/script')}</script>`);
  }
  return output;
}
export function sizes(source) {
  const bytes = value => Buffer.byteLength(value);
  const css = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('');
  const js = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('');
  return { html: bytes(source) - bytes(css) - bytes(js), css: bytes(css), js: bytes(js), total: bytes(source), gzip: gzipSync(source, { level: 9 }).length, brotli: brotliCompressSync(source).length };
}
export async function buildHome(outputDirectory) {
  if (outputDirectory instanceof URL) outputDirectory = fileURLToPath(outputDirectory);
  const readable = await readFile(join(root, 'index.html'), 'utf8');
  const minified = await minifyHome(await inlineHomeStyles(readable));
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, 'index.html'), minified);
  return { readable: sizes(readable), minified: sizes(minified) };
}
export async function securityHeaders(outputDirectory, pages) {
  // Every inline executable and JSON-LD block needs a matching production CSP hash.
  const hashes = new Set();
  for (const page of pages) {
    const html = await readFile(join(outputDirectory, page), 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/\bsrc=/.test(match[1])) continue;
      hashes.add("'sha256-" + createHash('sha256').update(match[2]).digest('base64') + "'");
    }
  }
  let headers = await readFile(join(root, '_headers'), 'utf8');
  headers = headers.replace(/script-src(?:-elem)?[^;]*;/g, directive => directive.split(' ')[0] + " 'self' https://www.googletagmanager.com https://cdn.jsdelivr.net/npm/js-yaml@4.3.2/dist/js-yaml.min.js https://cdn.jsdelivr.net/npm/jsondiffpatch@0.7.6/+esm https://cdnjs.cloudflare.com/ajax/libs/json5/2.2.3/index.min.js https://cdn.jsdelivr.net/npm/smol-toml@1.9.1/+esm " + [...hashes].join(' ') + ';');
  await writeFile(join(outputDirectory, '_headers'), headers);
  return headers;
}
