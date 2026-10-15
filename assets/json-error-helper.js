/* Syntax diagnostics only; no logging, network, or storage. */
(function (root) {
  'use strict';
  function checkJson(text) {
    try { return { ok: true, value: JSON.parse(text) }; }
    catch (error) {
      const raw = String(error.message);
      const position = raw.match(/position\s+(\d+)/i), location = raw.match(/line\s+(\d+)\s+column\s+(\d+)/i);
      let offset = position ? Number(position[1]) : null;
      if (offset === null && location) {
        const lines = text.split('\n'); offset = lines.slice(0, Number(location[1]) - 1).reduce((n, s) => n + s.length + 1, 0) + Number(location[2]) - 1;
      }
      if (offset === null && /unexpected end|end of JSON/i.test(raw)) offset = text.length;
      const before = offset === null ? [] : text.slice(0, offset).split('\n');
      const line = before.length || null, column = before.length ? before[before.length - 1].length + 1 : null;
      return { ok: false, offset, line, column, message: 'Invalid JSON' + (line ? ' at line ' + line + ', column ' + column : '') + '. Use double quotes, remove comments and trailing commas, and check closing brackets.', parserMessage: raw };
    }
  }
  const api = { checkJson };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.JsonErrorHelper = api;
}(typeof window === 'undefined' ? globalThis : window));
