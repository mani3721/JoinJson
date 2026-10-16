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
    function infer(value, depth = 0) {
      if (depth > 100) throw new Error('Use no more than 100 nested levels.');
      let code;
      if (value === null) code = 'null';
      else if (Array.isArray(value)) {
        const members = [...new Set(value.map(item => infer(item, depth + 1)))];
        // Array<T> keeps unions and nested arrays unambiguous.
        code = 'Array<' + (members.length ? members.join(' | ') : 'unknown') + '>';
      } else if (typeof value === 'object') {
        const pad = '  '.repeat(depth), childPad = pad + '  ';
        const fields = Object.keys(value).map(key => {
          const field = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
          return childPad + field + (options.optional ? '?' : '') + ': ' + infer(value[key], depth + 1) + ';';
        });
        code = fields.length ? '{\n' + fields.join('\n') + '\n' + pad + '}' : '{}';
      } else if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('Use finite JSON numbers; values such as 1e400 are outside the supported range.');
        code = 'number';
      } else code = typeof value;
      size += code.length;
      if (size > 8 * MAX_LENGTH) throw new Error('Generated types are too large. Try a smaller JSON sample.');
      return code;
    }
    const body = infer(value);
    const prefix = options.export === false ? '' : 'export ';
    const object = value !== null && !Array.isArray(value) && typeof value === 'object';
    // Interfaces cannot represent primitive or array roots, so use a type alias.
    return prefix + (options.mode !== 'type' && object ? 'interface ' + name + ' ' + body : 'type ' + name + ' = ' + body + ';') + '\n';
  }
  const api = { convert, validName, MAX_LENGTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JsonToTypeScript = api;
}(typeof window === 'undefined' ? globalThis : window));
