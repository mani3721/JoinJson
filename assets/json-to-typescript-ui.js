/* Reuses shared SPA navigation and editor enhancement; all data stays in memory. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const input = $('typescript-input'), output = $('typescript-output');
  if (!input) return;
  const badge = $('typescript-input-status'), optionStatus = $('typescript-options-status');
  const actions = ['typescript-copy', 'typescript-download', 'typescript-zod'];
  let timer;
  function announce(message) { $('typescript-action-status').textContent = message; }
  function invalidate() {
    output.value = '';
    actions.forEach(id => { $(id).disabled = true; });
    announce('');
  }
  function convert() {
    clearTimeout(timer);
    invalidate();
    input.setAttribute('aria-invalid', 'false');
    $('typescript-root').setAttribute('aria-invalid', 'false');
    optionStatus.textContent = '';
    badge.dataset.state = $('typescript-input-card').dataset.state = 'empty';
    badge.textContent = 'Enter JSON to generate TypeScript.';
    if (!input.value.trim()) return;
    try {
      // Bound work before parsing; option errors must not mark valid JSON as malformed.
      if (input.value.length > window.JsonToTypeScript.MAX_LENGTH) throw new Error('Input is limited to 1 MB to keep conversion responsive.');
      JSON.parse(input.value);
      badge.textContent = 'Valid JSON ✓';
      badge.dataset.state = $('typescript-input-card').dataset.state = 'valid';
      if (!window.JsonToTypeScript.validName($('typescript-root').value.trim())) {
        $('typescript-root').setAttribute('aria-invalid', 'true');
        optionStatus.textContent = 'Root Type Name must be a valid, non-reserved TypeScript identifier.';
        return;
      }
      output.value = window.JsonToTypeScript.convert(input.value, {
        mode: $('typescript-mode').value,
        optional: $('typescript-optional').checked,
        export: $('typescript-export').checked,
        rootName: $('typescript-root').value
      });
      badge.textContent = 'Valid JSON ✓ · TypeScript generated';
      actions.forEach(id => { $(id).disabled = false; });
    } catch (error) {
      badge.dataset.state = $('typescript-input-card').dataset.state = 'error';
      if (error instanceof SyntaxError) {
        input.setAttribute('aria-invalid', 'true');
        const details = window.JsonErrorHelper.checkJson(input.value);
        badge.textContent = 'Error on line ' + (details.line || input.value.split('\n').length) + ': ' + details.message;
      } else badge.textContent = error.message;
    }
  }
  input.addEventListener('input', () => {
    invalidate();
    clearTimeout(timer);
    badge.textContent = 'Checking JSON…';
    badge.dataset.state = 'empty';
    timer = setTimeout(convert, 180);
  });
  input.addEventListener('change', convert);
  ['typescript-mode', 'typescript-optional', 'typescript-export'].forEach(id => $(id).addEventListener('change', convert));
  $('typescript-root').addEventListener('input', convert);
  $('typescript-example').addEventListener('click', () => {
    input.value = JSON.stringify({ name: 'Ana', age: 28, active: true, tags: ['design', 'code'], profile: { city: 'Chennai' }, deletedAt: null }, null, 2);
    convert();
  });
  $('typescript-clear').addEventListener('click', () => {
    input.value = '';
    convert();
    document.dispatchEvent(new CustomEvent('jm:typescript-clear'));
    input.focus();
  });
  $('typescript-copy').addEventListener('click', async () => {
    if (!output.value) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(output.value);
      announce('TypeScript copied.');
    } catch (_) { announce('Clipboard access is unavailable. Select and copy the code, or download the .ts file.'); }
  });
  $('typescript-download').addEventListener('click', () => {
    if (!output.value) return;
    const url = URL.createObjectURL(new Blob([output.value], { type: 'text/typescript;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = $('typescript-root').value.trim() + '.ts';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('TypeScript downloaded.');
  });
  $('typescript-zod').addEventListener('click', () => {
    if (!output.value) return;
    document.dispatchEvent(new CustomEvent('jm:tool-open', { detail: { tool: 'json-to-zod', text: input.value } }));
  });
}());
