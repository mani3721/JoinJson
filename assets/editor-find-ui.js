/* In-memory editor find. User text is only inserted as text nodes. */
(function (root) {
  'use strict';
  const mirrored = ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','textIndent','tabSize','whiteSpace','overflowWrap','wordBreak','textAlign','direction'];
  function alignment(style, width, wrap) {
    const result = {};
    mirrored.forEach(key => { result[key] = style[key]; });
    result.width = width + 'px';
    result.whiteSpace = wrap ? 'pre-wrap' : 'pre';
    result.overflowWrap = wrap ? 'break-word' : 'normal';
    result.wordBreak = 'normal';
    return result;
  }
  function visibleMatches(matches, current, text, top, height, lineHeight, columns) {
    if (text.length <= 1048576) return matches;
    if (!Number.isFinite(columns)) columns = text.length + 1;
    // Estimate wrapped visual rows; include overscan and always retain the current match.
    const first = Math.max(0, Math.floor(top / lineHeight) - 20);
    const last = Math.ceil((top + height) / lineHeight) + 20;
    let row = 0, start = 0, end = text.length;
    for (let i = 0; i < text.length;) {
      const newline = text.indexOf('\n', i), stop = newline < 0 ? text.length : newline;
      const rows = Math.max(1, Math.ceil((stop - i) / columns));
      if (row + rows <= first) start = stop + 1;
      else if (row <= first) start = Math.min(stop, i + Math.max(0, first - row) * columns);
      if (row > last) { end = i; break; }
      if (row + rows > last) { end = Math.min(stop, i + (last - row + 1) * columns); break; }
      row += rows; i = stop + 1;
    }
    return matches.filter((m, i) => i === current || m.end >= start && m.start <= end);
  }
  function shortcutAction(event, open, inBar) {
    if (!(event.ctrlKey || event.metaKey) || String(event.key).toLowerCase() !== 'f') return null;
    return open && inBar ? 'browser' : 'editor';
  }
  const api = { alignment, visibleMatches, shortcutAction };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;
  const doc = root.document, engine = root.EditorFind;
  const controllers = [];
  function setup(id, name) {
    const editor = doc.getElementById(id);
    if (!editor) return;
    const inputEditor = editor.tagName === 'TEXTAREA';
    const header = inputEditor ? editor.closest('.editor-pane').querySelector('.editor-heading') : doc.querySelector('.code-toolbar');
    const launch = doc.createElement('button'); launch.type = 'button'; launch.textContent = 'Find';
    launch.setAttribute('aria-label', 'Find in ' + name); launch.setAttribute('aria-expanded', 'false');
    header.append(launch);
    const bar = doc.createElement('div'); bar.className = 'find-bar'; bar.id = id + '-find';
    bar.setAttribute('role', 'search'); bar.setAttribute('aria-label', 'Find in ' + name);
    bar.hidden = true; launch.setAttribute('aria-controls', bar.id);
    const reserve = doc.createElement('div'); reserve.className = 'find-reserve'; reserve.append(bar);
    editor.before(reserve);
    function element(tag, text, parent) { const node = doc.createElement(tag); if (text) node.textContent = text; (parent || bar).append(node); return node; }
    function button(text, label, handler, parent) { const node = element('button', text, parent); node.type = 'button'; node.setAttribute('aria-label', label); node.onclick = handler; return node; }
    const row = element('div'); row.className = 'find-row';
    const label = element('label', 'Find in this JSON', row);
    const query = element('input', '', label); query.type = 'search'; query.autocomplete = 'off'; query.spellcheck = false;
    const count = element('span', '', row); count.setAttribute('aria-live', 'polite'); count.setAttribute('aria-atomic', 'true');
    const previous = button('Previous', 'Previous match', () => navigate(-1), row);
    const next = button('Next', 'Next match', () => navigate(1), row);
    button('Close', 'Close find', close, row);
    const controls = element('div'); controls.className = 'find-controls';
    const scopeGroup = element('div', '', controls); scopeGroup.className = 'find-scope'; scopeGroup.setAttribute('role', 'group'); scopeGroup.setAttribute('aria-label', 'Search scope');
    let scope = 'values';
    const scopes = ['values','keys','all'].map(value => {
      const node = button(value[0].toUpperCase() + value.slice(1), 'Search ' + value, () => {
        scope = value; scopes.forEach((b, i) => b.setAttribute('aria-pressed', String(['values','keys','all'][i] === scope))); search();
      }, scopeGroup);
      node.setAttribute('aria-pressed', String(value === scope)); return node;
    });
    function toggle(text) { const label = element('label', '', controls), node = element('input', '', label); node.type = 'checkbox'; label.append(doc.createTextNode(text)); node.onchange = search; return node; }
    const matchCase = toggle('Match case'), word = toggle('Whole word'), regex = toggle('Regex');
    const error = element('div'); error.className = 'find-error'; error.id = id + '-find-error'; error.setAttribute('role','status'); query.setAttribute('aria-describedby', error.id);
    const position = element('span'); position.className = 'find-position';
    let backdrop, surface;
    if (inputEditor) {
      surface = doc.createElement('div'); surface.className = 'find-surface'; editor.before(surface);
      backdrop = doc.createElement('div'); backdrop.className = 'find-backdrop'; backdrop.setAttribute('aria-hidden','true');
      surface.append(backdrop, editor);
    }
    let open = false, composing = false, matches = [], current = -1, truncated = false, timer, rendering = false;
    const text = () => inputEditor ? editor.value : editor.textContent;
    const opts = () => ({ scope, caseSensitive: matchCase.checked, wholeWord: word.checked, regex: regex.checked, maxMatches: 5000 });
    function updateCount() {
      count.textContent = truncated ? '5,000+ matches' : matches.length ? (current >= 0 ? current + 1 + ' of ' + matches.length : matches.length + ' matches') : 'No matches';
      previous.disabled = next.disabled = !matches.length;
      const loc = current >= 0 ? engine.lineColumn(text(), matches[current].start) : null;
      position.textContent = loc ? 'Line ' + loc.line + ', column ' + loc.column : '';
    }
    function paint() {
      if (!open || rendering) return;
      rendering = true;
      const value = text(), target = inputEditor ? backdrop : editor;
      const style = root.getComputedStyle(editor);
      if (inputEditor) {
        const wrap = editor.wrap !== 'off';
        Object.assign(backdrop.style, alignment(style, editor.clientWidth, wrap));
        backdrop.style.top = style.borderTopWidth;
        backdrop.style.left = style.borderLeftWidth;
      }
      const chosen = visibleMatches(matches, current, value, editor.scrollTop, editor.clientHeight, parseFloat(style.lineHeight) || 24, inputEditor && editor.wrap === 'off' ? Infinity : Math.max(1, Math.floor(editor.clientWidth / (parseFloat(style.fontSize) * 0.6))));
      const fragment = doc.createDocumentFragment(); let offset = 0;
      chosen.forEach(m => {
        fragment.append(doc.createTextNode(value.slice(offset, m.start)));
        const mark = doc.createElement('mark'); mark.textContent = value.slice(m.start, m.end);
        if (matches[current] === m) { mark.className = 'find-current'; mark.setAttribute('aria-label','Current match'); }
        fragment.append(mark); offset = m.end;
      });
      fragment.append(doc.createTextNode(value.slice(offset) + (inputEditor ? '\n' : '')));
      const top = editor.scrollTop, left = editor.scrollLeft;
      target.replaceChildren(fragment);
      if (inputEditor) { backdrop.style.transform = 'translate(' + -left + 'px,' + -top + 'px)'; }
      else { editor.scrollTop = top; editor.scrollLeft = left; }
      rendering = false;
    }
    function search() {
      clearTimeout(timer); timer = null; if (!open || composing) return;
      const result = engine.findMatches(text(), query.value, opts());
      matches = result.matches; truncated = result.truncated; current = -1;
      error.textContent = result.error || ''; query.setAttribute('aria-invalid', String(!!result.error));
      updateCount(); paint();
    }
    function schedule() { clearTimeout(timer); if (!composing) timer = setTimeout(search, 150); }
    function navigate(dir) {
      if (!open) return; searchIfPending(); if (!matches.length) return;
      current = current < 0 ? engine.nextIndex(matches, inputEditor ? editor.selectionStart : 0, dir < 0 ? 'prev' : 'next') : (current + dir + matches.length) % matches.length;
      updateCount(); paint();
      if (inputEditor) editor.setSelectionRange(matches[current].start, matches[current].end);
      const mark = (inputEditor ? backdrop : editor).querySelector('.find-current');
      if (mark) {
        // Position is in the mirrored scroll coordinate system, including wrapped lines.
        const box = mark.getBoundingClientRect(), viewport = editor.getBoundingClientRect();
        if (box.top < viewport.top || box.bottom > viewport.bottom) editor.scrollTop += box.top - viewport.top - editor.clientHeight / 2;
        if (box.left < viewport.left || box.right > viewport.right) editor.scrollLeft += box.left - viewport.left - editor.clientWidth / 2;
        if (inputEditor) paint();
      }
    }
    function searchIfPending() { if (timer) { clearTimeout(timer); timer = null; search(); } }
    function selection() {
      if (inputEditor) return editor.value.slice(editor.selectionStart, editor.selectionEnd);
      const selected = root.getSelection(); return selected && editor.contains(selected.anchorNode) && editor.contains(selected.focusNode) ? selected.toString() : '';
    }
    function show() {
      const selected = selection();
      if (selected && selected.length < 100 && !/[\r\n]/.test(selected)) query.value = selected;
      open = true; bar.hidden = false; launch.setAttribute('aria-expanded','true');
      launch.textContent = 'Close ×'; launch.setAttribute('aria-label', 'Close find in ' + name);
      if (surface) surface.classList.add('find-active');
      search(); query.focus(); query.select();
    }
    function close() {
      clearTimeout(timer); open = false; bar.hidden = true; launch.setAttribute('aria-expanded','false');
      launch.textContent = 'Find'; launch.setAttribute('aria-label', 'Find in ' + name);
      if (surface) { surface.classList.remove('find-active'); backdrop.replaceChildren(); }
      else { const value = editor.textContent; rendering = true; editor.textContent = value; rendering = false; }
      editor.focus({ preventScroll: true });
      if (current >= 0 && inputEditor && matches[current].end <= text().length) editor.setSelectionRange(matches[current].start, matches[current].end);
      if (current >= 0 && !inputEditor && matches[current].end <= text().length) {
        const range = doc.createRange(), selected = root.getSelection();
        range.setStart(editor.firstChild, matches[current].start); range.setEnd(editor.firstChild, matches[current].end); selected.removeAllRanges(); selected.addRange(range);
      }
    }
    launch.onclick = () => { if (open) close(); else show(); };
    query.addEventListener('input', schedule);
    [editor, query].forEach(node => {
      node.addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
      node.addEventListener('compositionend', () => { composing = false; schedule(); });
    });
    if (inputEditor) {
      editor.addEventListener('input', schedule);
      doc.addEventListener('jm:inputs-changed', schedule);
    }
    let scrollFrame;
    editor.addEventListener('scroll', () => {
      if (open && inputEditor && !scrollFrame) scrollFrame = root.requestAnimationFrame(() => { scrollFrame = null; paint(); });
    });
    const wrapping = doc.getElementById('wrap-lines');
    if (!inputEditor && wrapping) wrapping.addEventListener('change', () => { if (open) paint(); });
    function key(event) {
      const action = shortcutAction(event, open, bar.contains(doc.activeElement));
      if (action) {
        if (action === 'browser') return;
        event.preventDefault(); show();
      } else if (open && event.key === 'Escape') { event.preventDefault(); close(); }
      else if (open && (event.target === query || event.target === editor) && event.key === 'Enter' && !event.isComposing && !composing) { event.preventDefault(); navigate(event.shiftKey ? -1 : 1); }
    }
    editor.addEventListener('keydown', key); bar.addEventListener('keydown', key);
    if (root.ResizeObserver) new root.ResizeObserver(() => { if (open) paint(); }).observe(editor);
    if (!inputEditor) {
      new root.MutationObserver(records => {
        // Our mark mutations preserve text; only search again when external output changes.
        if (open && text() !== lastText) { lastText = text(); schedule(); }
      }).observe(editor, { childList:true, subtree:true, characterData:true });
    }
    let lastText = text();
    controllers.push({ close, id, destroy() {
      if (open) close();
      launch.remove(); reserve.remove();
      if (surface) { surface.before(editor); surface.remove(); }
    }, reset() { query.value = ''; matches = []; current = -1; if (open) close(); } });
  }
  setup('first', 'First JSON'); setup('second', 'Second JSON'); setup('preview', 'Result');
  doc.addEventListener('jm:editor-enhanced', event => {
    const controller = controllers.find(item => item.id === event.detail.id);
    if (controller) controller.destroy();
  });
  const clear = doc.getElementById('clear-data');
  if (clear) clear.addEventListener('click', () => controllers.forEach(controller => controller.reset()));
}(typeof window === 'undefined' ? globalThis : window));
