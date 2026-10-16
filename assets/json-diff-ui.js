/* Local diff UI. Treat all user keys and values as text, never markup. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('json-diff-tool')) return;
  const inputs = ['a', 'b'].map(side => $('diff-input-' + side));
  const output = $('diff-output-container'), status = $('diff-action-status');
  let library, loading, revision = 0;
  function loadLibrary() {
    if (library) return Promise.resolve(library);
    if (!loading) loading = import('https://cdn.jsdelivr.net/npm/jsondiffpatch@0.7.6/+esm').then(module => {
      library = module; return library;
    }).catch(() => { loading = null; throw new Error('The comparison library could not load. Check your connection and try Compare JSON again.'); });
    return loading;
  }
  function node(tag, text) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function reset() {
    revision++;
    output.replaceChildren(node('p', 'Enter two JSON documents, then select Compare JSON.'));
    status.textContent = '';
  }
  function parseInputs() {
    let valid = true;
    const values = inputs.map((input, index) => {
      const side = index ? 'b' : 'a', badge = $('diff-status-' + side), card = $('diff-card-' + side);
      input.setAttribute('aria-invalid', 'false');
      badge.dataset.state = card.dataset.state = 'empty';
      badge.textContent = 'Enter ' + (index ? 'modified' : 'original') + ' JSON.';
      if (!input.value.trim()) { valid = false; return; }
      try {
        const value = window.JsonDiff.parse(input.value);
        badge.dataset.state = card.dataset.state = 'valid';
        badge.textContent = 'Valid JSON ✓';
        return value;
      } catch (error) {
        valid = false;
        input.setAttribute('aria-invalid', 'true');
        badge.dataset.state = card.dataset.state = 'error';
        if (error instanceof SyntaxError) {
          const detail = window.JsonErrorHelper.checkJson(input.value);
          badge.textContent = 'Error on line ' + (detail.line || input.value.split('\n').length) + ': ' + detail.message;
        } else badge.textContent = error.message;
      }
    });
    return valid ? values : null;
  }
  function render(rows) {
    output.replaceChildren();
    if (!rows.length) { output.append(node('p', 'No differences found. The JSON documents are identical.')); return; }
    const counts = { added: 0, removed: 0, modified: 0 };
    rows.forEach(row => counts[row.status]++);
    const table = node('table');
    table.append(node('caption', counts.added + ' additions · ' + counts.removed + ' deletions · ' + counts.modified + ' modifications'));
    const head = node('thead'), headers = node('tr');
    ['Change / JSON pointer', 'Original JSON', 'Modified JSON'].forEach(label => { const th = node('th', label); th.scope = 'col'; headers.append(th); });
    head.append(headers); table.append(head);
    const body = node('tbody');
    rows.slice(0, 500).forEach(row => {
      const tr = node('tr'); tr.className = 'diff-' + row.status;
      const label = node('th', { added: 'Added', removed: 'Deleted', modified: 'Modified' }[row.status]); label.scope = 'row';
      const path = node('code', row.path); path.className = 'diff-path'; label.append(path); tr.append(label);
      [row.status === 'added' ? undefined : row.before, row.status === 'removed' ? undefined : row.after].forEach(value => {
        const cell = node('td'); cell.append(node('pre', value === undefined ? 'Not present' : JSON.stringify(value, null, 2))); tr.append(cell);
      });
      body.append(tr);
    });
    table.append(body); output.append(table);
    if (rows.length > 500) output.append(node('p', 'Showing the first 500 of ' + rows.length + ' changes. Narrow the input to inspect more.'));
  }
  async function compare() {
    reset();
    const values = parseInputs(), token = revision;
    if (!values) { status.textContent = 'Enter valid JSON in both editors to compare.'; return; }
    status.textContent = 'Comparing JSON…';
    $('diff-compare').setAttribute('aria-busy', 'true');
    try {
      const dependency = await loadLibrary();
      if (token !== revision) return;
      const delta = window.JsonDiff.compare(values[0], values[1], dependency);
      const rows = window.JsonDiff.rows(delta, values[0], values[1]);
      render(rows);
      status.textContent = rows.length ? rows.length + ' changes found.' : 'No differences found.';
    } catch (error) {
      if (token === revision) status.textContent = error.message;
    } finally { $('diff-compare').removeAttribute('aria-busy'); }
  }
  inputs.forEach(input => {
    input.addEventListener('input', () => { reset(); parseInputs(); });
    input.addEventListener('change', () => { reset(); parseInputs(); });
  });
  $('diff-compare').addEventListener('click', compare);
  $('diff-swap').addEventListener('click', () => {
    const left = inputs[0].value;
    inputs[0].value = inputs[1].value; inputs[1].value = left;
    reset(); parseInputs();
    if (inputs.every(input => input.value.trim())) compare();
  });
  $('diff-clear').addEventListener('click', () => {
    inputs.forEach(input => { input.value = ''; });
    document.dispatchEvent(new CustomEvent('jm:diff-clear'));
    reset(); parseInputs(); inputs[0].focus();
  });
  $('diff-example').addEventListener('click', () => {
    inputs[0].value = JSON.stringify({ name: 'Ana', role: 'Designer', removed: true }, null, 2);
    inputs[1].value = JSON.stringify({ name: 'Ana', role: 'Developer', active: true }, null, 2);
    compare();
  });
}());
