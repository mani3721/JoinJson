/* Opt-in browser URL imports. No proxy, storage, cookies or referrer. */
(function (root) {
  'use strict';
  const EXAMPLE_URL = 'https://microsoftedge.github.io/Demos/json-dummy-data/5MB.json';
  const MAX_BYTES = 20 * 1024 * 1024;
  const TIMEOUT_MS = 45000;
  function validateUrl(value) {
    let url;
    try { url = new URL(String(value).trim()); }
    catch (_) { throw new Error('Enter a complete HTTPS JSON URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('Use an HTTPS URL without a username or password.');
    }
    url.hash = '';
    return url;
  }
  async function fetchJson(value, options) {
    const opts = options || {}, url = validateUrl(value);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) abort();
      else opts.signal.addEventListener('abort', abort, { once: true });
    }
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort(); }, TIMEOUT_MS);
    let reader;
    try {
      const response = await (opts.fetch || root.fetch)(url.href, {
        method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
        cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response.ok) throw new Error('Source returned HTTP ' + response.status + '. Check the URL.');
      if (response.url) validateUrl(response.url);
      if (Number(response.headers.get('content-length')) > MAX_BYTES) {
        if (response.body) await response.body.cancel();
        throw new Error('JSON downloads are limited to 20 MB.');
      }
      let text;
      if (response.body && response.body.getReader) {
        reader = response.body.getReader();
        const decoder = new TextDecoder(), chunks = [];
        let bytes = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('JSON downloads are limited to 20 MB.'); }
          chunks.push(decoder.decode(chunk.value, { stream: true }));
        }
        chunks.push(decoder.decode()); text = chunks.join('');
      } else {
        text = await response.text();
        if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('JSON downloads are limited to 20 MB.');
      }
      if (controller.signal.aborted) throw new Error('Download cancelled.');
      try { JSON.parse(text); }
      catch (_) { throw new Error('The source did not return valid JSON. Existing inputs were kept.'); }
      const finalUrl = response.url ? validateUrl(response.url) : url;
      let name = finalUrl.pathname.split('/').filter(Boolean).pop() || 'remote.json';
      try { name = decodeURIComponent(name); } catch (_) {}
      // Never include secret query parameters or the full URL in the source label.
      return { name: name.slice(0, 160), text };
    } catch (error) {
      if (timedOut) throw new Error('Download timed out. Try again or upload the file.');
      if (controller.signal.aborted) throw new Error('Download cancelled.');
      if (error instanceof TypeError) throw new Error('Could not fetch JSON. Check the URL, connection, and source CORS settings.');
      throw error;
    } finally {
      clearTimeout(timer);
      if (reader) reader.releaseLock();
      if (opts.signal) opts.signal.removeEventListener('abort', abort);
    }
  }
  const api = { validateUrl, fetchJson, EXAMPLE_URL, MAX_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;
  root.JMJsonUrl = api;
  const document = root.document;
  document.querySelectorAll('[data-json-url]').forEach(panel => {
    const target = panel.dataset.jsonUrl;
    const input = document.getElementById(target + '-url');
    const status = document.getElementById(target + '-url-status');
    const load = panel.querySelector('[data-url-load]');
    const cancel = panel.querySelector('[data-url-cancel]');
    const example = panel.querySelector('[data-url-example]');
    let pending = null;
    function busy(value) {
      load.disabled = value; input.disabled = value; example.disabled = value;
      cancel.hidden = !value; panel.setAttribute('aria-busy', String(value));
    }
    function reset() {
      if (pending) pending.abort();
      pending = null; busy(false); status.textContent = ''; delete panel.dataset.state;
    }
    example.onclick = () => { input.value = EXAMPLE_URL; input.focus(); };
    cancel.onclick = () => {
      reset(); status.textContent = 'Download cancelled.'; load.focus();
    };
    load.onclick = async () => {
      if (pending) return;
      const controller = new AbortController();
      pending = controller;
      const original = target === 'advanced' ? null : document.getElementById(target).value;
      busy(true); panel.dataset.state = 'loading'; status.textContent = 'Loading JSON…';
      try {
        const source = await fetchJson(input.value, { signal: controller.signal });
        if (pending !== controller) return;
        if (target === 'advanced') root.JMFlow.addSource(source);
        else {
          const editor = document.getElementById(target);
          if (editor.value !== original) throw new Error('Input changed while loading. Load again to replace it.');
          editor.value = source.text;
          editor.dispatchEvent(new root.Event('input', { bubbles: true }));
        }
        panel.dataset.state = 'success'; status.textContent = 'Loaded ' + source.name + '.';
      } catch (error) {
        if (pending !== controller) return;
        panel.dataset.state = 'error'; status.textContent = error.message;
      } finally {
        if (pending === controller) { pending = null; busy(false); }
      }
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); load.click(); }
    });
    document.getElementById('clear-data').addEventListener('click', () => { reset(); input.value = ''; });
    root.addEventListener('pagehide', reset);
    busy(false);
  });
}(typeof window === 'undefined' ? globalThis : window));
