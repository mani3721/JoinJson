/* Local sample-based Python inference. No evaluation, uploads, or persistence. */
(function (root) {
  'use strict';
  const MAX_LENGTH = 1024 * 1024;
  const keywords = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case type'.split(' '));
  const reserved = new Set('Root BaseModel Field ConfigDict Optional Union Any dataclass field str int float bool list dict object'.split(' '));
  const protectedFields = new Set('schema schema_json json dict copy validate construct parse_obj parse_raw parse_file from_orm update_forward_refs __root__'.split(' '));
  function jsonToPython(value, options = {}) {
    const dataclass = options.framework === 'dataclass';
    const imports = new Set(), names = new Set(reserved), classes = [], cache = new Map();
    let nodes = 0, size = 0, usesField = false;
    const quote = text => JSON.stringify(text).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    function unique(base, used) {
      let name = base, suffix = 2;
      while (used.has(name)) name = base + suffix++;
      used.add(name); return name;
    }
    function className(hint) {
      let name = hint.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join('') || 'Model';
      if (/^\d/.test(name)) name = 'Model' + name;
      return unique(name, names);
    }
    function optional(type) {
      imports.add('Optional');
      if (type === 'None') { imports.add('Any'); type = 'Any'; }
      return type.startsWith('Optional[') ? type : 'Optional[' + type + ']';
    }
    function union(types) {
      const members = [...new Set(types)];
      if (!members.length) { imports.add('Any'); return 'Any'; }
      const nullable = members.includes('None');
      const nonNull = members.filter(type => type !== 'None');
      if (!nonNull.length) return 'None';
      let type = nonNull[0];
      if (nonNull.length > 1) { imports.add('Union'); type = 'Union[' + nonNull.join(', ') + ']'; }
      return nullable ? optional(type) : type;
    }
    function infer(sample, hint, depth = 0, rootObject = false) {
      if (depth > 100) throw new Error('Use no more than 100 nested levels.');
      if (++nodes > 100000) throw new Error('Sample has too many values. Try a smaller JSON sample.');
      if (sample === null) return 'None';
      if (Array.isArray(sample)) return 'list[' + union(sample.map(item => infer(item, hint + 'Item', depth + 1))) + ']';
      if (typeof sample === 'object') {
        const used = new Set();
        const fields = Object.keys(sample).map(key => {
          let name = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase().replace(/^_+/, '') || 'field';
          if (/^\d/.test(name)) name = 'field_' + name;
          if (keywords.has(name) || reserved.has(name) || protectedFields.has(name) || name.startsWith('model_')) name = 'field_' + name;
          name = unique(name, used);
          let type = infer(sample[key], key, depth + 1);
          if (options.optional) type = optional(type);
          return { key, name, type };
        });
        const signature = JSON.stringify(fields);
        if (!rootObject && cache.has(signature)) return cache.get(signature);
        const name = rootObject ? 'Root' : className(hint);
        if (!rootObject) cache.set(signature, name);
        const lines = fields.map(({ key, name, type }) => {
          let suffix = options.optional ? ' = None' : '';
          if (name !== key) {
            usesField = true;
            suffix = dataclass
              ? ' = field(' + (options.optional ? 'default=None, ' : '') + 'metadata={"json_key": ' + quote(key) + '})'
              : ' = Field(' + (options.optional ? 'default=None, ' : '') + 'alias=' + quote(key) + ')';
          }
          return '    ' + name + ': ' + type + suffix;
        });
        const definition = (dataclass ? '@dataclass\nclass ' + name + ':' : 'class ' + name + '(BaseModel):') + '\n' + (lines.join('\n') || '    pass');
        size += definition.length;
        if (size > 4 * MAX_LENGTH) throw new Error('Generated models are too large. Try a smaller JSON sample.');
        classes.push(definition);
        return name;
      }
      if (typeof sample === 'string') return 'str';
      if (typeof sample === 'boolean') return 'bool';
      if (typeof sample === 'number') {
        if (!Number.isFinite(sample)) throw new Error('Use finite JSON numbers; values such as 1e400 are outside the supported range.');
        return Number.isInteger(sample) ? 'int' : 'float';
      }
      throw new Error('Only JSON values are supported.');
    }
    // Arrays and primitives use a portable Root wrapper in either framework.
    if (value !== null && !Array.isArray(value) && typeof value === 'object') infer(value, 'Root', 0, true);
    else infer({ value }, 'Root', 0, true);
    const header = ['from __future__ import annotations'];
    if (dataclass) header.push('from dataclasses import dataclass' + (usesField ? ', field' : ''));
    if (imports.size) header.push('from typing import ' + [...imports].sort().join(', '));
    if (!dataclass) header.push('from pydantic import BaseModel' + (usesField ? ', Field' : ''));
    return header.join('\n') + '\n\n\n' + classes.join('\n\n\n') + '\n';
  }
  function convert(text, options = {}) {
    if (text.length > MAX_LENGTH) throw new Error('Input is limited to 1 MB to keep conversion responsive.');
    return jsonToPython(JSON.parse(text), options);
  }
  const api = { convert, jsonToPython, MAX_LENGTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.JsonToPython = api; root.jsonToPython = jsonToPython; }
}(typeof window === 'undefined' ? globalThis : window));
