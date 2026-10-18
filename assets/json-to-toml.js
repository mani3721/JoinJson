/* Conversion is local. The only network request loads the pinned parser module. */
export const TOML_CDN = 'https://cdn.jsdelivr.net/npm/smol-toml@1.9.1/+esm';
export const HANDOFF_KEY = 'joinjson:toml-input';
const modes = new Set(['json-to-toml', 'toml-to-json', 'toml-formatter']);

function checkValue(value, path = '$', depth = 0) {
  if (depth > 100) throw new Error('Nesting exceeds the supported depth of 100 levels.');
  if (value === null) throw new Error(`TOML cannot represent null at ${path}. Remove it or replace it explicitly before converting.`);
  if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
    throw new Error(`Number at ${path} cannot be converted safely. Use a string for exact large integers.`);
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) checkValue(child, `${path}[${JSON.stringify(key)}]`, depth + 1);
  }
}

export function convert(source, mode, toml) {
  if (!modes.has(mode)) throw new Error('Choose a supported conversion mode.');
  if (!source.trim()) return '';
  if (mode === 'json-to-toml') {
    const data = JSON.parse(source);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('TOML requires a JSON object at the top level, not an array or primitive.');
    checkValue(data);
    return toml.stringify(data) || '# Empty TOML document\n';
  }
  // Big integers must never be rounded silently when exporting configuration.
  const data = toml.parse(source, { integersAsBigInt: mode === 'toml-formatter' ? true : 'asNeeded' });
  if (mode === 'toml-formatter') return toml.stringify(data, { numbersAsFloat: true }) || '# Empty TOML document\n';
  return JSON.stringify(data, (_key, value) => {
    if (typeof value === 'bigint') throw new Error('An integer exceeds the JSON safe integer range. Use a TOML string to retain its exact value.');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Standard JSON cannot represent TOML inf or nan. Replace these values before converting.');
    return value;
  }, 2);
}

export function init(doc = document, loadParser = () => import(TOML_CDN)) {
  const input = doc.getElementById('toml-input');
  if (!input) return;
  const win = doc.defaultView;
  const output = doc.getElementById('toml-output');
  const error = doc.getElementById('toml-error');
  const status = doc.getElementById('toml-status');
  const copy = doc.getElementById('toml-copy');
  const download = doc.getElementById('toml-download');
  const radios = [...doc.querySelectorAll('input[name="toml-mode"]')];
  let parser, unavailable = false, timer, feedbackTimer, revision = 0;
  const mode = () => radios.find(radio => radio.checked).value;
  const extension = () => mode() === 'toml-to-json' ? 'json' : 'toml';
  function invalidate() {
    revision++;
    clearTimeout(timer); clearTimeout(feedbackTimer);
    output.value = '';
    copy.disabled = download.disabled = true;
    copy.textContent = 'Copy Output';
    error.hidden = true; error.textContent = '';
    input.removeAttribute('aria-invalid');
  }
  function run() {
    invalidate();
    download.textContent = `Download File (.${extension()})`;
    doc.getElementById('toml-input-label').textContent = mode() === 'json-to-toml' ? 'JSON input' : 'TOML input';
    doc.getElementById('toml-output-label').textContent = extension() === 'json' ? 'JSON output' : 'TOML output';
    if (!parser) {
      status.textContent = unavailable ? 'TOML parser could not load. Check your connection and reload; no input was uploaded.' : 'Loading TOML parser…';
      return;
    }
    if (!input.value.trim()) { status.textContent = 'Ready. Your input stays in this browser.'; return; }
    try {
      output.value = convert(input.value, mode(), parser);
      copy.disabled = download.disabled = !output.value;
      status.textContent = 'Converted successfully. All processing was local.';
    } catch (cause) {
      input.setAttribute('aria-invalid', 'true');
      error.textContent = cause.message || 'Unable to parse this input.';
      error.hidden = false;
      status.textContent = 'Check the input error below the editor.';
    }
  }
  input.addEventListener('input', () => {
    invalidate();
    status.textContent = 'Checking input…';
    timer = setTimeout(run, 180);
  });
  input.addEventListener('change', run);
  radios.forEach(radio => radio.addEventListener('change', run));
  doc.getElementById('toml-clear').addEventListener('click', () => {
    input.value = ''; run(); input.focus();
  });
  copy.addEventListener('click', async () => {
    if (!output.value) return;
    const current = revision;
    try {
      await win.navigator.clipboard.writeText(output.value);
      if (current !== revision) return;
      copy.textContent = 'Copied!'; status.textContent = 'Output copied.';
      feedbackTimer = setTimeout(() => { copy.textContent = 'Copy Output'; }, 1800);
    } catch (_) {
      if (current !== revision) return;
      output.focus(); output.select();
      status.textContent = 'Clipboard unavailable. Output selected; press Ctrl+C or Command+C to copy.';
    }
  });
  download.addEventListener('click', () => {
    if (!output.value) return;
    const ext = extension();
    const url = win.URL.createObjectURL(new win.Blob([output.value + '\n'], { type: ext === 'json' ? 'application/json;charset=utf-8' : 'application/toml;charset=utf-8' }));
    const link = doc.createElement('a');
    link.href = url; link.download = `output.${ext}`;
    doc.body.append(link); link.click(); link.remove();
    setTimeout(() => win.URL.revokeObjectURL(url), 1000);
    status.textContent = `Downloaded output.${ext}.`;
  });
  try {
    const saved = win.sessionStorage.getItem(HANDOFF_KEY);
    if (saved !== null) { input.value = saved; win.sessionStorage.removeItem(HANDOFF_KEY); }
  } catch (_) { /* Direct use works even when browser storage is blocked. */ }
  run();
  return Promise.resolve().then(loadParser).then(module => { parser = module; run(); }, () => { unavailable = true; run(); });
}

if (typeof document !== 'undefined') init();
