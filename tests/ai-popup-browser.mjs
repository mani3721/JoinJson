/* Responsive popup checks in Chrome; no AI requests or provider calls. */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const profile = await mkdtemp(join(tmpdir(), 'jm-ai-popup-'));
const server = spawn('python3', ['-m', 'http.server', '8779', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=9239', '--user-data-dir=' + profile, 'http://127.0.0.1:8779'], { stdio: 'ignore' });
let socket;
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://127.0.0.1:9239/json')).json()).find(page => page.type === 'page'); if (target) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(target, 'Chrome debugging target available');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let seq = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const p = pending.get(message.id); pending.delete(message.id);
    message.error ? p.reject(new Error(message.error.message)) : p.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
  };
  let ready = false;
  for (let i = 0; i < 100; i++) {
    ready = await evaluate('!!document.getElementById("ai-toggle") && !document.getElementById("ai-toggle").hidden');
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'Popup initialized');
  assert.equal(await evaluate('document.getElementById("ai-assistant").hidden'), true);
  for (const theme of ['light', 'dark']) for (const [width, height] of [[320, 568], [375, 667], [768, 1000], [1440, 900], [667, 375]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}; document.getElementById('ai-toggle').click()`);
    const state = await evaluate(`(() => {
      const panel = document.getElementById('ai-assistant'), rect = panel.getBoundingClientRect();
      const launcher = document.getElementById('ai-toggle').getBoundingClientRect();
      const body = panel.querySelector('.ai-body');
      return { hidden: panel.hidden, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, launcherTop: launcher.top, viewportWidth: innerWidth, viewportHeight: innerHeight, focus: document.activeElement.id, scrollable: getComputedStyle(body).overflowY, pageWidth: document.documentElement.scrollWidth };
    })()`);
    assert.equal(state.hidden, false); assert.equal(state.focus, 'ai-prompt');
    assert(state.left >= 0 && state.top >= 0 && state.right <= state.viewportWidth && state.bottom <= state.viewportHeight, `${theme} popup outside ${width}x${height}`);
    assert(state.width <= 380); assert(state.bottom <= state.launcherTop); assert.equal(state.scrollable, 'auto');
    assert(state.pageWidth <= state.viewportWidth, 'No horizontal page overflow');
    await evaluate('document.getElementById("ai-close").click()');
    assert.equal(await evaluate('document.getElementById("ai-assistant").hidden'), true);
  }
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  assert.equal(await evaluate('getComputedStyle(document.getElementById("ai-toggle")).display'), 'none');
  console.log('PASS compact popup: light/dark, 320/375/768/1440 and landscape, focus, scrolling, viewport bounds and print.');
} finally {
  socket?.close(); chrome.kill(); server.kill();
  await new Promise(resolve => setTimeout(resolve, 300));
  await rm(profile, { recursive: true, force: true });
}
