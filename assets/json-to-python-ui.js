/* Shared converter UI conventions; payloads remain in this tab only. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const input = $('python-json-input'), output = $('python-output');
  if (!input) return;
  const badge = $('python-input-status'), card = $('python-input-card');
  let timer;
  function announce(message) { $('python-action-status').textContent = message; }
  function invalidate() {
    output.value = '';
    $('python-copy').disabled = $('python-download').disabled = true;
    announce('');
  }
  function convert() {
    clearTimeout(timer);
    invalidate();
    input.setAttribute('aria-invalid', 'false');
    badge.dataset.state = card.dataset.state = 'empty';
    badge.textContent = 'Enter JSON to generate Python models.';
    if (!input.value.trim()) return;
    try {
      output.value = window.JsonToPython.convert(input.value, {
        framework: document.querySelector('input[name="python-framework"]:checked').value,
        optional: $('python-optional').checked
      });
      badge.dataset.state = card.dataset.state = 'valid';
      badge.textContent = 'Valid JSON ✓ · Python generated';
      $('python-copy').disabled = $('python-download').disabled = false;
    } catch (error) {
      badge.dataset.state = card.dataset.state = 'error';
      if (error instanceof SyntaxError) {
        input.setAttribute('aria-invalid', 'true');
        const details = window.JsonErrorHelper.checkJson(input.value);
        badge.textContent = 'Error on line ' + (details.line || input.value.split('\n').length) + ': ' + details.message;
      } else badge.textContent = error.message;
    }
  }
  function schedule() {
    clearTimeout(timer);
    invalidate();
    badge.dataset.state = card.dataset.state = 'empty';
    badge.textContent = 'Checking JSON…';
    timer = setTimeout(convert, 180);
  }
  ['input', 'keyup', 'paste'].forEach(event => input.addEventListener(event, schedule));
  input.addEventListener('change', convert);
  document.querySelectorAll('input[name="python-framework"], #python-optional').forEach(control => control.addEventListener('change', convert));
  $('python-example').addEventListener('click', () => {
    input.value = JSON.stringify({ name: 'Ana', age: 28, active: true, tags: ['design', 'code'], profile: { city: 'Chennai' }, deletedAt: null }, null, 2);
    convert();
  });
  $('python-clear').addEventListener('click', () => {
    input.value = '';
    convert();
    document.dispatchEvent(new CustomEvent('jm:python-clear'));
    input.focus();
  });
  $('python-copy').addEventListener('click', async () => {
    if (!output.value) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(output.value);
      announce('Python code copied.');
    } catch (_) { announce('Clipboard access is unavailable. Select and copy the code, or download the .py file.'); }
  });
  $('python-download').addEventListener('click', () => {
    if (!output.value) return;
    const url = URL.createObjectURL(new Blob([output.value], { type: 'text/x-python;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'models.py';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('Python models downloaded.');
  });
}());
