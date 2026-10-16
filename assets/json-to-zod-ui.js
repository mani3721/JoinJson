/* SPA tool switching preserves both workspaces; JSON never leaves this tab. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const menu = $('tool-menu'), section = $('zod-tool');
  if (!menu) return;
  const links = menu.querySelectorAll('a[data-tool]');
  // Disclosure behavior belongs to the shared header, not the tool router.
  function closeMenu() {
    document.dispatchEvent(new CustomEvent('jm:tool-change'));
  }
  if (!section) {
    links.forEach(link => link.removeAttribute('aria-current'));
    return;
  }
  const input = $('zod-input'), output = $('zod-output'), badge = $('zod-input-status');
  const originalTitle = document.title;
  let timer, exportType = false;
  function announce(message) { $('zod-action-status').textContent = message; }
  function invalidate() {
    output.value = '';
    $('zod-copy').disabled = $('zod-download').disabled = true;
    announce('');
  }
  function convert() {
    clearTimeout(timer);
    invalidate();
    input.setAttribute('aria-invalid', 'false');
    badge.dataset.state = $('zod-input-card').dataset.state = 'empty';
    badge.textContent = 'Enter JSON to generate a schema.';
    if (!input.value.trim()) return;
    try {
      output.value = window.JsonToZod.convert(input.value, exportType);
      badge.textContent = 'Valid JSON ✓ · Schema generated';
      badge.dataset.state = $('zod-input-card').dataset.state = 'valid';
      $('zod-copy').disabled = $('zod-download').disabled = false;
    } catch (error) {
      badge.dataset.state = $('zod-input-card').dataset.state = 'error';
      input.setAttribute('aria-invalid', 'true');
      if (error instanceof SyntaxError) {
        const details = window.JsonErrorHelper.checkJson(input.value);
        const line = details.line || input.value.split('\n').length;
        badge.textContent = 'Error on line ' + line + ': ' + details.message;
      } else badge.textContent = error.message;
    }
  }
  function route(focus = false) {
    const url = new URL(window.location.href);
    const requested = url.searchParams.get('tool') || url.pathname.replace(/\/$/, '').slice(1);
    const tool = ['json-to-zod', 'json-to-typescript', 'json-to-python', 'json-to-yaml', 'json-diff'].includes(requested) ? requested : 'merge';
    const pathname = tool === 'merge' ? '/' : '/' + tool;
    if (url.pathname !== pathname || url.searchParams.has('tool')) {
      url.pathname = pathname;
      url.searchParams.delete('tool');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    const active = tool === 'json-to-zod';
    document.body.dataset.tool = tool;
    links.forEach(link => {
      if (link.dataset.tool === document.body.dataset.tool) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    $('tool-current').textContent = tool === 'json-diff' ? 'JSON Diff & Compare' : active ? 'JSON to Zod Schema' : tool === 'json-to-typescript' ? 'JSON to TypeScript' : tool === 'json-to-python' ? 'JSON to Python (Pydantic)' : tool === 'json-to-yaml' ? 'JSON ⇄ YAML Converter' : 'JSON Merger';
    closeMenu();
    section.hidden = !active;
    if ($('json-diff-tool')) $('json-diff-tool').hidden = tool !== 'json-diff';
    if ($('typescript-tool')) $('typescript-tool').hidden = tool !== 'json-to-typescript';
    if ($('python-converter-tool')) $('python-converter-tool').hidden = tool !== 'json-to-python';
    if ($('yaml-converter-tool')) $('yaml-converter-tool').hidden = tool !== 'json-to-yaml';
    document.title = tool === 'json-diff' ? 'Online JSON Diff & Compare Tool | JoinJSON' : active ? 'JSON to Zod Schema Converter — Free & Private | JoinJson' : tool === 'json-to-typescript' ? 'JSON to TypeScript Converter — Free & Private | JoinJson' : tool === 'json-to-python' ? 'JSON to Python Pydantic Model Converter | JoinJSON' : tool === 'json-to-yaml' ? 'JSON to YAML & YAML to JSON Converter | JoinJSON' : originalTitle;
    if (focus && tool !== 'merge') $(tool === 'json-diff' ? 'json-diff-title' : active ? 'zod-title' : tool === 'json-to-python' ? 'python-title' : tool === 'json-to-yaml' ? 'yaml-title' : 'typescript-title')?.focus();
    document.dispatchEvent(new CustomEvent('jm:tool-change', { detail: { tool: document.body.dataset.tool } }));
  }
  menu.addEventListener('click', event => {
    const link = event.target.closest('a[data-tool]');
    if (!link || !menu.contains(link) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    closeMenu(true);
    if (link.dataset.tool === document.body.dataset.tool) return;
    navigate(link.dataset.tool);
  });
  function navigate(tool) {
    const url = new URL(window.location.href);
    url.pathname = tool === 'merge' ? '/' : '/' + tool;
    url.searchParams.delete('tool');
    url.hash = '';
    window.history.pushState(null, '', url.pathname + url.search);
    route(true);
  }
  document.addEventListener('jm:tool-open', event => {
    const { tool, text } = event.detail || {};
    if (!['json-to-zod', 'json-to-typescript', 'json-to-python', 'json-to-yaml', 'json-diff'].includes(tool) || typeof text !== 'string') return;
    const target = $(tool === 'json-diff' ? 'diff-input-a' : tool === 'json-to-zod' ? 'zod-input' : tool === 'json-to-python' ? 'python-json-input' : tool === 'json-to-yaml' ? 'yaml-input' : 'typescript-input');
    if (!target) return;
    if (tool === 'json-to-yaml') $('yaml-to-yaml').checked = true;
    target.value = text;
    target.dispatchEvent(new Event('change', { bubbles: true }));
    navigate(tool);
  });
  window.addEventListener('popstate', () => route());
  input.addEventListener('change', convert);
  input.addEventListener('input', () => {
    invalidate();
    clearTimeout(timer);
    badge.textContent = 'Checking JSON…';
    badge.dataset.state = 'empty';
    timer = setTimeout(convert, 180);
  });
  $('zod-example').addEventListener('click', () => {
    input.value = JSON.stringify({ name: 'Ana', age: 28, active: true, tags: ['design', 'code'], profile: { city: 'Chennai' }, deletedAt: null }, null, 2);
    convert();
  });
  $('zod-clear').addEventListener('click', () => {
    input.value = '';
    convert();
    // Clear editor history too, so cleared private input cannot be restored by Undo.
    document.dispatchEvent(new CustomEvent('jm:zod-clear'));
    input.focus();
  });
  $('zod-type').addEventListener('click', () => {
    exportType = !exportType;
    $('zod-type').setAttribute('aria-pressed', String(exportType));
    convert();
  });
  $('zod-copy').addEventListener('click', async () => {
    if (!output.value) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(output.value);
      announce('Zod schema copied.');
    } catch (_) { announce('Clipboard access is unavailable. Select and copy the code, or download the .ts file.'); }
  });
  $('zod-download').addEventListener('click', () => {
    if (!output.value) return;
    const url = URL.createObjectURL(new Blob([output.value], { type: 'text/typescript;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'schema.ts';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('Zod schema downloaded.');
  });
  route();
}());
