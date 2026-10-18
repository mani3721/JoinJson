// Run after npm run build; exercises the real CDN parser in Chrome.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url).pathname;
const profile = await mkdtemp(join(tmpdir(), 'joinjson-jsonc-'));
const server = spawn(process.execPath, ['server/ai-server.mjs'], { cwd: root, env: { ...process.env, PORT: '8789' }, stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=9249', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://localhost:9249/json')).json()).find(page => page.type === 'page'); if (target) break; } catch {}
    await wait(100);
  }
  assert.ok(target, 'Chrome started');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const item = pending.get(message.id); pending.delete(message.id);
    message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Page.navigate', { url: 'http://localhost:8789/' });
  let homeReady;
  for (let i = 0; i < 100; i++) {
    homeReady = await evaluate(`document.readyState === 'complete' && !!document.querySelector('#tool-menu a[href="/jsonc-formatter"]')`);
    if (homeReady) break;
    await wait(100);
  }
  assert.ok(homeReady, 'homepage ready');
  await evaluate(`document.getElementById('tools-trigger').click(); document.querySelector('#tool-menu a[href="/jsonc-formatter"]').click()`);
  let ready;
  for (let i = 0; i < 150; i++) {
    ready = await evaluate(`document.readyState === 'complete' && typeof JSON5 !== 'undefined' && typeof JoinJSONC !== 'undefined'`);
    if (ready) break;
    await wait(100);
  }
  assert.ok(ready, 'real CDN parser loaded');
  const input = `// header\n{unquoted:'value', /* block */ list:[1,2,],}`;
  assert.equal(await evaluate(`(() => {
    document.getElementById('jsonc-input').value = ${JSON.stringify(input)};
    document.getElementById('jsonc-format').click();
    const output = document.getElementById('jsonc-output').value;
    return output.includes('// header') && output.includes('/* block */') && JSON5.parse(output).unquoted === 'value';
  })()`), true);
  assert.equal(await evaluate(`(() => {
    document.getElementById('jsonc-standard').click();
    return JSON.parse(document.getElementById('jsonc-output').value).list.length;
  })()`), 2);
  for (const theme of ['light', 'dark']) for (const width of [320, 375, 768, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
    const state = await evaluate(`(() => {
      const grid = document.querySelector('#jsonc-tool .input-grid');
      const textareas = [...grid.querySelectorAll('textarea')];
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        inside: textareas.every(el => { const rect=el.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; }),
        year: document.querySelector('[data-copyright-year]').textContent,
        link: !!document.querySelector('header a[href="/jsonc-formatter"]')
      };
    })()`);
    assert.equal(state.overflow, false, JSON.stringify({ width, theme, state }));
    assert.equal(state.columns, width <= 700 ? 1 : 2);
    assert.ok(state.inside && state.link);
    assert.equal(state.year, String(new Date().getFullYear()));
  }
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await evaluate(`document.getElementById('jsonc-standard').focus()`);
  for (let i = 0; i < 2; i++) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  }
  const focus = await evaluate(`({id:document.activeElement.id, outline:getComputedStyle(document.activeElement).outlineStyle})`);
  assert.equal(focus.id, 'jsonc-input');
  assert.equal(focus.outline, 'solid');
  console.log('PASS: real CDN parsing, comment retention, standard JSON export, header link, current year, keyboard focus, and responsive layouts in two themes at five widths.');
} finally {
  socket?.close(); chrome.kill(); server.kill(); await wait(300); await rm(profile, { recursive: true, force: true });
}
