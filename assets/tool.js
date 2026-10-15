/* Local-only JSON merger. CommonJS export supports dependency-free Node tests. */
(function (root) {
  'use strict';
  function createMerger() {
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const set = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
    function clone(v) {
      if (Array.isArray(v)) return v.map(clone);
      if (!object(v)) return v;
      const out = {};
      Object.keys(v).forEach(k => set(out, k, clone(v[k])));
      return out;
    }
    function canonical(v) {
      if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
      if (object(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
      return JSON.stringify(v);
    }
    function at(v, path) {
      if (!path) return v;
      return path.split('.').reduce((value, key) => value != null && own(Object(value), key) ? value[key] : undefined, v);
    }
    function parse(text, name) {
      try { return JSON.parse(text); }
      catch (error) {
        const message = String(error.message);
        const match = message.match(/position\s+(\d+)/i);
        const lc = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
        const pos = match ? Number(match[1]) : /unexpected end|end of JSON/i.test(message) ? text.length : null;
        let line, column;
        if (pos !== null) {
          const before = text.slice(0, pos).split('\n');
          line = before.length; column = before[before.length - 1].length + 1;
        } else if (lc) { line = Number(lc[1]); column = Number(lc[2]); }
        const snippet = line ? (text.split('\n')[line - 1] || '').slice(Math.max(0, column - 35), column + 35) : text.slice(0, 90);
        throw new Error((name || 'JSON') + ': invalid JSON' + (line ? ' at line ' + line + ', column ' + column : '') + '. ' + message + '\nNear: ' + (snippet || '(end of input)') + '\nUse double quotes around keys and strings; remove comments and trailing commas; check closing brackets.');
      }
    }
    function merge(files, options) {
      const opts = Object.assign({ method: 'join', key: 'id', recordsPath: '', caseInsensitive: false, keepNoKey: true, winner: 'later', lists: 'concat' }, options);
      if (!files.length) throw new Error('Add at least one JSON file or pasted JSON value.');
      if (!['join', 'combine', 'deep'].includes(opts.method)) throw new Error('Choose a valid merge method.');
      if (!['later', 'earlier'].includes(opts.winner) || !['concat', 'unique', 'replace'].includes(opts.lists)) throw new Error('Choose valid conflict and list options.');
      if (opts.method === 'join' && !opts.key.trim()) throw new Error('Enter an ID key, for example id or user.id.');
      const conflicts = [], sources = new Map();
      const pointer = (p, k) => p + '/' + String(k).replace(/~/g, '~0').replace(/\//g, '~1');
      function mark(v, p, source) {
        sources.set(p, source);
        if (object(v)) Object.keys(v).forEach(k => mark(v[k], pointer(p, k), source));
      }
      function resolve(a, b, p, source) {
        if (object(a) && object(b)) {
          const out = clone(a);
          Object.keys(b).forEach(k => {
            const next = pointer(p, k);
            if (own(out, k)) set(out, k, resolve(out[k], b[k], next, source));
            else { set(out, k, clone(b[k])); mark(b[k], next, source); }
          });
          return out;
        }
        const equal = canonical(a) === canonical(b);
        const previousSource = sources.get(p) || '(unknown source)';
        if (!equal) conflicts.push({ path: p || '/', previousSource, incomingSource: source, previous: clone(a), incoming: clone(b), resolution: Array.isArray(a) && Array.isArray(b) && opts.lists !== 'replace' ? opts.lists : opts.winner });
        if (Array.isArray(a) && Array.isArray(b) && opts.lists !== 'replace') {
          const combined = a.concat(b);
          const result = opts.lists === 'unique' ? Array.from(new Map(combined.map(v => [canonical(v), v])).values()).map(clone) : combined.map(clone);
          sources.set(p, previousSource === source ? source : previousSource + ' + ' + source);
          return result;
        }
        if (opts.winner === 'later') { mark(b, p, source); return clone(b); }
        return clone(a);
      }
      let result;
      if (opts.method === 'deep') {
        files.forEach((file, i) => {
          if (!object(file.data)) throw new Error(file.name + ': merge objects needs a JSON object at the top level. Choose combine lists or join records for arrays.');
          if (!i) { result = clone(file.data); mark(result, '', file.name); }
          else result = resolve(result, file.data, '', file.name);
        });
      } else {
        result = [];
        const indexes = new Map();
        files.forEach((file, fileIndex) => {
          const records = at(file.data, opts.recordsPath);
          if (!Array.isArray(records)) throw new Error(file.name + ': expected a list' + (opts.recordsPath ? ' at "' + opts.recordsPath + '"' : ' at the top level') + '. Choose the right records path (for example data.items) or use merge objects.');
          if (opts.method === 'combine') {
            if (fileIndex === 0) { result = clone(records); mark(result, '', file.name); }
            else result = resolve(result, records, '', file.name);
            return;
          }
          records.forEach((record, row) => {
            if (!object(record)) throw new Error(file.name + ': record ' + (row + 1) + ' is not an object. Use combine lists for strings, numbers, or mixed lists.');
            let key = at(record, opts.key);
            if (key === undefined || key === null || key === '') {
              if (opts.keepNoKey) { const i = result.length; result.push(clone(record)); mark(record, pointer('', i), file.name); }
              return;
            }
            if (!['string', 'number', 'boolean'].includes(typeof key)) throw new Error(file.name + ': record ' + (row + 1) + ' has a non-scalar ID. Choose a string, number, or boolean key.');
            if (opts.caseInsensitive && typeof key === 'string') key = key.toLowerCase();
            const token = typeof key + ':' + key;
            if (indexes.has(token)) {
              const i = indexes.get(token); result[i] = resolve(result[i], record, pointer('', i), file.name);
            } else {
              const i = result.length; indexes.set(token, i); result.push(clone(record)); mark(record, pointer('', i), file.name);
            }
          });
        });
      }
      return { result, conflicts };
    }
    function infer(a, b) {
      if (object(a) && object(b)) return { method: 'deep', description: 'Merged the two objects, keeping later values when they conflict.' };
      if (!Array.isArray(a) || !Array.isArray(b)) throw new Error('Use two objects or two lists. For wrapped lists, open advanced mode and set a records path.');
      const all = a.concat(b);
      let best = '', bestScore = 0;
      if (a.length && b.length && all.every(object)) {
        const paths = new Set();
        function visit(v, prefix, depth) {
          Object.keys(v).forEach(k => {
            if (k.includes('.')) return;
            const path = prefix ? prefix + '.' + k : k;
            if (/^(id|_id|uuid|key)$/i.test(k) || /(?:Id|_id)$/.test(k)) paths.add(path);
            if (object(v[k]) && depth < 3) visit(v[k], path, depth + 1);
          });
        }
        all.forEach(v => visit(v, '', 0));
        paths.forEach(path => {
          const values = all.map(v => at(v, path));
          if (values.some(v => v === '' || v == null || !['string', 'number', 'boolean'].includes(typeof v))) return;
          const left = new Set(a.map(v => canonical(at(v, path))));
          const right = new Set(b.map(v => canonical(at(v, path))));
          const overlap = Array.from(left).filter(v => right.has(v)).length;
          const score = left.size / a.length + right.size / b.length + overlap / Math.max(left.size, right.size) + (/^(id|_id|uuid)$/i.test(path) ? 0.1 : 0);
          if (score > bestScore) { best = path; bestScore = score; }
        });
      }
      return best ? { method: 'join', key: best, description: 'Joined records using “' + best + '” as the ID, keeping later conflicting values.' } : { method: 'combine', description: 'Combined the two lists in order, keeping all items.' };
    }
    function csv(rows) {
      // Prefix formula-like cells so spreadsheet applications do not execute them.
      const cell = value => '"' + String(value).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
      return [['Path', 'Previous source', 'Incoming source', 'Previous value', 'Incoming value', 'Resolution']].concat(rows.map(r => [r.path, r.previousSource, r.incomingSource, JSON.stringify(r.previous), JSON.stringify(r.incoming), r.resolution])).map(row => row.map(cell).join(',')).join('\r\n');
    }
    return { merge, parse, infer, csv };
  }
  const api = createMerger();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; module.exports.createMerger = createMerger; }
  if (typeof document === 'undefined') return;
  root.JsonMerger = api;
  root.JsonMergerFactory = createMerger;
}(typeof window === 'undefined' ? globalThis : window));
