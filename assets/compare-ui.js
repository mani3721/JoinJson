/* Comparison UI: data stays in memory and is rendered only as text. */
(function () {
  'use strict';
  const api = window.JsonCompare;
  const $ = id => document.getElementById(id);
  let report = null, page = 0, side = false;
  const collapsed = new Set();
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  const value = v => v.present ? JSON.stringify(v.value) : 'Missing';
  function tab(name, focus) {
    ['merge', 'conflicts', 'compare'].forEach(view => {
      const active = view === name;
      $(view + '-tab').setAttribute('aria-selected', String(active));
      $(view + '-tab').tabIndex = active ? 0 : -1;
      $(view + '-panel').hidden = !active;
    });
    if (focus) $(name + '-tab').focus();
  }
  document.addEventListener('jm:tab', event => tab(event.detail, false));
  const views = ['merge', 'conflicts', 'compare'];
  views.forEach((name, index) => {
    $(name + '-tab').addEventListener('click', () => tab(name, false));
    $(name + '-tab').addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
        tab(views[next], true);
      }
    });
  });
  function reset() {
    report = null; page = 0; collapsed.clear();
    ['compare-matrix', 'compare-side', 'compare-summary'].forEach(id => $(id).replaceChildren());
    ['compare-export', 'compare-side-toggle', 'compare-prev', 'compare-next'].forEach(id => { $(id).disabled = true; });
    $('compare-page').textContent = 'No rows';
    $('compare-status').textContent = 'Add at least two valid files, then merge to compare.';
  }
  document.addEventListener('jm:comparison-clear', reset);
  document.addEventListener('jm:comparison', event => {
    try {
      report = event.detail.report || api.compare(event.detail.files, event.detail.options); page = 0; collapsed.clear();
      if (report.names.length !== 2) side = false;
      $('compare-side-toggle').disabled = report.names.length !== 2;
      $('compare-export').disabled = false;
      $('compare-summary').replaceChildren();
      Object.keys(api.labels).forEach(status => {
        const box = element('div', undefined, 'status-' + status);
        box.append(element('dt', api.labels[status]), element('dd', report.counts[status] + ' (' + (report.total ? report.counts[status] * 100 / report.total : 0).toFixed(1) + '%)'));
        $('compare-summary').append(box);
      });
      $('compare-status').textContent = report.total + ' comparison rows across ' + report.names.length + ' files. Counts include record-presence rows. CSV exports all rows, regardless of filters.';
      render();
    } catch (error) { reset(); $('compare-status').textContent = error.message; }
  });
  function addValue(container, v, kept) {
    container.append(element('code', value(v)));
    if (kept) container.append(element('span', 'Kept', 'kept-label'));
  }
  function render() {
    if (!report) return;
    const selection = api.selectRows(report, { filter: $('compare-filter').value, search: $('compare-search').value, hideSame: $('compare-hide-same').checked, sort: $('compare-sort').value, page });
    page = selection.page;
    $('compare-prev').disabled = page === 0; $('compare-next').disabled = page + 1 >= selection.pages;
    $('compare-page').textContent = 'Page ' + (page + 1) + ' of ' + selection.pages + ' · ' + selection.total + ' filtered rows';
    $('compare-side-toggle').setAttribute('aria-pressed', String(side));
    $('compare-matrix').hidden = side; $('compare-side').hidden = !side;
    const surface = side ? $('compare-side') : $('compare-matrix'); surface.replaceChildren();
    if (!selection.rows.length) { surface.append(element('p', 'No rows match these filters.')); return; }
    if (side) {
      selection.rows.forEach(row => {
        const section = element('section', undefined, 'side-row status-' + row.status);
        section.append(element('h3', (row.record ? row.record + ' · ' : '') + row.field), element('p', api.labels[row.status]));
        const columns = element('div', undefined, 'side-columns');
        row.cells.forEach((v, i) => { const box = element('div', undefined, row.status === 'same' ? '' : 'changed-value'); box.append(element('h4', report.names[i])); addValue(box, v, row.kept === i); columns.append(box); });
        section.append(columns); const merged = element('p', 'Merged result: '); addValue(merged, row.merged, false); section.append(merged); surface.append(section);
      });
      return;
    }
    const scroll = element('div', undefined, 'compare-scroll'); scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', 'Comparison matrix; scroll for more files');
    const table = element('table'); table.append(element('caption', 'Source values and merged result'));
    const head = element('thead'), hr = element('tr');
    ['Record / field', 'Status'].concat(report.names.map((name, i) => (i + 1) + '. ' + name), ['Merged result']).forEach(name => { const th = element('th', name); th.scope = 'col'; hr.append(th); });
    head.append(hr); table.append(head); const body = element('tbody');
    const seen = new Set();
    selection.rows.forEach(row => {
      if (report.method === 'join' && !seen.has(row.group)) {
        seen.add(row.group);
        const group = report.groups.find(g => g.id === row.group), tr = element('tr', undefined, 'record-group'), th = element('th'); th.colSpan = report.names.length + 3;
        const button = element('button', (collapsed.has(row.group) ? 'Expand ' : 'Collapse ') + 'record ' + row.record); button.type = 'button'; button.setAttribute('aria-expanded', String(!collapsed.has(row.group)));
        button.addEventListener('click', () => { if (collapsed.has(row.group)) collapsed.delete(row.group); else collapsed.add(row.group); render(); const target = Array.from(surface.querySelectorAll('button')).find(b => b.dataset.group === row.group); if (target) target.focus(); });
        button.dataset.group = row.group; th.append(button);
        if (group && group.missingFiles.length) th.append(element('span', ' Only in some files; missing from: ' + group.missingFiles.map(i => report.names[i]).join(', ')));
        tr.append(th); body.append(tr);
      }
      if (collapsed.has(row.group)) return;
      const tr = element('tr', undefined, 'status-' + row.status), th = element('th', (row.record ? row.record + ' · ' : '') + row.field); th.scope = 'row'; tr.append(th);
      const status = element('td', api.labels[row.status]);
      if (row.missingFiles.length) status.append(element('small', 'Missing from: ' + row.missingFiles.map(i => report.names[i]).join(', ')));
      tr.append(status);
      row.cells.forEach((v, i) => { const td = element('td'); addValue(td, v, row.kept === i); tr.append(td); });
      const merged = element('td'); addValue(merged, row.merged, false); tr.append(merged); body.append(tr);
    });
    table.append(body); scroll.append(table); surface.append(scroll);
  }
  ['compare-filter', 'compare-search', 'compare-sort', 'compare-hide-same'].forEach(id => $(id).addEventListener(id === 'compare-search' ? 'input' : 'change', () => { page = 0; render(); }));
  $('compare-prev').addEventListener('click', () => { page--; render(); });
  $('compare-next').addEventListener('click', () => { page++; render(); });
  $('compare-side-toggle').addEventListener('click', () => { side = !side; render(); });
  $('compare-export').addEventListener('click', () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([api.csv(report)], { type: 'text/csv;charset=utf-8' }));
    const link = element('a'); link.href = url; link.download = 'comparison.csv'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}());
