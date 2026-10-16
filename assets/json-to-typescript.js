/* Sample-based TypeScript inference. Input is never evaluated, stored, or sent. */
(function (root) {
  'use strict';
  const MAX_LENGTH = 1024 * 1024;
  const reserved = new Set(('break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with implements interface let package private protected public static yield any boolean constructor declare get infer is keyof module namespace never number object readonly require set string symbol type undefined unique unknown abstract as asserts async await bigint global intrinsic of out override satisfies using').split(' '));
  function validName(name) {
    return /^[A-Za-z_$][\w$]*$/.test(name) && !reserved.has(name);
  }
  function convert(text, options = {}) {
    if (text.length > MAX_LENGTH) throw new Error('Input is limited to 1 MB to keep conversion responsive.');
    const name = options.rootName === undefined ? 'Root' : String(options.rootName).trim();
    if (!validName(name)) throw new Error('Root Type Name must be a valid, non-reserved TypeScript identifier.');
    const value = JSON.parse(text);
    let size = 0;
    function infer(values, depth = 0) {
      if (depth > 100) throw new Error('Use no more than 100 nested levels.');
      const groups = new Map();
      for (const value of values) {
        const kind = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
        if (kind === 'number' && !Number.isFinite(value)) throw new Error('Use finite JSON numbers; values such as 1e400 are outside the supported range.');
        if (!groups.has(kind)) groups.set(kind, []);
        groups.get(kind).push(value);
      }
      const members = [];
      for (const [kind, samples] of groups) {
        if (kind === 'array') {
          const items = [];
          for (const sample of samples) {
            for (const item of sample) items.push(item);
          }
          // Infer all elements together, including arrays nested in merged objects.
          members.push('Array<' + infer(items, depth + 1) + '>');
        } else if (kind === 'object') {
          const pad = '  '.repeat(depth), childPad = pad + '  ';
          const properties = new Map();
          for (const sample of samples) {
            for (const key of Object.keys(sample)) {
              if (!properties.has(key)) properties.set(key, []);
              properties.get(key).push(sample[key]);
            }
          }
          // Merge structural samples before rendering; absent fields are optional,
          // while explicit nulls remain property-level unions.
          const fields = [];
          for (const [key, values] of properties) {
            const field = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
            const optional = options.optional || values.length < samples.length;
            fields.push(childPad + field + (optional ? '?' : '') + ': ' + infer(values, depth + 1) + ';');
          }
          members.push(fields.length ? '{\n' + fields.join('\n') + '\n' + pad + '}' : '{}');
        } else members.push(kind);
      }
      const code = members.length ? members.join(' | ') : 'unknown';
      size += code.length;
      if (size > 8 * MAX_LENGTH) throw new Error('Generated types are too large. Try a smaller JSON sample.');
      return code;
    }
    const body = infer([value]);
    const prefix = options.export === false ? '' : 'export ';
    const object = value !== null && !Array.isArray(value) && typeof value === 'object';
    // Interfaces cannot represent primitive or array roots, so use a type alias.
    return prefix + (options.mode !== 'type' && object ? 'interface ' + name + ' ' + body : 'type ' + name + ' = ' + body + ';') + '\n';
  }
  const api = { convert, validName, MAX_LENGTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JsonToTypeScript = api;
}(typeof window === 'undefined' ? globalThis : window));
