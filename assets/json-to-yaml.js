/* JSON-safe YAML conversion. No payload leaves this browser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('js-yaml'));
  else root.JsonToYaml = factory(root.jsyaml);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (yaml) {
  'use strict';
  const MAX_LENGTH = 1024 * 1024;
  function validate(value, ancestors = new Set(), depth = 0, budget = { remaining: 100000 }) {
    if (depth > 100 || --budget.remaining < 0) throw new Error('Data is too deeply nested or expands to too many values.');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('JSON cannot represent non-finite numbers.');
    if (value === null || typeof value !== 'object') return;
    if (ancestors.has(value)) throw new Error('Circular YAML aliases cannot be represented as JSON.');
    ancestors.add(value);
    for (const child of Object.values(value)) validate(child, ancestors, depth + 1, budget);
    ancestors.delete(value);
  }
  function convert(text, options = {}) {
    if (!yaml) throw new Error('The YAML library could not load. Check your connection and reload to try again.');
    if (text.length > MAX_LENGTH) throw new Error('Input is limited to 1 MB.');
    const direction = options.direction || 'json-to-yaml';
    const indent = Number(options.indent) === 4 ? 4 : 2;
    if (!['json-to-yaml', 'yaml-to-json'].includes(direction)) throw new Error('Unknown conversion direction.');
    const value = direction === 'json-to-yaml' ? JSON.parse(text) : yaml.load(text, { schema: yaml.JSON_SCHEMA });
    if (value === undefined) throw new Error('Enter a JSON or YAML value to convert.');
    validate(value);
    return direction === 'json-to-yaml'
      ? yaml.dump(value, { indent, schema: yaml.JSON_SCHEMA, noRefs: true, lineWidth: -1, noCompatMode: true })
      : JSON.stringify(value, null, indent) + '\n';
  }
  return { convert, MAX_LENGTH };
}));
