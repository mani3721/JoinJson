(function () {
  'use strict';
  const input = document.getElementById('jsonc-input');
  const output = document.getElementById('jsonc-output');
  const status = document.getElementById('jsonc-status');
  const copy = document.getElementById('jsonc-copy');
  const indentation = document.getElementById('jsonc-indent');
  let revision = 0;
  function invalidate() {
    revision++;
    output.value = '';
    copy.disabled = true;
    input.removeAttribute('aria-invalid');
    status.dataset.state = '';
    status.textContent = 'Ready to format. Your input stays in this browser.';
  }
  input.addEventListener('input', invalidate);
  indentation.addEventListener('change', invalidate);
  function run(standard) {
    revision++;
    try {
      output.value = window.JoinJSONC.format(input.value, Number(indentation.value), standard);
      copy.disabled = false;
      input.removeAttribute('aria-invalid');
      status.dataset.state = 'success';
      status.textContent = standard ? 'Valid standard JSON. Comments removed.' : 'Valid JSON5. All comments preserved.';
      document.getElementById('jsonc-output-label').textContent = standard ? 'Standard JSON output' : 'Formatted JSON5 output';
    } catch (error) {
      output.value = '';
      copy.disabled = true;
      input.setAttribute('aria-invalid', 'true');
      status.dataset.state = 'error';
      status.textContent = error.message;
    }
  }
  document.getElementById('jsonc-format').addEventListener('click', () => run(false));
  document.getElementById('jsonc-standard').addEventListener('click', () => run(true));
  copy.addEventListener('click', async () => {
    const current = revision;
    try {
      await navigator.clipboard.writeText(output.value);
      if (current === revision) status.textContent = 'Output copied to clipboard.';
    } catch (_) {
      if (current !== revision) return;
      output.focus(); output.select();
      status.textContent = 'Clipboard unavailable. Output selected; press Ctrl+C or Command+C to copy.';
    }
  });
}());
