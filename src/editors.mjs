import { EditorState, Compartment, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, Decoration } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { json } from '@codemirror/lang-json';
import { search, openSearchPanel, closeSearchPanel } from '@codemirror/search';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { replaceDocument, diagnostics, LARGE } from './editor-core.mjs';

const instances = new Map();
const matchEffect = StateEffect.define();
const marks = StateField.define({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) if (effect.is(matchEffect)) value = effect.value;
    return value;
  },
  provide: field => EditorView.decorations.from(field)
});
const colors = HighlightStyle.define([
  { tag: tags.string, class: 'cm-token-string' },
  { tag: tags.propertyName, class: 'cm-token-key' },
  { tag: [tags.number, tags.bool, tags.null], class: 'cm-token-number' },
  { tag: tags.punctuation, class: 'cm-token-punctuation' }
]);
function button(text, action) {
  const node = document.createElement('button'); node.type = 'button'; node.textContent = text;
  node.addEventListener('click', action); return node;
}
function check(text, force = false) { return diagnostics(text, window.JsonErrorHelper.checkJson, force); }
function attach(fallback) {
  if (instances.has(fallback.id)) return instances.get(fallback.id);
  const result = fallback.id === 'preview';
  const code = ['zod-output', 'typescript-output', 'python-output', 'yaml-output'].includes(fallback.id);
  const yamlInput = fallback.id === 'yaml-input';
  const readOnly = result || code;
  const hadFocus = document.activeElement === fallback;
  const initial = result ? (window.JMFlow && window.JMFlow.resultText() || fallback.textContent) : fallback.value;
  const host = document.createElement('div'); host.className = 'cm-host';
  if (result) host.dataset.result = '';
  const wrapping = new Compartment(), attrs = new Compartment();
  let view, syncing = false, lintTimer, searchTimer, searchRun = 0, searchWorker;
  let query = '', scope = 'values', matchCase = false, wholeWord = false, regex = false;
  let matches = [], active = -1, truncated = false, searchError = '', panelNodes, findButton;
  function updateFindButton() {
    if (!findButton) return;
    findButton.textContent = panelNodes ? 'Close ×' : 'Find';
    findButton.setAttribute('aria-expanded', String(!!panelNodes));
    findButton.setAttribute('aria-label', (panelNodes ? 'Close find in ' : 'Find in ') + label);
  }
  const label = fallback.getAttribute('aria-label') || (fallback.id === 'first' ? 'First JSON' : fallback.id === 'second' ? 'Second JSON' : 'JSON input');
  function attributes() {
    return EditorView.contentAttributes.of({ 'aria-label': fallback.getAttribute('aria-label') || label, 'aria-describedby': [fallback.getAttribute('aria-describedby'), fallback.id + '-cm-help'].filter(Boolean).join(' '), 'aria-invalid': fallback.getAttribute('aria-invalid') || 'false', autocapitalize: 'off', spellcheck: 'false' });
  }
  function updateFallback() {
    syncing = true;
    const text = view.state.doc.toString();
    if (!result && !code) { nativeValue.set.call(fallback, text); fallback.dispatchEvent(new Event('input', { bubbles: true })); }
    syncing = false;
  }
  function lint(force = false) {
    clearTimeout(lintTimer);
    if (code || yamlInput) return; // YAML input is validated by its converter, not the JSON linter.
    if (!force && view.state.doc.length > LARGE) { view.dispatch(setDiagnostics(view.state, [])); return; }
    lintTimer = setTimeout(() => view.dispatch(setDiagnostics(view.state, check(view.state.doc.toString(), force))), force ? 0 : 250);
  }
  function paint() {
    const ranges = [];
    // CM only renders its viewport. Limit decorations additionally on huge docs.
    const visible = view.visibleRanges;
    matches.forEach((match, index) => {
      if (view.state.doc.length > 1024 * 1024 && index !== active && !visible.some(r => match.end >= r.from && match.start <= r.to)) return;
      ranges.push(Decoration.mark({ class: index === active ? 'cm-find-hit cm-find-current' : 'cm-find-hit' }).range(match.start, match.end));
    });
    view.dispatch({ effects: matchEffect.of(Decoration.set(ranges, true)) });
    if (panelNodes) {
      panelNodes.count.textContent = truncated ? '5,000+ matches' : matches.length ? (active < 0 ? matches.length + ' matches' : active + 1 + ' of ' + matches.length) : 'No matches';
      panelNodes.error.textContent = searchError;
      panelNodes.input.setAttribute('aria-invalid', String(!!searchError));
      panelNodes.prev.disabled = panelNodes.next.disabled = !matches.length;
      const pos = active >= 0 ? window.EditorFind.lineColumn(view.state.doc.toString(), matches[active].start) : null;
      panelNodes.position.textContent = pos ? 'Line ' + pos.line + ', column ' + pos.column : '';
    }
  }
  function accept(found) { matches = found.matches; truncated = found.truncated; searchError = found.error || ''; active = -1; paint(); }
  function searchNow() {
    clearTimeout(searchTimer);
    const text = view.state.doc.toString(), options = { scope: code ? 'all' : scope, caseSensitive: matchCase, wholeWord, regex, maxMatches: 5000 };
    const token = ++searchRun;
    if (searchWorker) { searchWorker.terminate(); searchWorker = null; }
    if (!query) { accept({ matches: [], truncated: false, error: null }); return; }
    if (text.length > 1024 * 1024 && window.Worker) {
      // The self-hosted engine has no imports/network; importScripts loads it locally.
      const engineURL = new URL('/assets/editor-find.js', location.href).href;
      const source = 'importScripts(' + JSON.stringify(engineURL) + ');onmessage=e=>postMessage(EditorFind.findMatches(e.data.text,e.data.query,e.data.options));';
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      searchWorker = new Worker(url); URL.revokeObjectURL(url);
      searchWorker.onmessage = event => { if (token === searchRun) accept(event.data); searchWorker.terminate(); searchWorker = null; };
      searchWorker.onerror = () => { searchError = 'Search could not run. Try a shorter input or pattern.'; matches = []; paint(); };
      searchWorker.postMessage({ text, query, options });
    } else accept(window.EditorFind.findMatches(text, query, options));
  }
  function scheduleSearch() { clearTimeout(searchTimer); if (panelNodes) searchTimer = setTimeout(searchNow, 150); }
  function navigate(direction) {
    if (!matches.length) return;
    active = active < 0 ? window.EditorFind.nextIndex(matches, view.state.selection.main.head, direction < 0 ? 'prev' : 'next') : (active + direction + matches.length) % matches.length;
    const match = matches[active];
    view.dispatch({ selection: { anchor: match.start, head: match.end }, effects: EditorView.scrollIntoView(match.start, { y: 'center' }) }); paint();
  }
  function close() { closeSearchPanel(view); panelNodes = null; view.dispatch({ effects: matchEffect.of(Decoration.none) }); view.focus(); }
  function panel() {
    const dom = document.createElement('div'); dom.className = 'cm-search-panel'; dom.setAttribute('role', 'search');
    const labelNode = document.createElement('label'); labelNode.textContent = 'Find in this JSON';
    const input = document.createElement('input'); input.type = 'search'; input.value = query; input.autocomplete = 'off'; labelNode.append(input); dom.append(labelNode);
    const count = document.createElement('span'); count.setAttribute('aria-live', 'polite'); dom.append(count);
    const prev = button('Previous', () => navigate(-1)), next = button('Next', () => navigate(1));
    prev.setAttribute('aria-label', 'Previous match'); next.setAttribute('aria-label', 'Next match'); dom.append(prev, next, button('Close', close));
    const scopes = document.createElement('div'); scopes.setAttribute('role', 'group'); scopes.setAttribute('aria-label', 'Search scope'); dom.append(scopes);
    ['values', 'keys', 'all'].forEach(value => {
      const node = button(value[0].toUpperCase() + value.slice(1), () => { scope = value; Array.from(scopes.children).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scope === scope))); searchNow(); });
      node.dataset.scope = value; node.setAttribute('aria-pressed', String(scope === value)); scopes.append(node);
    });
    [['Match case', () => matchCase, value => { matchCase = value; }], ['Whole word', () => wholeWord, value => { wholeWord = value; }], ['Regex', () => regex, value => { regex = value; }]].forEach(([caption, read, write]) => {
      const label = document.createElement('label'), toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = read(); label.append(toggle, document.createTextNode(caption)); dom.append(label);
      toggle.onchange = () => { write(toggle.checked); searchNow(); };
    });
    const error = document.createElement('span'); error.className = 'cm-search-error'; error.setAttribute('role', 'status'); dom.append(error);
    const position = document.createElement('span'); dom.append(position);
    let composing = false;
    input.oncompositionstart = () => { composing = true; clearTimeout(searchTimer); };
    input.oncompositionend = () => { composing = false; query = input.value; scheduleSearch(); };
    input.oninput = () => { if (!composing) { query = input.value; scheduleSearch(); } };
    dom.onkeydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); navigate(event.shiftKey ? -1 : 1); }
      // Intentionally don't intercept a second Mod-f inside the search panel.
    };
    panelNodes = { input, count, prev, next, error, position };
    updateFindButton();
    queueMicrotask(() => { searchNow(); input.focus(); input.select(); });
    return { dom, top: true, destroy() { panelNodes = null; updateFindButton(); } };
  }
  function showFind() {
    const selected = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
    if (selected && selected.length < 100 && !/[\r\n]/.test(selected)) query = selected;
    openSearchPanel(view);
    if (panelNodes) { panelNodes.input.value = query; panelNodes.input.focus(); panelNodes.input.select(); searchNow(); }
    return true;
  }
  const nativeValue = !result ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value') : null;
  const extensions = [lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), ...(code || yamlInput ? [] : [json()]), bracketMatching(), foldGutter(), history(), marks, lintGutter(), EditorState.tabSize.of(2), syntaxHighlighting(colors),
    wrapping.of(EditorView.lineWrapping), attrs.of(attributes()), search({ createPanel: panel }),
    EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
    keymap.of([{ key: 'Mod-f', run: showFind }, { key: 'Escape', run: () => { if (panelNodes) close(); else view.setTabFocusMode(true); return true; } }, ...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
    EditorView.updateListener.of(update => {
      if (update.docChanged && !syncing) { if (!result) updateFallback(); lint(); scheduleSearch(); }
      if (update.viewportChanged && panelNodes && view.state.doc.length > 1024 * 1024) queueMicrotask(paint);
    }),
    EditorView.domEventHandlers({ blur: () => { if (!result && view.state.doc.length > LARGE) lint(true); }, drop: event => {
      const files = event.dataTransfer && Array.from(event.dataTransfer.files); if (readOnly || !files || !files.length) return false;
      event.preventDefault(); const file = files.find(item => /\.json$/i.test(item.name));
      if (file) file.text().then(text => { if (!view.state.doc.length || window.confirm('Replace this JSON with the dropped file?')) replaceDocument(view, text); }).catch(() => {});
      return true;
    } })];
  view = new EditorView({ state: EditorState.create({ doc: initial, extensions }), parent: host });
  // Don't retire fallback UI until construction succeeded.
  document.dispatchEvent(new CustomEvent('jm:editor-enhanced', { detail: { id: fallback.id } }));
  fallback.after(host); fallback.hidden = true;
  const toolbar = document.createElement('div'); toolbar.className = 'cm-toolbar';
  findButton = button('Find', () => { if (panelNodes) close(); else showFind(); });
  updateFindButton();
  toolbar.append(findButton);
  const wrapLabel = document.createElement('label'), wrap = document.createElement('input'); wrap.type = 'checkbox'; wrap.checked = true; wrapLabel.append(wrap, document.createTextNode('Wrap long lines')); toolbar.append(wrapLabel);
  function setWrap(value) { wrap.checked = value; view.dispatch({ effects: wrapping.reconfigure(value ? EditorView.lineWrapping : []) }); }
  wrap.onchange = () => setWrap(wrap.checked);
  if (result) {
    const existingWrap = document.getElementById('wrap-lines'); setWrap(existingWrap.checked); existingWrap.addEventListener('change', () => setWrap(existingWrap.checked));
  } else if (!code && !yamlInput) {
    const format = button('Format JSON', () => { const parsed = window.JsonErrorHelper.checkJson(view.state.doc.toString()); if (parsed.ok) replaceDocument(view, JSON.stringify(parsed.value, null, 2)); });
    toolbar.append(format);
    function valid() { format.disabled = view.state.doc.length > LARGE || !window.JsonErrorHelper.checkJson(view.state.doc.toString()).ok; }
    // Avoid repeated parsing on typing; share the lint debounce interval.
    let formatTimer;
    fallback.addEventListener('input', () => { clearTimeout(formatTimer); formatTimer = setTimeout(valid, 250); }); valid();
  }
  host.before(toolbar);
  const help = document.createElement('p'); help.className = 'cm-help'; help.id = fallback.id + '-cm-help'; help.textContent = 'Press Escape, then Tab to leave the editor. Tab indents by two spaces.'; host.after(help);
  if (!result) {
    Object.defineProperty(fallback, 'value', { configurable: true, get: () => view.state.doc.toString(), set: text => { nativeValue.set.call(fallback, String(text)); if (!syncing) replaceDocument(view, text); } });
    fallback.addEventListener('input', () => { if (!syncing) replaceDocument(view, nativeValue.get.call(fallback)); });
    fallback.focus = () => view.focus();
    fallback.scrollIntoView = options => host.scrollIntoView(options);
    fallback.setSelectionRange = (from, to) => { view.dispatch({ selection: { anchor: Math.min(from, view.state.doc.length), head: Math.min(to, view.state.doc.length) }, scrollIntoView: true }); };
    Object.defineProperty(fallback, 'selectionStart', { configurable: true, get: () => view.state.selection.main.from });
    Object.defineProperty(fallback, 'selectionEnd', { configurable: true, get: () => view.state.selection.main.to });
  }
  const attributeObserver = new MutationObserver(() => { view.dispatch({ effects: attrs.reconfigure(attributes()) }); });
  attributeObserver.observe(fallback, { attributes: true, attributeFilter: ['aria-describedby', 'aria-invalid', 'aria-label'] });
  if (result) {
    new MutationObserver(() => { const full = window.JMFlow && window.JMFlow.resultText() || fallback.textContent; if (full !== view.state.doc.toString()) { syncing = true; replaceDocument(view, full); syncing = false; } }).observe(fallback, { childList: true, characterData: true, subtree: true });
    document.addEventListener('jm:result-ready', event => { syncing = true; replaceDocument(view, event.detail.text); syncing = false; });
  }
  document.getElementById('clear-data')?.addEventListener('click', () => {
    query = ''; matches = []; active = -1; searchRun++;
    if (searchWorker) { searchWorker.terminate(); searchWorker = null; }
    clearTimeout(searchTimer); if (panelNodes) close();
    // Clear document and undo history together; cleared JSON must not be recoverable here.
    syncing = true;
    view.setState(EditorState.create({ doc: '', extensions }));
    syncing = false;
    if (!result) nativeValue.set.call(fallback, '');
  });
  const converter = fallback.id.startsWith('zod-') ? 'zod' : fallback.id.startsWith('typescript-') ? 'typescript' : fallback.id.startsWith('python-') ? 'python' : fallback.id.startsWith('yaml-') ? 'yaml' : fallback.id.startsWith('diff-input-') ? 'diff' : null;
  if (converter) document.addEventListener('jm:' + converter + '-clear', () => {
    syncing = true;
    view.setState(EditorState.create({ doc: '', extensions }));
    nativeValue.set.call(fallback, '');
    syncing = false;
  });
  lint();
  if (hadFocus) view.focus();
  const controller = { view, text: () => view.state.doc.toString(), set: text => replaceDocument(view, text), find: showFind, destroy() { clearTimeout(lintTimer); clearTimeout(searchTimer); searchRun++; if (searchWorker) searchWorker.terminate(); attributeObserver.disconnect(); view.destroy(); } };
  instances.set(fallback.id, controller); return controller;
}
export function enhance() {
  if (window.JMEditors) {
    ['zod-input', 'zod-output', 'typescript-input', 'typescript-output', 'python-json-input', 'python-output', 'yaml-input', 'yaml-output', 'diff-input-a', 'diff-input-b'].forEach(id => { const node = document.getElementById(id); if (node && !node.closest('[hidden]')) { try { attach(node); } catch (_) {} } });
    return;
  }
  window.JMEditors = { get: id => instances.get(id), text: (id, otherwise = '') => instances.has(id) ? instances.get(id).text() : otherwise };
  ['first', 'second', 'preview', 'paste', 'zod-input', 'zod-output', 'typescript-input', 'typescript-output', 'python-json-input', 'python-output', 'yaml-input', 'yaml-output', 'diff-input-a', 'diff-input-b'].forEach(id => { const node = document.getElementById(id); if (node && !(document.getElementById('zod-tool') && ['first', 'second'].includes(id)) && !node.closest('[hidden]')) { try { attach(node); } catch (_) { /* Keep working fallback. */ } } });
  // Advanced inputs are recreated on reorder/fix; do not retain removed JSON views.
  const list = document.getElementById('files');
  if (list) new MutationObserver(() => {
    for (const [id, controller] of instances) if (id.startsWith('format-input-') && !document.contains(controller.view.dom)) { controller.destroy(); instances.delete(id); }
    list.querySelectorAll('textarea').forEach(node => { if (!instances.has(node.id)) { try { attach(node); } catch (_) {} } });
  }).observe(list, { childList: true });
  if (list) list.querySelectorAll('textarea').forEach(attach);
}
