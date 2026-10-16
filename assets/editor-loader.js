/* First-paint-safe enhancement. Failure leaves all fallback controls intact. */
(function () {
  'use strict';
  let loading;
  function load() {
    if (loading) return loading;
    loading = import('./codemirror.js').then(module => module.enhance()).catch(() => {
      loading = null; // A later interaction may retry; never log input or exceptions.
    });
    return loading;
  }
  document.addEventListener('focusin', event => {
    if (event.target.matches && event.target.matches('#first, #second, #preview, #paste, #zod-input, #zod-output, #typescript-input, #typescript-output, #python-json-input, #python-output, #yaml-input, #yaml-output, #diff-input-a, #diff-input-b, [id^="format-input-"]')) load();
  });
  document.addEventListener('pointerdown', event => {
    if (event.target.closest && event.target.closest('.editor-pane, .code-box')) load();
  }, { passive: true });
  document.addEventListener('jm:tool-change', () => { if (window.JMEditors) load().then(() => import('./codemirror.js')).then(module => module.enhance()).catch(() => {}); });
  window.addEventListener('load', () => {
    const first = document.getElementById('first');
    // Preserve deep-link navigation and any focus the user established while loading.
    if (first && (!document.body.dataset.tool || document.body.dataset.tool === 'merge') && !window.location.hash && document.activeElement === document.body) {
      first.focus({ preventScroll: true });
    }
    if (window.requestIdleCallback) window.requestIdleCallback(load, { timeout: 2000 });
    else setTimeout(load, 300);
  }, { once: true });
}());
