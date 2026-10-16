/* One-time, explicit cross-page JSON handoff; never retain imported payloads. */
(function () {
  'use strict';
  const input = document.getElementById('first');
  if (!input || !['/', '/index.html', '/json-merge'].includes(location.pathname)) return;
  try {
    const stored = localStorage.getItem('jm:curl-payload');
    if (!stored) return;
    localStorage.removeItem('jm:curl-payload');
    const entry = JSON.parse(stored);
    if (typeof entry.text !== 'string' || !Number.isFinite(entry.createdAt) || Date.now() - entry.createdAt > 120000 || entry.createdAt > Date.now()) return;
    JSON.parse(entry.text);
    input.value = entry.text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const status = document.getElementById('status');
    if (status) status.textContent = 'cURL JSON body loaded into the first input. Add a second JSON value to merge.';
  } catch (_) { /* Malformed, expired, or blocked storage never interrupts the merger. */ }
}());
