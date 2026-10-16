/* Only an explicit Extract click persists a JSON body for the next page. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const input = $('curl-input'), output = $('curl-output');
  if (!input) return;
  const status = $('curl-input-status'), copy = $('curl-copy'), download = $('curl-download'), extract = $('curl-extract');
  const announce = message => { $('curl-action-status').textContent = message; };
  let timer, copyTimer, payload = null;
  const selected = document.querySelector('#tool-menu a[href="/curl-to-js"]');
  if (selected) selected.setAttribute('aria-current', 'page');
  if ($('tool-current')) $('tool-current').textContent = 'cURL to Fetch/Axios';
  function update() {
    clearTimeout(timer);
    output.value = ''; payload = null;
    copy.disabled = download.disabled = extract.disabled = true;
    input.setAttribute('aria-invalid', 'false');
    announce('');
    status.dataset.state = 'empty';
    status.textContent = 'Paste one cURL command to generate JavaScript.';
    if (!input.value.trim()) return;
    try {
      const request = window.CurlToJS.parse(input.value);
      payload = window.CurlToJS.extractJSON(request);
      extract.disabled = payload === null;
      output.value = window.CurlToJS.generate(request, $('curl-target').value);
      copy.disabled = download.disabled = false;
      status.dataset.state = 'valid';
      status.textContent = 'Code generated locally. No request was sent.';
    } catch (error) {
      input.setAttribute('aria-invalid', 'true');
      status.dataset.state = 'error';
      status.textContent = error.message;
    }
  }
  function schedule() {
    output.value = ''; payload = null;
    copy.disabled = download.disabled = extract.disabled = true;
    clearTimeout(timer); timer = setTimeout(update, 120);
  }
  ['input', 'keyup'].forEach(event => input.addEventListener(event, schedule));
  input.addEventListener('paste', () => { setTimeout(schedule, 0); });
  input.addEventListener('change', update);
  $('curl-target').addEventListener('change', update);
  $('curl-clear').addEventListener('click', () => { input.value = ''; update(); input.focus(); });
  $('curl-example').addEventListener('click', () => {
    input.value = `curl -X POST 'https://api.example.com/data' -H 'Content-Type: application/json' --data-raw '{"name":"Ana","active":true}'`;
    update();
  });
  copy.addEventListener('click', async () => {
    const code = output.value;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      copy.textContent = 'Copied!'; announce('JavaScript copied.');
      clearTimeout(copyTimer); copyTimer = setTimeout(() => { copy.textContent = 'Copy Code'; }, 1600);
    } catch (_) { announce('Clipboard unavailable. Select the output and copy it, or download the file.'); }
  });
  download.addEventListener('click', () => {
    if (!output.value) return;
    const url = URL.createObjectURL(new Blob([output.value], { type: 'text/javascript;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'request-' + $('curl-target').value + '.js';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('JavaScript downloaded.');
  });
  extract.addEventListener('click', () => {
    update();
    if (payload === null) return;
    try {
      localStorage.setItem('jm:curl-payload', JSON.stringify({ text: payload, createdAt: Date.now() }));
      window.location.assign('/');
    } catch (_) { announce('Browser storage is unavailable. Copy the JSON payload into the merger manually.'); }
  });
  update();
}());
