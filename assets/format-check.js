/* Pure format inspection, reversible fixes, and accepted-input adapter. */
(function (root) {
  'use strict';
  function createFormat(rules, checkJson) {
    const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const own = (v, k) => v != null && Object.prototype.hasOwnProperty.call(v, k);
    const at = (v, path) => path ? path.split('.').reduce((a, k) => own(a, k) ? a[k] : undefined, v) : v;
    const ruleMethod = m => m === 'combine' ? 'append' : m;
    const toolMethod = m => m === 'append' ? 'combine' : m;
    function inspect(files, options) {
      const inputs = [], diagnostics = [];
      files.forEach((f, index) => {
        if (!own(f, 'text')) { inputs.push({ name: f.name, data: f.data }); return; }
        const split = rules.splitTopLevelValues(f.text);
        if (split.kind === 'multiple' || split.kind === 'jsonl') {
          const lines = f.text.split('\n'); let offset = split.ranges.length ? split.ranges[1][0] : 0;
          if (split.kind === 'jsonl') { let seen = 0, pos = 0; for (const line of lines) { if (line.trim() && ++seen === 2) { offset = pos; break; } pos += line.length + 1; } }
          diagnostics.push({ index, name: f.name, label: split.kind === 'jsonl' ? 'JSON Lines' : 'Several JSON values', severity: 'error', message: 'This box holds ' + split.values.length + ' separate JSON values. Put each one in its own box.', offset, fix: { action: split.kind === 'jsonl' ? 'convertLines' : 'split', label: split.kind === 'jsonl' ? 'Convert JSON Lines to a list' : 'Split into separate inputs' } });
          return;
        }
        const parsed = checkJson(f.text);
        if (!parsed.ok) { diagnostics.push({ index, name: f.name, label: f.text.trim() ? 'Invalid JSON' : 'No JSON yet', severity: 'error', message: parsed.message, offset: parsed.offset, line: parsed.line, column: parsed.column }); return; }
        inputs.push({ name: f.name, data: parsed.value });
      });
      const result = rules.checkCompatibility(inputs, ruleMethod(options.method), { keyPath: options.key, recordsPath: options.recordsPath });
      let parsedIndex = 0;
      const items = files.map((f, index) => diagnostics.find(d => d.index === index) || Object.assign({ index }, result.items[parsedIndex++]));
      const errors = items.filter(i => i.severity === 'error').length;
      const warnings = items.filter(i => i.severity === 'warn').length;
      return { inputs, items, global: result.global, errors, warnings, overall: errors ? 'error' : warnings ? 'warn' : result.overall, suggestedMethod: result.suggestedMethod && toolMethod(result.suggestedMethod), message: errors ? 'Cannot merge yet: ' + errors + (errors === 1 ? ' problem' : ' problems') : warnings ? 'Merge possible, ' + warnings + ' things to check' : 'Ready to merge' };
    }
    function fix(state, action, index, value) {
      // Snapshot is entirely in memory and preserves special JSON keys.
      const next = JSON.parse(JSON.stringify(state));
      const f = next.files[index];
      const data = file => own(file, 'text') ? JSON.parse(file.text) : file.data;
      const write = (file, v) => { file.text = JSON.stringify(v, null, 2); delete file.data; };
      if (action === 'wrapInList') write(f, [data(f)]);
      else if (action === 'wrapObjects') { next.files.forEach(file => { const v = data(file); if (object(v)) write(file, [v]); }); next.options.method = 'join'; }
      else if (action === 'useRecordsPath') next.options.recordsPath = value;
      else if (action === 'clearRecordsPath') next.options.recordsPath = '';
      else if (action === 'switchMethod') next.options.method = toolMethod(value);
      else if (action === 'chooseKey') next.options.key = value;
      else if (action === 'convertLines') write(f, rules.splitTopLevelValues(f.text).values);
      else if (action === 'split') { const values = rules.splitTopLevelValues(f.text).values; next.files.splice(index, 1, ...values.map((v, n) => ({ name: f.name + ' (' + (n + 1) + ')', text: JSON.stringify(v, null, 2) }))); }
      else throw new Error('Unknown format fix.');
      return next;
    }
    function prepare(inputs, options) {
      const opts = Object.assign({}, options), extras = [];
      const files = inputs.map(f => {
        const value = at(f.data, opts.recordsPath);
        if (opts.method === 'combine') return { name: f.name, data: Array.isArray(value) ? value : [value === undefined ? f.data : value] };
        if (opts.method === 'join' && Array.isArray(value)) return { name: f.name, data: value.filter(v => { if (object(v)) return true; extras.push(v); return false; }) };
        return f;
      });
      if (opts.method !== 'deep') opts.recordsPath = '';
      return { files, options: opts, extras };
    }
    function calculate(job, merger, compare) {
      const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
      const started = now();
      const inspection = inspect(job.files, job.options);
      if (inspection.errors) throw new Error(inspection.message + '. ' + inspection.items.filter(i => i.severity === 'error').map(i => i.message).join(' '));
      const prepared = prepare(inspection.inputs, job.options);
      const output = merger.merge(prepared.files, prepared.options);
      output.result = prepared.extras.length ? output.result.concat(prepared.extras) : output.result;
      const report = prepared.files.length >= 2 ? compare.compare(prepared.files, prepared.options) : null;
      if (report) report.result = output.result;
      return { output, report, text: JSON.stringify(output.result, null, job.format === 'compact' ? 0 : 2), count: inspection.inputs.length, description: 'Merged inputs in the displayed order.', warnings: inspection.items.filter(i => i.severity === 'warn').map(i => i.message), elapsed: now() - started };
    }
    return { inspect, fix, prepare, calculate };
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = createFormat(require('./merge-format-rules.js'), require('./json-error-helper.js').checkJson); module.exports.createFormat = createFormat; }
  else { root.JsonFormatFactory = createFormat; root.JsonFormat = createFormat(root.MergeFormatRules, root.JsonErrorHelper.checkJson); }
}(typeof window === 'undefined' ? globalThis : window));
