import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
const result = await build({ entryPoints: ['src/editors.mjs'], outfile: 'assets/codemirror.js', bundle: true, format: 'esm', minify: true, target: ['es2020'], legalComments: 'external', metafile: true });
const bytes = await readFile('assets/codemirror.js');
const size = { rawBytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9 }).length, budgetBytes: 150 * 1024 };
await writeFile('editor-size.json', JSON.stringify(size, null, 2) + '\n');
if (size.gzipBytes > size.budgetBytes) throw new Error('Editor gzip budget exceeded');
const packages = Object.keys(result.metafile.inputs).filter(path => path.startsWith('node_modules/')).map(path => { const parts = path.split('/'); return parts[1].startsWith('@') ? parts.slice(1, 3).join('/') : parts[1]; });
const licenses = [];
for (const name of new Set(packages)) {
  for (const file of ['LICENSE', 'LICENSE.txt']) {
    try { licenses.push(name + '\n' + await readFile(join('node_modules', name, file), 'utf8')); break; } catch (_) {}
  }
}
await writeFile('assets/codemirror-LICENSE.txt', licenses.join('\n\n')); 
console.log(`Editor: ${size.rawBytes} bytes; gzip ${size.gzipBytes} bytes (budget ${size.budgetBytes}).`);
