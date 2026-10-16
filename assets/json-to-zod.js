/* Pure client-side inference. No network, storage, or evaluation of input. */
(function (root) {
  'use strict';
  const MAX_LENGTH = 1024 * 1024;
  const MAX_DEPTH = 100;
  function schemaFor(value, depth = 0) {
    if (depth > MAX_DEPTH) throw new Error('Use no more than ' + MAX_DEPTH + ' nested levels.');
    // A null-only sample cannot tell us the eventual non-null type.
    if (value === null) return 'z.unknown().nullable()';
    if (Array.isArray(value)) {
      // Infer concrete types first, then allow null without widening those types.
      const items = [...new Set(value.filter(item => item !== null).map(item => schemaFor(item, depth + 1)))];
      let element = !items.length ? 'z.unknown()' : items.length === 1 ? items[0] : 'z.union([\n' + items.map(item => indent(item)).join(',\n') + '\n])';
      if (value.includes(null)) element += '.nullable()';
      return 'z.array(' + element + ')';
    }
    if (typeof value === 'object') {
      const fields = Object.keys(value).map(key => {
        // Computed __proto__ keeps this a real field, rather than a prototype setter.
        const name = key === '__proto__' ? '[' + JSON.stringify(key) + ']'
          : /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
        return indent(name + ': ' + schemaFor(value[key], depth + 1));
      });
      return fields.length ? 'z.object({\n' + fields.join(',\n') + '\n})' : 'z.object({})';
    }
    if (typeof value === 'string') return 'z.string()';
    if (typeof value === 'boolean') return 'z.boolean()';
    if (typeof value === 'number' && Number.isFinite(value)) return 'z.number()';
    throw new Error('Use finite JSON numbers; values such as 1e400 are outside the supported range.');
  }
  function indent(text) { return text.split('\n').map(line => '  ' + line).join('\n'); }
  function convert(text, exportType = false) {
    if (text.length > MAX_LENGTH) throw new Error('Input is limited to 1 MB to keep conversion responsive.');
    const value = JSON.parse(text);
    const schema = schemaFor(value);
    if (schema.length > 4 * MAX_LENGTH) throw new Error('Generated schema is too large. Try a smaller JSON sample.');
    return 'import { z } from "zod";\n\nexport const schema = ' + schema + ';\n' + (exportType ? '\nexport type Output = z.infer<typeof schema>;\n' : '');
  }
  const api = { convert, schemaFor, MAX_LENGTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JsonToZod = api;
}(typeof window === 'undefined' ? globalThis : window));
