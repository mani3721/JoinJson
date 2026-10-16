/* Pure local comparison: no payload storage or networking. */
(function (root) {
  'use strict';
  const MAX_LENGTH = 1024 * 1024;
  function validate(value, depth = 0, count = { value: 0 }) {
    if (depth > 100) throw new Error('JSON is too deeply nested (maximum 100 levels).');
    if (++count.value > 100000) throw new Error('JSON contains too many values (maximum 100,000).');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('JSON numbers must be finite.');
    if (value && typeof value === 'object') Object.keys(value).forEach(key => validate(value[key], depth + 1, count));
  }
  function parse(text) {
    if (new TextEncoder().encode(text).length > MAX_LENGTH) throw new Error('Each JSON input must be 1 MB or smaller.');
    const value = JSON.parse(text);
    validate(value);
    return value;
  }
  // Positional array comparison avoids quadratic LCS work on large arrays.
  // jsondiffpatch compares object keys semantically, ignoring property order.
  function compare(left, right, library) {
    validate(left); validate(right);
    if (!library || typeof library.create !== 'function') throw new Error('The comparison library could not load. Check your connection and try Compare JSON again.');
    const engine = library.create({ arrays: { detectMove: false }, propertyFilter: () => true });
    // Null-prototype deltas retain legitimate JSON keys such as __proto__.
    engine.processor.pipes.diff.before('objects', context => {
      if (!context.left || !context.right || typeof context.left !== 'object' || typeof context.right !== 'object' || Array.isArray(context.left) || Array.isArray(context.right)) return;
      const delta = Object.create(null);
      const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
      new Set([...Object.keys(context.left), ...Object.keys(context.right)]).forEach(key => {
        if (!own(context.left, key)) delta[key] = [context.right[key]];
        else if (!own(context.right, key)) delta[key] = [context.left[key], 0, 0];
        else {
          const child = engine.diff(context.left[key], context.right[key]);
          if (child !== undefined) delta[key] = child;
        }
      });
      context.setResult(Object.keys(delta).length ? delta : undefined).exit();
    });
    engine.processor.pipes.diff.before('arrays', context => {
      if (!context.leftIsArray) return;
      if (!context.rightIsArray) return;
      const delta = Object.create(null);
      delta._t = 'a';
      const length = Math.max(context.left.length, context.right.length);
      for (let i = 0; i < length; i++) {
        if (i >= context.left.length) delta[i] = [context.right[i]];
        else if (i >= context.right.length) delta['_' + i] = [context.left[i], 0, 0];
        else {
          const child = engine.diff(context.left[i], context.right[i]);
          if (child !== undefined) delta[i] = child;
        }
      }
      context.setResult(Object.keys(delta).length > 1 ? delta : undefined).exit();
    });
    return engine.diff(left, right);
  }
  function rows(delta, left, right) {
    const result = [];
    const own = (object, key) => object != null && Object.prototype.hasOwnProperty.call(object, key);
    function walk(change, a, b, parts) {
      if (change === undefined) return;
      if (Array.isArray(change)) {
        const status = change.length === 1 ? 'added' : change.length === 3 && change[2] === 0 ? 'removed' : 'modified';
        result.push({ path: parts.length ? '/' + parts.map(key => String(key).replace(/~/g, '~0').replace(/\//g, '~1')).join('/') : '(root)', status, before: a, after: b });
        return;
      }
      const array = Array.isArray(a) && Array.isArray(b);
      Object.keys(change).forEach(key => {
        if (array && key === '_t') return;
        const index = array && key.startsWith('_') ? key.slice(1) : key;
        walk(change[key], own(a, index) ? a[index] : undefined, own(b, index) ? b[index] : undefined, parts.concat(index));
      });
    }
    walk(delta, left, right, []);
    return result;
  }
  const api = { parse, compare, rows, MAX_LENGTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JsonDiff = api;
}(typeof window === 'undefined' ? globalThis : window));
