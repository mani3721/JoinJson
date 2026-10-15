/* UI orchestration only. All JSON stays in memory; no storage or network. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('quick')) return;
  const engine = window.JsonMerger;
  let files = [], current = null, mode = 'quick', revision = 0, worker = null, timer, progress, firstAuto = true, toastTimer;
  let formatReport = null, manualMethod = false, undoState = null, undoTimer;
  const formatter = window.JsonFormat;
  function notify(message) { $('status').textContent = message; }
  function tab(name) { document.dispatchEvent(new CustomEvent('jm:tab', { detail: name })); }
  function stop() { revision++; if (worker) worker.terminate(); worker = null; clearTimeout(progress); $('result-card').removeAttribute('aria-busy'); }
  let resultCurrent = false;
  function syncMode() {
    $('quick').hidden = mode !== 'quick'; $('advanced').hidden = mode !== 'advanced';
    $('quick-mode').setAttribute('aria-pressed', String(mode === 'quick'));
    $('mode-toggle').setAttribute('aria-pressed', String(mode === 'advanced'));
    $('mode-toggle').setAttribute('aria-expanded', String(mode === 'advanced'));
  }
  function state(label, busy) {
    const blocked = !formatReport || formatReport.errors > 0;
    ['merge', 'mobile-merge'].forEach(id => {
      $(id).textContent = 'Merge';
      $(id).disabled = busy || blocked;
      $(id).setAttribute('aria-disabled', String(busy || blocked));
    });
    $('merge-progress').hidden = !busy;
    const status = $('merge-block-reason');
    let message, problem;
    if (busy) message = 'Merging…';
    else if (mode === 'quick' && !$('first').value.trim() && !$('second').value.trim()) message = 'Add JSON to both boxes';
    else if (mode === 'quick' && !$('first').value.trim()) message = 'Add the first JSON';
    else if (mode === 'quick' && !$('second').value.trim()) message = 'Add the second JSON';
    else if (blocked) {
      problem = formatReport && formatReport.items.find(item => item.severity === 'error');
      message = problem ? 'Fix the error in ' + problem.name : 'Add JSON inputs';
    } else if (resultCurrent && current) {
      const count = current.output.conflicts.length;
      message = 'Merged · ' + (count ? count + ' conflicts' : 'no conflicts');
    } else message = 'Ready to merge';
    // Avoid repeating live announcements when the visible state has not changed.
    if (status.textContent !== message) {
      status.replaceChildren();
      if (problem) {
        const link = document.createElement('a');
        link.href = '#' + (mode === 'quick' ? (problem.index ? 'second' : 'first') : 'format-input-' + problem.index);
        link.textContent = message;
        link.onclick = event => {
          event.preventDefault();
          const input = $(mode === 'quick' ? (problem.index ? 'second' : 'first') : 'format-input-' + problem.index);
          if (input) { input.focus(); input.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }
        };
        status.append(link);
      } else status.textContent = message;
    }
  }
  function clear(message) {
    stop(); current = null; resultCurrent = false; state('Merge JSON', false); notify(message);
    ['copy', 'copy-box', 'download', 'mobile-download', 'csv'].forEach(id => { $(id).disabled = true; });
    $('empty-result').hidden = false; $('code-box').hidden = true; $('review-conflicts').hidden = true;
    $('conflicts').replaceChildren(); $('conflict-count').textContent = '0';
    $('result-metrics').textContent = 'Not merged'; $('result-chip').textContent = 'Ready';
    document.dispatchEvent(new CustomEvent('jm:comparison-clear'));
  }
  function changed() {
    document.dispatchEvent(new CustomEvent('jm:inputs-changed'));
    clearTimeout(timer); stop(); resultCurrent = false;
    if (current) { $('result-chip').textContent = 'Out of date'; notify('Inputs or options changed. Previous result is out of date.'); }
    else notify('Inputs or options changed. Select Merge JSON, or leave auto-merge on.');
    checkFormats(); state('Merge JSON', false);
    if ($('auto-merge').checked && !formatReport.errors) timer = setTimeout(() => run(false), 250);
  }
  function options() { return { method: $('method').value, key: $('key').value.trim(), recordsPath: $('records-path').value.trim(), winner: $('winner').value, lists: $('lists').value, caseInsensitive: $('case-insensitive').checked, keepNoKey: $('keep-no-key').checked }; }
  function job() {
    return { quick: mode === 'quick', files: mode === 'quick' ? [{ name: 'First JSON', text: $('first').value }, { name: 'Second JSON', text: $('second').value }] : files, options: options(), format: $('format').value };
  }
  function calculate(job, merger, compare) {
    return formatter.calculate(job, merger, compare);
  }
  function snapshot() { return JSON.parse(JSON.stringify({ files: job().files, quickInputs: [$('first').value, $('second').value], advancedFiles: files, options: options(), mode, format: $('format').value })); }
  function applySnapshot(saved) {
    mode = saved.mode === 'quick' && saved.files.length === 2 ? 'quick' : 'advanced';
    if (mode === 'quick') { $('first').value = saved.files[0].text === undefined ? JSON.stringify(saved.files[0].data, null, 2) : saved.files[0].text; $('second').value = saved.files[1].text === undefined ? JSON.stringify(saved.files[1].data, null, 2) : saved.files[1].text; }
    else { files = saved.files; draw(); }
    if (saved.quickInputs) { $('first').value = saved.quickInputs[0]; $('second').value = saved.quickInputs[1]; }
    if (saved.advancedFiles) { files = saved.advancedFiles; draw(); }
    ['method', 'key', 'winner', 'lists'].forEach(id => { if (saved.options[id] !== undefined) $(id).value = saved.options[id]; });
    $('records-path').value = saved.options.recordsPath || '';
    if (saved.options.caseInsensitive !== undefined) $('case-insensitive').checked = saved.options.caseInsensitive;
    if (saved.options.keepNoKey !== undefined) $('keep-no-key').checked = saved.options.keepNoKey;
    if (saved.format) $('format').value = saved.format;
    syncMode();
    manualMethod = true; changed();
  }
  function applyFix(action, index, value) {
    undoState = snapshot(); clearTimeout(undoTimer);
    applySnapshot(formatter.fix({ files: undoState.files, options: undoState.options, mode: undoState.mode, format: undoState.format }, action, index, value));
    $('format-undo').hidden = false; $('format-undo-status').textContent = 'Fix applied. Undo is available for 10 seconds.';
    undoTimer = setTimeout(() => { undoState = null; $('format-undo').hidden = true; $('format-undo-status').textContent = ''; }, 10000);
  }
  function highlight(item) {
    const input = mode === 'quick' ? $(item.index ? 'second' : 'first') : $('format-input-' + item.index);
    if (item.fix && item.fix.action === 'chooseKey') {
      $('advanced').hidden = false;
      $('key').focus(); if ($('key').select) $('key').select(); return;
    }
    if (!input) return;
    input.focus();
    if (item.offset != null && input.setSelectionRange) {
      input.setSelectionRange(item.offset, Math.min(input.value.length, item.offset + 1));
      const line = input.value.slice(0, item.offset).split('\n').length;
      input.scrollTop = Math.max(0, (line - 3) * 24);
    }
  }
  function fixButtons(container, fix, index) {
    if (!fix) return;
    const choices = fix.action === 'chooseKey' ? fix.keys : [null];
    choices.forEach(key => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = key || (fix.action === 'wrapObjects' && $('key').value === 'id' ? 'Wrap in [ ] and join by id' : fix.label);
      b.onclick = () => applyFix(fix.action, index, key || fix.path || fix.method); container.append(b);
    });
  }
  function checkFormats() {
    const data = job();
    let report = formatter.inspect(data.files, options());
    if (!manualMethod && report.suggestedMethod && report.suggestedMethod !== $('method').value) {
      $('method').value = report.suggestedMethod;
      report = formatter.inspect(data.files, options());
    }
    if (!data.files.length) { report.errors = 1; report.message = 'Cannot merge yet: 1 problem'; report.overall = 'error'; }
    formatReport = report;
    const hasInput = data.files.some(file => file.text === undefined || file.text.trim());
    const hasIssue = report.items.some(item => item.severity !== 'ok' && item.label !== 'No JSON yet') || report.global.some(item => ['info', 'warn', 'error'].includes(item.severity));
    $('format-check').hidden = !hasInput || !hasIssue;
    $('format-status').textContent = report.message;
    $('format-status').setAttribute('role', report.errors ? 'alert' : 'status');
    $('format-rows').replaceChildren(); $('format-global').replaceChildren(); $('format-methods').replaceChildren();
    report.items.forEach(item => {
      const row = document.createElement('div'); row.className = 'format-row'; row.id = 'format-message-' + item.index;
      row.setAttribute('data-severity', item.severity);
      const label = item.severity === 'error' ? 'Cannot merge' : item.severity === 'warn' ? 'Check' : 'Ready';
      const title = document.createElement('strong'); title.textContent = item.name + ' — ' + item.label;
      const chip = document.createElement('span'); chip.className = 'format-chip'; chip.textContent = (item.severity === 'error' ? '× ' : item.severity === 'warn' ? '! ' : '✓ ') + label;
      const message = document.createElement('p'); message.textContent = item.message || 'Ready to merge.';
      if (item.severity === 'error') row.setAttribute('role', 'alert');
      if (item.line) message.textContent += ' Line ' + item.line + ', column ' + item.column + '.';
      row.append(title, chip, message); fixButtons(row, item.fix, item.index);
      if (item.severity === 'error') { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Show problem'; b.onclick = () => highlight(item); row.append(b); }
      $('format-rows').append(row);
      const input = mode === 'quick' ? $(item.index ? 'second' : 'first') : $('format-input-' + item.index);
      const empty = item.label === 'No JSON yet';
      if (input) { input.setAttribute('aria-invalid', String(!empty && item.severity === 'error')); input.setAttribute('aria-describedby', (mode === 'quick' ? 'quick-help ' : '') + row.id); input.setAttribute('data-format-severity', empty ? 'empty' : item.severity); }
      if (mode === 'quick') {
        const inline = $(item.index ? 'second-shape' : 'first-shape');
        const parsed = report.inputs.find(file => file.name === item.name);
        const invalid = !empty && !parsed;
        let text = 'Empty';
        if (invalid) text = 'Invalid · line ' + (item.line || 1);
        else if (parsed) {
          const value = parsed.data;
          text = Array.isArray(value) ? 'Valid · ' + value.length + ' records' : value !== null && typeof value === 'object' ? 'Valid · ' + Object.keys(value).length + ' keys' : 'Valid';
        }
        inline.setAttribute('data-state', empty ? 'empty' : invalid ? 'invalid' : 'valid');
        inline.replaceChildren();
        const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); icon.textContent = empty ? '—' : invalid ? '!' : '✓';
        const caption = document.createElement('span'); caption.textContent = text;
        inline.append(icon, caption);
      }
    });
    report.global.forEach(item => { const row = document.createElement('p'); row.textContent = item.message; fixButtons(row, item.fix, 0); $('format-global').append(row); });
    ['join', 'combine', 'deep'].forEach(method => {
      const result = formatter.inspect(data.files, Object.assign(options(), { method }));
      const badge = result.errors ? 'Not compatible (' + (result.items.find(i => i.severity === 'error') || { message: 'Add JSON first.' }).message + ')' : result.warnings ? 'Works with warnings' : 'Works with your inputs';
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(method === $('method').value));
      const name = method === 'join' ? 'Join records by key' : method === 'combine' ? 'Combine lists' : 'Merge objects'; b.textContent = name + ' — ' + badge;
      if ($('method').options) { const option = Array.from($('method').options).find(o => o.value === method); if (option) option.textContent = name + ' — ' + badge; }
      b.onclick = () => { manualMethod = true; $('method').value = method; changed(); }; $('format-methods').append(b);
    });
    $('key').setAttribute('aria-invalid', String(report.items.some(i => i.fix && i.fix.action === 'chooseKey')));
  }
  $('format-undo').onclick = () => { if (!undoState) return; const saved = undoState; undoState = null; clearTimeout(undoTimer); $('format-undo').hidden = true; $('format-undo-status').textContent = 'Fix undone.'; applySnapshot(saved); };
  $('format-demo').onclick = () => {
    undoState = snapshot(); clearTimeout(undoTimer);
    applySnapshot({ mode: 'quick', files: [{ name: 'First JSON', text: '{"id":1,"name":"Ada"}' }, { name: 'Second JSON', text: '[{"id":1,"name":"Ada Lovelace"}]' }], options: Object.assign(options(), { method: 'join', key: 'id', recordsPath: '' }) });
    $('format-undo').hidden = false; $('format-undo-status').textContent = 'Demo loaded. Undo is available for 10 seconds.';
    undoTimer = setTimeout(() => { undoState = null; $('format-undo').hidden = true; $('format-undo-status').textContent = ''; }, 10000);
  };
  function serialized() { return window.JMEditors ? window.JMEditors.text('preview', current.text) : current.text; }
  function values(cell, value, source) {
    const text = JSON.stringify(value), code = document.createElement('code');
    if (text.length > 120) {
      const details = document.createElement('details'), summary = document.createElement('summary');
      summary.textContent = text.slice(0, 100) + '… Expand'; code.textContent = text; details.append(summary, code); cell.append(details);
    } else { code.textContent = text; cell.append(code); }
    if (source) { const small = document.createElement('small'); small.textContent = source; cell.append(small); }
  }
  function render(result, focus) {
    current = result; resultCurrent = true; state('Merge', false);
    $('result-chip').textContent = 'Merged'; $('empty-result').hidden = true; $('code-box').hidden = false;
    $('preview').textContent = result.text.length > 50000 ? result.text.slice(0, 50000) + '\n… Preview shortened; copy/download contain the full result.' : result.text;
    ['copy', 'copy-box', 'download', 'mobile-download', 'csv'].forEach(id => { $(id).disabled = false; });
    const output = result.output, records = Array.isArray(output.result) ? output.result.length : 1;
    $('result-metrics').textContent = 'Merged ' + result.count + ' inputs, ' + records + (records === 1 ? ' record, ' : ' records, ') + output.conflicts.length + ' conflicts, in ' + Math.round(result.elapsed) + ' ms';
    $('method-description').textContent = result.description;
    $('conflict-count').textContent = output.conflicts.length; $('review-conflicts').hidden = !output.conflicts.length;
    $('conflict-summary').textContent = output.conflicts.length + ' conflicts. Showing up to 200; CSV includes all. Values show sources at the time each conflict was encountered.';
    $('conflicts').replaceChildren();
    output.conflicts.slice(0, 200).forEach(c => {
      const row = document.createElement('tr');
      const path = document.createElement('th'); path.scope = 'row'; path.textContent = c.path; row.append(path);
      const a = document.createElement('td'), b = document.createElement('td'), kept = document.createElement('td');
      values(a, c.previous, c.previousSource); values(b, c.incoming, c.incomingSource);
      kept.textContent = c.resolution === 'later' ? 'Second value — ' + c.incomingSource : c.resolution === 'earlier' ? 'First value — ' + c.previousSource : 'Combined — ' + c.resolution;
      row.append(a, b, kept); $('conflicts').append(row);
    });
    if (result.report) document.dispatchEvent(new CustomEvent('jm:comparison', { detail: { report: result.report } }));
    const warningText = result.warnings && result.warnings.length ? ' Check: ' + result.warnings.join(' ') : '';
    $('result-metrics').textContent += warningText;
    notify('Merged. ' + output.conflicts.length + ' conflicts found.' + warningText);
    const resultEditor = window.JMEditors && window.JMEditors.get('preview');
    if (resultEditor) resultEditor.set(result.text);
    document.dispatchEvent(new CustomEvent('jm:result-ready', { detail: { text: result.text } }));
    if (focus) {
      tab('merge'); $('result-heading').focus({ preventScroll: true });
      $('result-card').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }
  async function run(manual) {
    clearTimeout(timer); stop(); checkFormats();
    if (formatReport.errors) { state('Merge JSON', false); notify(formatReport.message); return; }
    const token = revision, data = job();
    if (data.quick && data.files.some(f => !f.text.trim())) { notify('Add JSON to both editors before merging.'); return; }
    const focus = manual || ($('auto-merge').checked && firstAuto);
    $('result-card').setAttribute('aria-busy', 'true');
    progress = setTimeout(() => { state('Merging…', true); notify('Merging… Processing locally.'); }, 100);
    try {
      const bytes = data.files.reduce((n, f) => n + new Blob([f.text === undefined ? JSON.stringify(f.data) : f.text]).size, 0);
      let result;
      if (bytes > 1024 * 1024) {
        if (!window.Worker) throw new Error('This browser cannot process large inputs in a worker. Use a modern browser or smaller files.');
        const source = 'const merger=(' + window.JsonMergerFactory.toString() + ')();const compare=(' + window.JsonCompareFactory.toString() + ')(merger);const rules=(' + window.MergeFormatRulesFactory.toString() + ')();const checkJson=' + window.JsonErrorHelper.checkJson.toString() + ';const formatter=(' + window.JsonFormatFactory.toString() + ')(rules,checkJson);const calculate=' + calculate.toString() + ';self.onmessage=e=>{try{self.postMessage({result:calculate(e.data,merger,compare)})}catch(error){self.postMessage({error:error.message})}};';
        const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
        worker = new Worker(url); URL.revokeObjectURL(url);
        result = await new Promise((resolve, reject) => { worker.onmessage = e => e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.result); worker.onerror = () => reject(new Error('Worker processing failed. Try smaller files or check browser security settings.')); worker.postMessage(data); });
      } else {
        await new Promise(resolve => setTimeout(resolve, 0));
        result = calculate(data, engine, window.JsonCompare);
      }
      if (token !== revision) return;
      if (worker) worker.terminate(); worker = null; clearTimeout(progress); $('result-card').removeAttribute('aria-busy');
      render(result, focus); firstAuto = false;
    } catch (error) { if (token === revision) { stop(); state('Merge JSON', false); if (current) $('result-chip').textContent = 'Out of date'; notify(error.message); } }
  }
  ['first', 'second'].forEach(id => {
    $(id).addEventListener('input', changed);
    $(id + '-file').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try { $(id).value = await f.text(); changed(); } catch (_) { clear('Could not read the file. Try again or paste its JSON.'); }
      e.target.value = '';
    });
  });
  function draw() {
    $('files').replaceChildren();
    files.forEach((f, i) => {
      const li = document.createElement('li'), name = document.createElement('span'); name.textContent = (i + 1) + '. ' + f.name; li.append(name);
      const editor = document.createElement('textarea'); editor.id = 'format-input-' + i; editor.value = f.text === undefined ? JSON.stringify(f.data, null, 2) : f.text;
      editor.setAttribute('aria-label', 'JSON in ' + f.name); editor.spellcheck = false; editor.autocomplete = 'off';
      editor.oninput = () => { f.text = editor.value; delete f.data; changed(); }; li.append(editor);
      [['Up', -1], ['Down', 1], ['Remove', 0]].forEach(([label, delta]) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', label + ' ' + f.name);
        b.disabled = delta === -1 && i === 0 || delta === 1 && i === files.length - 1;
        b.onclick = () => { if (delta) [files[i], files[i + delta]] = [files[i + delta], files[i]]; else files.splice(i, 1); draw(); changed(); const target = $('files').querySelector('button:not(:disabled)') || $('picker'); target.focus(); }; li.append(b);
      }); $('files').append(li);
    });
  }
  async function addFiles(list) {
    try { const entries = await Promise.all(Array.from(list).map(async f => ({ name: f.name, text: await f.text() }))); files.push(...entries); draw(); changed(); }
    catch (_) { clear('Could not read a file. Try the picker again or paste its contents.'); }
  }
  $('picker').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  $('drop').ondragover = e => e.preventDefault(); $('drop').ondrop = e => { e.preventDefault(); addFiles(e.dataTransfer.files); };
  $('add-paste').onclick = () => { if (!$('paste').value.trim()) return notify('Paste JSON before adding it.'); files.push({ name: $('paste-name').value.trim() || 'Pasted JSON ' + (files.length + 1), text: $('paste').value }); draw(); changed(); };
  function chooseMode(next) { if (mode === next) return; mode = next; syncMode(); changed(); }
  $('quick-mode').onclick = () => chooseMode('quick');
  $('mode-toggle').onclick = () => chooseMode('advanced');
  $('settings').addEventListener('change', e => { if (e.target.id === 'method') manualMethod = true; changed(); }); $('settings').addEventListener('input', e => { if (e.target.type === 'text') changed(); });
  document.addEventListener('jm:preferences-reset', changed);
  $('auto-merge').onchange = () => { if ($('auto-merge').checked) run(false); else { clearTimeout(timer); stop(); state('Merge JSON', false); } };
  ['merge', 'mobile-merge'].forEach(id => { $(id).onclick = () => run(true); });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(true); } });
  $('format').onchange = () => { if (current) run(false); };
  $('clear-data').onclick = () => { files = []; draw();['first', 'second', 'paste', 'paste-name', 'records-path'].forEach(id => { $(id).value = ''; }); firstAuto = true; undoState = null; clearTimeout(undoTimer); $('format-undo').hidden = true; $('format-undo-status').textContent = ''; clear('JSON inputs and results cleared from this page.'); checkFormats(); state('Merge JSON', false); };
  $('review-conflicts').onclick = () => { tab('conflicts'); $('conflicts-tab').focus(); };
  $('wrap-lines').onchange = () => { $('preview').classList.toggle('wrap-lines', $('wrap-lines').checked); };
  function toast(message, anchor) { clearTimeout(toastTimer); const node = $('action-toast'); (anchor.parentElement).append(node); node.textContent = message; node.hidden = false; toastTimer = setTimeout(() => { node.hidden = true; node.textContent = ''; }, 2000); }
  ['copy', 'copy-box'].forEach(id => { $(id).onclick = async () => { if (!current) return; try { await navigator.clipboard.writeText(serialized()); toast('Copied', $(id)); } catch (_) { toast('Clipboard blocked. Use Download JSON.', $(id)); } }; });
  function download(text, name, type, anchor) { const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Download requested', anchor); }
  ['download', 'mobile-download'].forEach(id => { $(id).onclick = () => { if (current) download(serialized(), 'merged.json', 'application/json', $(id)); }; });
  $('csv').onclick = () => { if (current) download(engine.csv(current.output.conflicts), 'conflicts.csv', 'text/csv;charset=utf-8', $('csv')); };
  window.JMFlow = { resultText: () => current ? current.text : '', snapshot, applySnapshot, run, hasData: () => !!current || files.length > 0 || ['first', 'second', 'paste'].some(id => $(id).value.trim()), toast };
  const platform = navigator.userAgentData && navigator.userAgentData.platform || navigator.platform || navigator.userAgent || '';
  $('merge-shortcut').textContent = /Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘ ↵' : 'Ctrl ↵';
  syncMode(); checkFormats(); state('Merge', false);
}());
