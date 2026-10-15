/*
  merge-format-rules.js
  Decides whether the inputs can be merged with the chosen method, and returns
  plain-language messages plus one-click fixes. Pure functions, no DOM.

  Main entry points:
    splitTopLevelValues(text)  -> { kind: 'single' | 'multiple' | 'jsonl' | 'none', values: [...], ranges: [[start,end],...] }
    classifyShape(value)       -> { shape, label, wrappedPath? }
    checkCompatibility(inputs, method, opts) -> { overall, suggestedMethod, items[], global[] }

  inputs: [{ name, data }]  (data = already-parsed JSON; invalid files are handled elsewhere)
  method: 'join' | 'append' | 'deep'
  opts:   { keyPath: 'id', recordsPath: '' }

  Severity: 'ok' | 'info' | 'warn' | 'error'   (error = cannot merge, warn = merges but check it)
*/
(function (root) {
  function createRules() {
  var WRAPPER_NAMES = ['data', 'items', 'results', 'records', 'rows', 'entries', 'list', 'hits', 'nodes'];

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isPrim(v) { return v === null || typeof v !== 'object'; }
  function getPath(obj, path) {
    if (!path) return obj;
    var cur = obj, parts = path.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || typeof cur !== 'object') return undefined;
      if (!Object.prototype.hasOwnProperty.call(cur, parts[i])) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function plural(n, w) { return n.toLocaleString() + ' ' + w + (n === 1 ? '' : 's'); }

  /* ---------- 1. Several JSON values pasted in one box ---------- */
  function splitTopLevelValues(text) {
    if (!text || !text.trim()) return { kind: 'none', values: [], ranges: [] };
    text = text.replace(/^\uFEFF/, '');
    try { return { kind: 'single', values: [JSON.parse(text)], ranges: [[0, text.length]] }; } catch (e) { /* continue */ }

    // JSON Lines: every non-empty line is its own valid JSON value
    var lines = text.split(/\r?\n/), parsed = [], ok = true, nonEmpty = 0;
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      nonEmpty++;
      try { parsed.push(JSON.parse(lines[i])); } catch (e2) { ok = false; break; }
    }
    if (ok && nonEmpty >= 2) return { kind: 'jsonl', values: parsed, ranges: [] };

    // Several pretty-printed objects/lists one after another
    var values = [], ranges = [], depth = 0, inStr = false, esc = false, start = -1;
    for (var p = 0; p < text.length; p++) {
      var c = text[p];
      if (inStr) {
        if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{' || c === '[') { if (depth === 0) start = p; depth++; }
      else if (c === '}' || c === ']') {
        depth--;
        if (depth === 0 && start !== -1) {
          try { values.push(JSON.parse(text.slice(start, p + 1))); ranges.push([start, p + 1]); }
          catch (e3) { return { kind: 'none', values: [], ranges: [] }; }
          start = -1;
        }
        if (depth < 0) return { kind: 'none', values: [], ranges: [] };
      } else if (depth === 0 && !/\s/.test(c)) {
        return { kind: 'none', values: [], ranges: [] };   // stray text between values
      }
    }
    if (depth === 0 && values.length >= 2) return { kind: 'multiple', values: values, ranges: ranges };
    return { kind: 'none', values: [], ranges: [] };
  }

  /* ---------- 2. Shape of one parsed value ---------- */
  function classifyShape(v) {
    if (isObj(v)) {
      var keys = Object.keys(v);
      if (!keys.length) return { shape: 'empty-object', label: 'Empty object' };
      var recKeys = keys.filter(function (k) { return Array.isArray(v[k]) && v[k].length && v[k].every(isObj); });
      var wrapped = recKeys.filter(function (k) { return WRAPPER_NAMES.indexOf(k) !== -1; });
      var out = { shape: 'object', label: 'Object with ' + plural(keys.length, 'key') };
      if (wrapped.length === 1) out.wrappedPath = wrapped[0];
      return out;
    }
    if (Array.isArray(v)) {
      if (!v.length) return { shape: 'empty-list', label: 'Empty list' };
      if (v.every(isObj)) return { shape: 'records', label: 'List of ' + plural(v.length, 'record') };
      if (v.every(isPrim)) return { shape: 'primitive-list', label: 'List of ' + plural(v.length, 'plain value') };
      if (v.every(Array.isArray)) return { shape: 'list-of-lists', label: 'List of lists' };
      return { shape: 'mixed-list', label: 'List of ' + plural(v.length, 'item') + ' (mixed types)' };
    }
    return { shape: 'primitive', label: 'Single value (' + (v === null ? 'null' : typeof v) + ')' };
  }

  /* ---------- 3. Key checks for "join" ---------- */
  function keyReport(records, keyPath) {
    var total = 0, withKey = 0, seen = Object.create(null), dups = Object.create(null);
    records.forEach(function (r) {
      if (!isObj(r)) return;
      total++;
      var kv = getPath(r, keyPath);
      if (kv === undefined || kv === null || kv === '') return;
      withKey++;
      var k = typeof kv === 'object' ? JSON.stringify(kv) : String(kv);
      if (seen[k]) dups[k] = true; seen[k] = true;
    });
    return { total: total, withKey: withKey, missing: total - withKey, duplicates: Object.keys(dups) };
  }
  function candidateKeys(records) {
    var counts = Object.create(null), objs = records.filter(isObj).slice(0, 200);
    objs.forEach(function (r) { Object.keys(r).forEach(function (k) { if (isPrim(r[k]) && r[k] !== null && r[k] !== '') counts[k] = (counts[k] || 0) + 1; }); });
    var pref = ['id', '_id', 'uuid', 'key', 'email', 'sku', 'slug', 'code'];
    return Object.keys(counts).filter(function (k) { return counts[k] / (objs.length || 1) >= 0.9; })
      .sort(function (a, b) { var ia = pref.indexOf(a), ib = pref.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); })
      .slice(0, 5);
  }

  /* ---------- 4. Compatibility ---------- */
  function checkCompatibility(inputs, method, opts) {
    opts = opts || {};
    var keyPath = (opts.keyPath || 'id').trim() || 'id';
    var recPath = (opts.recordsPath || '').trim();
    var res = { overall: 'ok', suggestedMethod: null, items: [], global: [] };
    var rank = { ok: 0, info: 1, warn: 2, error: 3 };
    function bump(s) { if (rank[s] > rank[res.overall]) res.overall = s; }

    var shapes = inputs.map(function (f) { return classifyShape(f.data); });
    var kinds = shapes.map(function (s) { return s.shape; });
    var allObjects = kinds.every(function (k) { return k === 'object' || k === 'empty-object'; });
    var allListish = kinds.every(function (k) { return k === 'records' || k === 'empty-list'; });
    var anyObject = kinds.some(function (k) { return k === 'object' || k === 'empty-object'; });
    var anyRecords = kinds.some(function (k) { return k === 'records'; });

    if (allObjects) res.suggestedMethod = 'deep';
    else if (allListish || (anyObject && anyRecords)) res.suggestedMethod = 'join';
    else if (kinds.every(function (k) { return k === 'primitive-list' || k === 'records' || k === 'empty-list' || k === 'mixed-list'; })) res.suggestedMethod = 'append';

    inputs.forEach(function (f, idx) {
      var s = shapes[idx], item = { name: f.name, shape: s.shape, label: s.label, severity: 'ok', message: '', fix: null };
      function set(sev, msg, fix) { item.severity = sev; item.message = msg; item.fix = fix || null; bump(sev); }

      if (method === 'join') {
        var recs = recPath ? getPath(f.data, recPath) : f.data;
        if (recPath && !Array.isArray(recs)) {
          set('error', 'No list was found at "' + recPath + '" in ' + f.name + '.', { action: 'clearRecordsPath', label: 'Clear the records field' });
        } else if (recPath) {
          var rs = classifyShape(recs);
          if (rs.shape !== 'records' && rs.shape !== 'empty-list') set('error', '"' + recPath + '" is not a list of records.', { action: 'switchMethod', method: 'append', label: 'Use Combine lists' });
          else item = joinKeyChecks(item, recs, keyPath, set);
        } else if (s.shape === 'records' || s.shape === 'empty-list') {
          if (s.shape === 'empty-list') set('warn', f.name + ' is an empty list, so it adds no records.', null);
          else item = joinKeyChecks(item, f.data, keyPath, set);
        } else if (s.shape === 'object' && s.wrappedPath) {
          set('error', f.name + ' is an object. Its records look like they are inside "' + s.wrappedPath + '".', { action: 'useRecordsPath', path: s.wrappedPath, label: 'Use "' + s.wrappedPath + '" as the records field' });
        } else if (s.shape === 'object' || s.shape === 'empty-object') {
          set('error', f.name + ' is a single object, but "Join records" needs a list of records.', { action: 'wrapInList', label: 'Wrap it in [ ] as a one-record list' });
        } else if (s.shape === 'primitive-list') {
          set('error', f.name + ' is a list of plain values, not records, so there is nothing to join by key.', { action: 'switchMethod', method: 'append', label: 'Use Combine lists' });
        } else if (s.shape === 'mixed-list') {
          var objCount = f.data.filter(isObj).length;
          set('warn', f.name + ' mixes records with other items. ' + plural(f.data.length - objCount, 'non-record item') + ' will be added at the end without joining.', null);
        } else if (s.shape === 'list-of-lists') {
          set('error', f.name + ' is a list of lists, which cannot be joined by a key.', { action: 'switchMethod', method: 'append', label: 'Use Combine lists' });
        } else {
          set('error', f.name + ' is a single value, not a list of records.', null);
        }
      } else if (method === 'deep') {
        if (s.shape === 'object' || s.shape === 'empty-object') { /* ok */ }
        else if (s.shape === 'records' || s.shape === 'empty-list' || s.shape === 'primitive-list' || s.shape === 'mixed-list' || s.shape === 'list-of-lists') {
          set('error', f.name + ' is a list, but "Merge objects" needs files shaped like { ... }.', { action: 'switchMethod', method: allListish ? 'join' : 'append', label: allListish ? 'Use Join records by a key' : 'Use Combine lists' });
        } else set('error', f.name + ' is a single value, not an object.', null);
      } else { // append
        if (s.shape === 'object' || s.shape === 'empty-object' || s.shape === 'primitive') set('warn', f.name + ' is not a list, so it will be added as one item.', null);
        else if (s.shape === 'empty-list') set('info', f.name + ' is an empty list and adds nothing.', null);
      }
      res.items.push(item);
    });

    // Mixed shapes across files
    if (anyObject && anyRecords && method !== 'append') {
      res.global.push({ severity: 'info', message: 'One input is an object and another is a list of records. Wrapping the object in [ ] lets you join them by key.', fix: { action: 'wrapObjects', label: 'Wrap objects in [ ] and join' } });
    }
    if (inputs.length === 1) { res.global.push({ severity: 'info', message: 'Only one input is loaded. Add a second to merge.', fix: null }); bump('info'); }
    return res;
  }

  function joinKeyChecks(item, records, keyPath, set) {
    var kr = keyReport(records, keyPath);
    if (kr.total && kr.withKey === 0) {
      var cands = candidateKeys(records);
      set('error', 'No record in ' + item.name + ' has the field "' + keyPath + '".', cands.length ? { action: 'chooseKey', keys: cands, label: 'Try ' + cands.map(function (k) { return '"' + k + '"'; }).join(', ') } : null);
    } else if (kr.missing > 0) {
      set('warn', kr.missing + ' of ' + kr.total + ' records in ' + item.name + ' have no "' + keyPath + '" and will be added at the end without joining.', null);
    } else if (kr.duplicates.length) {
      set('warn', '"' + keyPath + '" repeats inside ' + item.name + ' (for example ' + kr.duplicates[0] + '). Those records will be merged into one.', null);
    }
    return item;
  }

  var api = { splitTopLevelValues: splitTopLevelValues, classifyShape: classifyShape, checkCompatibility: checkCompatibility, keyReport: keyReport, candidateKeys: candidateKeys };
  return api;
  }
  const api = createRules();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; module.exports.createRules = createRules; }
  else { root.MergeFormatRules = api; root.MergeFormatRulesFactory = createRules; }
})(this);
