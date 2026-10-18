/* Validate with JSON5; retain source tokens so comments and numeric literals survive formatting. */
(function (root) {
  'use strict';
  function tokenize(source) {
    const tokens = [];
    let i = 0;
    while (i < source.length) {
      const start = i, ch = source[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"' || ch === "'") {
        i++;
        while (i < source.length) {
          if (source[i] === '\\') { i += source[i + 1] === '\r' && source[i + 2] === '\n' ? 3 : 2; }
          else if (source[i++] === ch) break;
        }
      } else if (source.startsWith('//', i)) {
        i += 2;
        while (i < source.length && !/[\r\n\u2028\u2029]/.test(source[i])) i++;
      } else if (source.startsWith('/*', i)) {
        i = source.indexOf('*/', i + 2) + 2;
      } else if ('{}[],:'.includes(ch)) {
        i++;
      } else {
        while (i < source.length && !/[\s{}\[\],:]/.test(source[i]) && !source.startsWith('//', i) && !source.startsWith('/*', i)) i++;
      }
      tokens.push(source.slice(start, i));
    }
    return tokens;
  }
  function format(source, spaces, standard, parser = root.JSON5) {
    if (!parser || typeof parser.parse !== 'function') throw new Error('JSON5 parser could not load. Check your connection and reload the page.');
    if (!source.trim()) throw new Error('Paste JSON5 or JSONC to format.');
    const value = parser.parse(source);
    const indent = spaces === 4 ? 4 : 2;
    if (standard) {
      return JSON.stringify(value, (key, item) => {
        if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Standard JSON does not support Infinity or NaN. Replace non-finite numbers before converting.');
        return item;
      }, indent);
    }
    const tokens = tokenize(source), lines = [];
    let depth = 0, line = '';
    const flush = () => { if (line.trim()) lines.push(' '.repeat(depth * indent) + line.trim()); line = ''; };
    tokens.forEach(token => {
      if (token.startsWith('//') || token.startsWith('/*')) {
        flush(); line = token; flush();
      } else if (token === '{' || token === '[') {
        line += token; flush(); depth++;
      } else if (token === '}' || token === ']') {
        flush(); depth--; line = token;
      } else if (token === ',') {
        line += ','; flush();
      } else if (token === ':') {
        line += ': ';
      } else {
        line += token;
      }
    });
    flush();
    return lines.join('\n');
  }
  const api = { format };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JoinJSONC = api;
}(typeof window !== 'undefined' ? window : globalThis));
