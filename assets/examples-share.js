/* Static examples and pure, bounded sharing helpers. No network or persistence. */
(function (root) {
  'use strict';
  const defaults = { method: 'join', key: 'id', recordsPath: '', winner: 'later', lists: 'concat', format: 'pretty', caseInsensitive: false, keepNoKey: true };
  const examples = [
    { id: 'join-customers', name: 'Join customer lists by id', caption: 'Two name/plan conflicts; email is kept even though billing has no email.', method: 'join', data: [[{ id: 1, name: 'Ada', plan: 'trial', email: 'ada@example.test' }], [{ id: 1, name: 'Ada Lovelace', plan: 'paid' }]], names: ['crm.json', 'billing.json'], conflicts: 2 },
    { id: 'merge-settings', name: 'Merge settings objects', caption: 'Nested defaults survive; lists combine while the timeout changes.', method: 'deep', data: [{ service: { host: 'localhost', timeout: 10 }, tags: ['base'] }, { service: { timeout: 30 }, tags: ['override'] }], conflicts: 2 },
    { id: 'combine-lists', name: 'Combine two lists', caption: 'Both lists contribute items in order, including duplicates.', method: 'combine', data: [[1, 2], [2, 3]], conflicts: 1 },
    { id: 'conflict-winners', name: 'Later wins versus earlier wins', caption: 'Change the win rule to keep the first name instead of the second.', method: 'join', data: [[{ id: 1, name: 'Earlier' }], [{ id: 1, name: 'Later' }]], conflicts: 1 },
    { id: 'nested-key', name: 'Join by user.id', caption: 'The nested user.id identifies the record; both new fields survive.', method: 'join', key: 'user.id', data: [[{ user: { id: 1 }, name: 'Ada' }], [{ user: { id: 1 }, active: true }]], conflicts: 0 },
    { id: 'api-data', name: 'API records inside data', caption: 'The records field selects data; the merged result is an unwrapped list.', method: 'join', recordsPath: 'data', data: [{ data: [{ id: 1, name: 'Ada' }] }, { data: [{ id: 1, active: true }] }], conflicts: 0 },
    { id: 'wrong-shape', name: 'Object plus list: fix the format', caption: 'Use “Wrap in [ ] and join by id” to make the object a record list.', method: 'join', data: [{ id: 1, name: 'Ada' }, [{ id: 1, name: 'Ada Lovelace' }]], conflicts: null }
  ];
  function example(id) {
    const e = examples.find(e => e.id === id); if (!e) return null;
    return { mode: 'quick', files: e.data.map((data, i) => ({ name: e.names ? e.names[i] : 'Example ' + (i + 1), text: JSON.stringify(data, null, 2) })), options: Object.assign({}, defaults, { method: e.method, key: e.key || 'id', recordsPath: e.recordsPath || '' }), format: 'pretty' };
  }
  const enumFields = { method: ['join', 'combine', 'deep'], winner: ['later', 'earlier'], lists: ['concat', 'unique', 'replace'], format: ['pretty', 'compact'] };
  function validPath(v, empty) { return typeof v === 'string' && v.length <= 120 && ((empty && v === '') || /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(v)); }
  function settings(input) {
    const out = {}; if (!input || typeof input !== 'object') return out;
    Object.keys(enumFields).forEach(k => { if (enumFields[k].includes(input[k])) out[k] = input[k]; });
    if (validPath(input.key, false)) out.key = input.key;
    if (validPath(input.recordsPath, true)) out.recordsPath = input.recordsPath;
    return out;
  }
  function plainURL(url) { const u = new URL(url); u.search = ''; u.hash = ''; return u.href; }
  function settingsURL(url, input) { const u = new URL(plainURL(url)); Object.entries(settings(input)).forEach(([k, v]) => u.searchParams.set(k, v)); return u.href; }
  function parseSettings(url) { try { return settings(Object.fromEntries(new URL(url).searchParams)); } catch (_) { return {}; } }
  function validatePayload(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.inputs) || value.inputs.length > 50 || !value.inputs.every(v => typeof v === 'string')) throw new Error('Invalid shared data link.');
    if (value.inputs.join('').length > 1000000) throw new Error('Shared data is too large to open safely.');
    return { mode: value.inputs.length === 2 ? 'quick' : 'advanced', files: value.inputs.map((text, i) => ({ name: 'Shared input ' + (i + 1), text })), options: Object.assign({}, defaults, settings(value.settings)), format: settings(value.settings).format || 'pretty' };
  }
  function encode64(bytes) { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function decode64(s) { if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('Invalid shared data link.'); return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
  async function dataURL(url, state, compress) {
    const payload = { version: 1, inputs: state.files.map(f => f.text === undefined ? JSON.stringify(f.data) : f.text), settings: settings(Object.assign({}, state.options, { format: state.format })) };
    validatePayload(payload);
    let bytes = new TextEncoder().encode(JSON.stringify(payload)), kind = 'raw';
    if (compress !== false && typeof CompressionStream !== 'undefined') {
      const zipped = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
      if (zipped.length < bytes.length) { bytes = zipped; kind = 'gzip'; }
    }
    const link = plainURL(url) + '#data=' + kind + '.' + encode64(bytes);
    if (link.length > 8000) throw new Error('This data link exceeds 8,000 characters. Use Copy or Download instead.');
    return link;
  }
  async function parseData(url) {
    const hash = new URL(url).hash; if (!hash.startsWith('#data=')) return null;
    if (url.length > 8000) throw new Error('This data link exceeds 8,000 characters.');
    const match = hash.match(/^#data=(raw|gzip)\.([A-Za-z0-9_-]+)$/); if (!match) throw new Error('Invalid shared data link.');
    let bytes = decode64(match[2]);
    if (match[1] === 'gzip') {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed links. Ask for a downloaded file instead.');
      const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(), chunks = []; let size = 0;
      while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 1100000) { await reader.cancel(); throw new Error('Shared data is too large to open safely.'); } chunks.push(next.value); }
      bytes = new Uint8Array(size); let offset = 0; chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.length; });
    }
    return validatePayload(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  }
  function canShare(nav, data) { try { return !!nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare(data) === true; } catch (_) { return false; } }
  const api = { examples, example, settings, plainURL, settingsURL, parseSettings, dataURL, parseData, canShare };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.JMSharing = api;
}(typeof window === 'undefined' ? globalThis : window));
