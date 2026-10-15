// One-time migration helper. Uses the saved pre-audit homepage, never overwrites from an unknown source.
import { readFile, writeFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { JSDOM } from 'jsdom';
const original = await readFile(new URL('../.audit-baseline/index.html', import.meta.url), 'utf8');
let html = original;
const title = 'Merge JSON Files Online — Free & Private | JoinJson';
const description = 'Merge JSON files online: paste, upload, or load a URL. Combine nested objects, review highlighted changes, and download results privately in your browser.';
html = html.replace(/<title>.*?<\/title>/, `<title>${title.replace('&', '&amp;')}</title>`)
  .replace(/(<meta name="description" content=")[^"]+/, '$1' + description)
  .replace(/(<meta property="og:title" content=")[^"]+/, '$1' + title.replace('&', '&amp;'))
  .replace(/(<meta property="og:description" content=")[^"]+/, '$1' + description);
const doc = new JSDOM(original).window.document;
const faq = [...doc.querySelectorAll('#faq details')].map(item => ({ '@type': 'Question', name: item.querySelector('summary').textContent, acceptedAnswer: { '@type': 'Answer', text: item.querySelector('p').textContent } }));
const metadata = `
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="theme-color" content="#faf8f5">
<meta property="og:site_name" content="JoinJson">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title.replace('&', '&amp;')}">
<meta name="twitter:description" content="${description}">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'JoinJson', url: 'https://joinjson.com/', description, applicationCategory: 'DeveloperApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript and a modern browser', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, isAccessibleForFree: true })}</script>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq })}</script>
`;
html = html.replace('<!-- Google CMP placeholder:', metadata + '<!-- Google CMP placeholder:');
let css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
// These selectors have no static or dynamically created matching element.
css = css.replace(/\.editor-note(?: a)?\{[^}]*\}/g, '').replace(/\.url-notice\{[^}]*\}/g, '')
  .replace('.ad-slot[hidden]{display:none!important}', '')
  .replace('.ad-slot{min-height:280px;margin:128px auto}', '');
// Below-the-fold editorial styles need not block the first tool paint.
const editorialStart = css.indexOf('/* Editorial additions');
const editorial = css.slice(editorialStart).replace(/\/\*[\s\S]*?\*\//g, '');
css = css.slice(0, editorialStart);
const prettyCSS = (await transform(css, { loader: 'css', minify: false })).code;
const prettyEditorial = (await transform(editorial, { loader: 'css', minify: false })).code;
html = html.replace(/<style>[\s\S]*?<\/style>/, `<style>\n${prettyCSS}</style>\n<style id="editorial-styles" media="print">\n${prettyEditorial}</style>\n<noscript><style>${prettyEditorial}</style></noscript>`);
let js = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
js = js.replace("'use strict';", `'use strict';
// Inline tool CSS is critical; enable editorial CSS after parsing, without a blocking request.
document.getElementById('editorial-styles').media = 'all';`);
js = js.replace("let changes = new Map(), totalAdded = 0, totalOverridden = 0;", `let changes = new Map(), totalAdded = 0, totalOverridden = 0;
  let mergeWorker = null, mergeJob = 0, merging = false;
  const WORKER_THRESHOLD = 256 * 1024;`);
js = js.replace("const ready = states.length === 2 && states.every(state => state.valid);", "const ready = !merging && states.length === 2 && states.every(state => state.valid);");
js = js.replace("  function invalidateResult() {", `  function invalidateResult() {
    // Editing, clearing, swapping, or changing options invalidates pending worker results.
    mergeJob++; merging = false;
    if (mergeWorker) { mergeWorker.terminate(); mergeWorker = null; }
    $('merge').removeAttribute('aria-busy');`);
js = js.replace("const count = Math.min(state.editor.value.split('\\n').length, 50000);", `// Count only visible-gutter capacity, without allocating every source line.
    const text = state.editor.value;
    let count = 1, position = -1;
    while (count < 50000 && (position = text.indexOf('\\n', position + 1)) !== -1) count++;`);
const mergeStart = js.indexOf('  function merge() {');
const mergeEnd = js.indexOf('  // Render annotated lines', mergeStart);
js = js.slice(0, mergeStart) + `  // The worker shares the exact parser, merge rules, annotations and bounded renderer.
  // It is created only for large inputs; no external editor or worker library is loaded.
  function workerSource() {
    return [
      "'use strict'; const MAX_DEPTH = " + MAX_DEPTH + "; const MAX_PREVIEW_LINES = " + MAX_PREVIEW_LINES + "; const MAX_PREVIEW_CHARS = " + MAX_PREVIEW_CHARS + ";",
      'const own = ' + own + '; const object = ' + object + '; const pointer = ' + pointer + ';',
      'let changes = new Map(), totalAdded = 0, totalOverridden = 0;',
      parse.toString(), mergeValues.toString(), collectChanges.toString(), previewLines.toString(),
      'onmessage = function(event) { try { const { id, first, second, deep, arrays } = event.data; const base = parse(first); const result = mergeValues(base, parse(second), deep, arrays); collectChanges(base, result); const preview = previewLines(result); postMessage({ id, text: JSON.stringify(result, null, 2), preview, added: totalAdded, overridden: totalOverridden }); } catch(error) { postMessage({ id: event.data.id, error: error.message }); } };'
    ].join('\\n');
  }
  function finishMerge(text, preview, added, overridden) {
    resultText = text; resultReady = true; merging = false;
    totalAdded = added; totalOverridden = overridden;
    $('merge').removeAttribute('aria-busy');
    renderResult(preview);
    ['copy', 'download', 'format-result'].forEach(id => { $(id).disabled = false; });
    updateReady();
    announce('Merged successfully. ' + totalAdded + ' added and ' + totalOverridden + ' overridden keys or values.');
    $('result-heading').focus();
  }
  function merge() {
    if (merging) return;
    const first = states[0].editor.value, second = states[1].editor.value;
    const large = first.length + second.length >= WORKER_THRESHOLD;
    // Preserve immediate Ctrl+Enter for small edits; large inputs are parsed in the worker.
    if (!large || typeof Worker === 'undefined') states.forEach(validate);
    if (!states.every(state => state.valid)) { announce('Both inputs must contain valid JSON before merging.'); return; }
    const deep = $('deep').checked, arrays = $('arrays').value;
    if (large && typeof Worker !== 'undefined') {
      invalidateResult();
      const id = ++mergeJob;
      merging = true; updateReady(); $('merge').setAttribute('aria-busy', 'true');
      announce('Merging JSON…');
      let url;
      try {
        url = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
        mergeWorker = new Worker(url);
        mergeWorker.onmessage = event => {
          if (event.data.id !== mergeJob) return;
          const data = event.data;
          mergeWorker.terminate(); mergeWorker = null;
          if (data.error) { invalidateResult(); announce('Unable to merge: ' + data.error); return; }
          lastResult = null;
          finishMerge(data.text, data.preview, data.added, data.overridden);
        };
        mergeWorker.onerror = () => { invalidateResult(); announce('Unable to merge in a background worker. Check browser security settings.'); };
        mergeWorker.postMessage({ id, first, second, deep, arrays });
      } catch (error) { invalidateResult(); announce('Unable to merge: ' + error.message); }
      finally { if (url) URL.revokeObjectURL(url); }
      return;
    }
    try {
      lastResult = mergeValues(states[0].value, states[1].value, deep, arrays);
      changes = new Map(); totalAdded = totalOverridden = 0;
      collectChanges(states[0].value, lastResult);
      finishMerge(JSON.stringify(lastResult, null, 2), previewLines(lastResult), totalAdded, totalOverridden);
    } catch (error) { invalidateResult(); announce('Unable to merge: ' + error.message); }
  }
` + js.slice(mergeEnd);
// Produce bounded preview data in the worker too, rather than cloning the entire object tree.
js = js.replace("  function renderResult() {\n    const list = $('result-lines'), fragment = document.createDocumentFragment();", "  function previewLines(value) {\n    const lines = [];");
js = js.replace(`      const item = document.createElement('li'), code = document.createElement('code');
      if (kind) { item.className = kind; item.setAttribute('aria-label', kind === 'added' ? 'Added key' : 'Overridden value'); }
      code.textContent = text; item.append(code); fragment.append(item); lineCount++; charCount += text.length; return true;`, `      lines.push({ text, kind }); lineCount++; charCount += text.length; return true;`);
js = js.replace(`    walk(lastResult, '', 0);
    list.replaceChildren(fragment);`, `    walk(value, '', 0);
    return { lines, truncated, lineCount };
  }
  function renderResult(preview) {
    const { lines, truncated, lineCount } = preview;
    const fragment = document.createDocumentFragment();
    for (const { text, kind } of lines) {
      const item = document.createElement('li'), code = document.createElement('code');
      if (kind) { item.className = kind; item.setAttribute('aria-label', kind === 'added' ? 'Added key' : 'Overridden value'); }
      code.textContent = text; item.append(code); fragment.append(item);
    }
    $('result-lines').replaceChildren(fragment);`);
// Worker results are already formatted. Avoid re-parsing/serializing large outputs on Format.
js = js.replace("resultText = JSON.stringify(lastResult, null, 2); renderResult(); announce('Result formatted with two-space indentation.');", "announce('Result formatted with two-space indentation.');");
js = js.replace("ad.style.display = 'block';", "");
// esbuild only removes genuinely dead bindings; shared legacy assets are intentionally untouched.
const prettyJS = (await transform(js, { loader: 'js', target: 'es2020', minify: false, legalComments: 'inline' })).code;
html = html.replace(/<script>[\s\S]*?<\/script>/, `<script>\n${prettyJS}</script>`);
html = html.replace('.ad-slot ins {', '.ad-slot ins {');
// Inline display assignment replaced by a scoped class rule.
html = html.replace('<style id="editorial-styles" media="print">', '<style id="editorial-styles" media="print">\n.ad-mount .adsbygoogle { display: block; }');
await writeFile(new URL('../index.html', import.meta.url), html);
console.log('Readable homepage updated; production minification is a separate reproducible build step.');
