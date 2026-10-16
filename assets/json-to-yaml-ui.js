/* Shared converter UI; input and output remain in tab memory only. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const input = $('yaml-input'), output = $('yaml-output');
  if (!input) return;
  const badge = $('yaml-input-status'), card = $('yaml-input-card');
  let timer;
  const direction = () => document.querySelector('input[name="yaml-direction"]:checked').value;
  function announce(text) { $('yaml-action-status').textContent = text; }
  function invalidate() {
    output.value = '';
    $('yaml-copy').disabled = $('yaml-download').disabled = true;
    announce('');
  }
  function convert() {
    clearTimeout(timer);
    invalidate();
    const toYaml = direction() === 'json-to-yaml';
    const from = toYaml ? 'JSON' : 'YAML', to = toYaml ? 'YAML' : 'JSON';
    $('yaml-input-heading').textContent = 'Input ' + from;
    $('yaml-output-heading').textContent = to + ' Output';
    $('yaml-input-label').textContent = toYaml ? 'input.json' : 'input.yaml';
    $('yaml-output-label').textContent = toYaml ? 'output.yaml' : 'output.json';
    $('yaml-output-format').textContent = to;
    $('yaml-download').textContent = 'Download .' + (toYaml ? 'yaml' : 'json') + ' File';
    input.setAttribute('aria-label', 'Input ' + from + ' for conversion');
    output.setAttribute('aria-label', 'Converted ' + to + ' output');
    input.setAttribute('aria-invalid', 'false');
    badge.dataset.state = card.dataset.state = 'empty';
    badge.textContent = 'Enter ' + from + ' to convert to ' + to + '.';
    if (!input.value.trim()) return;
    try {
      output.value = window.JsonToYaml.convert(input.value, { direction: direction(), indent: $('yaml-indent').value });
      badge.dataset.state = card.dataset.state = 'valid';
      badge.textContent = 'Valid ' + from + ' ✓ · ' + to + ' generated';
      $('yaml-copy').disabled = $('yaml-download').disabled = false;
    } catch (error) {
      badge.dataset.state = card.dataset.state = 'error';
      input.setAttribute('aria-invalid', 'true');
      if (toYaml && error instanceof SyntaxError) {
        const details = window.JsonErrorHelper.checkJson(input.value);
        badge.textContent = 'Error on line ' + (details.line || input.value.split('\n').length) + ': ' + details.message;
      } else if (error.mark) {
        badge.textContent = 'Error on line ' + (error.mark.line + 1) + ', column ' + (error.mark.column + 1) + ': ' + error.reason;
      } else badge.textContent = error.message;
    }
  }
  function schedule() {
    clearTimeout(timer);
    invalidate();
    badge.dataset.state = card.dataset.state = 'empty';
    badge.textContent = 'Checking input…';
    timer = setTimeout(convert, 180);
  }
  ['input', 'keyup', 'paste'].forEach(event => input.addEventListener(event, schedule));
  input.addEventListener('change', convert);
  document.querySelectorAll('input[name="yaml-direction"], #yaml-indent').forEach(control => control.addEventListener('change', convert));
  $('yaml-example').addEventListener('click', () => {
    input.value = direction() === 'json-to-yaml'
      ? JSON.stringify({ name: 'Ana', active: true, tags: ['design', 'code'], profile: { city: 'Chennai' } }, null, 2)
      : 'name: Ana\nactive: true\ntags:\n  - design\n  - code\nprofile:\n  city: Chennai\n';
    convert();
  });
  $('yaml-clear').addEventListener('click', () => {
    input.value = '';
    convert();
    document.dispatchEvent(new CustomEvent('jm:yaml-clear'));
    input.focus();
  });
  $('yaml-copy').addEventListener('click', async () => {
    if (!output.value) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(output.value);
      announce('Output copied.');
    } catch (_) { announce('Clipboard access is unavailable. Select and copy the output, or download the file.'); }
  });
  $('yaml-download').addEventListener('click', () => {
    if (!output.value) return;
    const toYaml = direction() === 'json-to-yaml';
    const url = URL.createObjectURL(new Blob([output.value], { type: (toYaml ? 'application/yaml' : 'application/json') + ';charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = toYaml ? 'output.yaml' : 'output.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('Converted file downloaded.');
  });
  convert();
}());
