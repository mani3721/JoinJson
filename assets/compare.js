/* Pure comparison functions; no storage, DOM, logging, or network access. */
(function (root) {
  'use strict';
  const merger = typeof module !== 'undefined' && module.exports ? require('./tool.js') : root.JsonMerger;
  function createCompare(merger) {
  const own = (v, k) => v != null && Object.prototype.hasOwnProperty.call(v, k);
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : object(v) ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
  const cell = value => ({ present: true, value });
  const missing = () => ({ present: false });
  const equal = (a, b) => a.present === b.present && (!a.present || canonical(a.value) === canonical(b.value));
  const labels = { same: 'Same in all files', different: 'Different', missing: 'Only in some files' };
  function get(value, parts) {
    for (const part of parts) { if (!own(value, part)) return missing(); value = value[part]; }
    return cell(value);
  }
  const path = parts => parts.length ? '/' + parts.map(k => k.replace(/~/g, '~0').replace(/\//g, '~1')).join('/') : '/';
  function classify(cells) {
    const present = cells.filter(v => v.present);
    // Conflicting present values take precedence over missing files.
    if (new Set(present.map(v => canonical(v.value))).size > 1) return 'different';
    return present.length === cells.length ? 'same' : 'missing';
  }
  function compare(files, options) {
    if (files.length < 2) throw new Error('Compare files needs at least two valid inputs.');
    const opts = Object.assign({ method: 'join', key: 'id', recordsPath: '', winner: 'later', lists: 'concat', caseInsensitive: false, keepNoKey: true }, options);
    const output = merger.merge(files, opts); // Shared validation and unchanged merge semantics.
    const rows = [], groups = [], names = files.map(f => f.name);
    function row(record, field, cells, merged, group) {
      const status = classify(cells);
      const candidates = cells.map((v, i) => equal(v, merged) && v.present ? i : -1).filter(i => i >= 0);
      // Equality identifies exact kept values, not contributions to combined lists/objects.
      const kept = candidates.length ? (opts.winner === 'earlier' ? candidates[0] : candidates[candidates.length - 1]) : -1;
      rows.push({ record, field, cells, merged, status, kept, group, missingFiles: cells.map((v, i) => !v.present ? i : -1).filter(i => i >= 0) });
    }
    function walk(record, cells, merged, parts, group) {
      const present = cells.filter(v => v.present);
      const keys = new Set();
      present.forEach(v => { if (object(v.value)) Object.keys(v.value).forEach(k => keys.add(k)); });
      if (merged.present && object(merged.value)) Object.keys(merged.value).forEach(k => keys.add(k));
      if (keys.size && present.every(v => object(v.value)) && (!merged.present || object(merged.value))) {
        keys.forEach(k => walk(record, cells.map(v => v.present ? get(v.value, [k]) : missing()), merged.present ? get(merged.value, [k]) : missing(), parts.concat(k), group));
      } else row(record, path(parts), cells, merged, group);
    }
    if (opts.method === 'combine') {
      row('', 'Item count', files.map(f => cell(get(f.data, opts.recordsPath ? opts.recordsPath.split('.') : []).value.length)), cell(output.result.length), 'counts');
    } else if (opts.method === 'deep') {
      walk('', files.map(f => cell(f.data)), cell(output.result), [], 'objects');
    } else {
      const indexed = new Map();
      function identity(record) {
        const id = get(record, opts.key.split('.'));
        if (!id.present || id.value === null || id.value === '') return null;
        const text = String(id.value);
        return opts.caseInsensitive ? text.toLowerCase() : text;
      }
      files.forEach((file, fi) => {
        const records = get(file.data, opts.recordsPath ? opts.recordsPath.split('.') : []).value;
        records.forEach((record, ri) => {
          const text = identity(record);
          const token = text === null ? 'unkeyed:' + fi + ':' + ri : 'key:' + text;
          if (!indexed.has(token)) indexed.set(token, { id: token, record: text === null ? 'No ID (' + (fi + 1) + ':' + (ri + 1) + ')' : text, lists: files.map(() => []), text });
          indexed.get(token).lists[fi].push(record);
        });
      });
      let unkeyedIndex = 0;
      const unkeyedOutput = output.result.filter(v => identity(v) === null);
      indexed.forEach(group => {
        const cells = group.lists.map(list => list.length ? cell(merger.merge(list.map((data, i) => ({ name: String(i), data })), Object.assign({}, opts, { method: 'deep' })).result) : missing());
        const matches = group.text === null ? (opts.keepNoKey ? [unkeyedOutput[unkeyedIndex++]] : []) : output.result.filter(v => identity(v) === group.text);
        const merged = matches.length === 1 ? cell(matches[0]) : matches.length ? cell(matches) : missing();
        const missingFiles = cells.map((v, i) => !v.present ? i : -1).filter(i => i >= 0);
        groups.push({ id: group.id, record: group.record, missingFiles });
        if (missingFiles.length) row(group.record, '(record presence)', cells.map(v => v.present ? cell('Present') : missing()), merged.present ? cell('Present') : missing(), group.id);
        // Type-distinct merge IDs can yield multiple actual result records for one textual comparison group.
        if (matches.length > 1) row(group.record, '(type-distinct merged records)', cells, merged, group.id);
        else walk(group.record, cells, merged, [], group.id);
      });
    }
    const counts = { same: 0, different: 0, missing: 0 };
    rows.forEach(r => counts[r.status]++);
    return { names, rows, groups, counts, total: rows.length, method: opts.method, result: output.result };
  }
  function selectRows(report, settings) {
    const opts = Object.assign({ filter: 'all', search: '', hideSame: false, sort: 'record', page: 0 }, settings);
    const query = opts.search.toLowerCase();
    const rows = report.rows.filter(r => (opts.filter === 'all' || r.status === opts.filter) && (!opts.hideSame || r.status !== 'same') && (!query || (r.record + ' ' + r.field + ' ' + labels[r.status] + ' ' + r.cells.map(v => v.present ? canonical(v.value) : 'Missing').join(' ')).toLowerCase().includes(query)));
    rows.sort((a, b) => opts.sort === 'status' ? a.status.localeCompare(b.status) || a.record.localeCompare(b.record) || a.field.localeCompare(b.field) : opts.sort === 'field' ? a.field.localeCompare(b.field) || a.record.localeCompare(b.record) : a.record.localeCompare(b.record, undefined, { numeric: true }) || a.field.localeCompare(b.field));
    const pages = Math.max(1, Math.ceil(rows.length / 200));
    const page = Math.min(Math.max(0, opts.page), pages - 1);
    return { rows: rows.slice(page * 200, (page + 1) * 200), total: rows.length, pages, page };
  }
  function csv(report) {
    const quote = v => '"' + String(v).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
    const value = v => v.present ? JSON.stringify(v.value) : 'Missing';
    return [['Record', 'Field', 'Status'].concat(report.names, ['Merged value'])].concat(report.rows.map(r => [r.record, r.field, labels[r.status]].concat(r.cells.map(value), [value(r.merged)]))).map(r => r.map(quote).join(',')).join('\r\n');
  }
  return { compare, selectRows, csv, canonical, equal, labels };
  }
  const api = createCompare(merger);
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; module.exports.createCompare = createCompare; }
  else { root.JsonCompare = api; root.JsonCompareFactory = createCompare; }
}(typeof window === 'undefined' ? globalThis : window));
