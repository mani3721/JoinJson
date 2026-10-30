/* Save pasted text as UTF-8 without parsing, converting, storing, or executing it. */
(function () {
  'use strict';
  const section = document.getElementById('paste-download');
  if (!section) return;
  const get = name => document.getElementById('paste-download-' + name);
  const content = get('content'), type = get('type'), name = get('name');
  const custom = get('extension'), customLabel = get('extension-label');
  const save = get('save'), status = get('status');
  const types = new Set(Array.from(type.options, option => option.value).filter(value => value !== 'custom'));
  function extension() {
    if (types.has(type.value)) return type.value;
    if (type.value !== 'custom') return '';
    const value = custom.value.trim().replace(/^\./, '').toLowerCase();
    return value.length <= 32 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value) ? value : '';
  }
  function filename(ext) {
    let base = name.value.trim().replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_').replace(/[. ]+$/g, '');
    if (!base) base = 'snippet';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = '_' + base;
    return base.toLowerCase().endsWith('.' + ext) ? base : base + '.' + ext;
  }
  function update() {
    customLabel.hidden = type.value !== 'custom';
    const ext = extension();
    custom.setAttribute('aria-invalid', String(!customLabel.hidden && !ext));
    save.disabled = !content.value.length || !ext;
    save.textContent = ext ? 'Download .' + ext : 'Download file';
    status.textContent = !content.value.length ? 'Paste content to enable downloading.' : !ext
      ? 'Enter an extension using letters, numbers, dots, hyphens, or underscores (for example rs or d.ts).'
      : 'Ready to download ' + filename(ext) + '. Content will be saved unchanged as UTF-8.';
  }
  [content, name, custom].forEach(input => input.addEventListener('input', update));
  type.addEventListener('change', update);
  get('clear').addEventListener('click', () => {
    content.value = '';
    update();
    content.focus();
  });
  save.addEventListener('click', () => {
    const ext = extension();
    if (!content.value.length || !ext) { update(); return; }
    let url, link;
    try {
      // Treat every format as a download, never as a runnable preview.
      const blob = new Blob([content.value], { type: 'application/octet-stream' });
      url = URL.createObjectURL(blob);
      link = document.createElement('a');
      link.href = url;
      link.download = filename(ext);
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      status.textContent = 'Download requested: ' + link.download + '.';
    } catch (_) {
      status.textContent = 'Unable to download. Please try again or copy your content manually.';
    } finally {
      if (link) link.remove();
      // Allow browsers time to start reading the Blob before releasing it.
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
  update();
}());
