import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url).pathname;
const profile = await mkdtemp(join(tmpdir(), 'joinjson-toml-'));
const server = spawn(process.execPath, ['server/ai-server.mjs'], { cwd: root, env: { ...process.env, PORT: '8793' }, stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=9253', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://localhost:9253/json')).json()).find(page => page.type === 'page'); if (target) break; } catch {}
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
  const until = async expression => {
    for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await wait(100); }
    assert.fail('Timed out: ' + expression);
  };
  await send('Page.navigate', { url: 'http://localhost:8793/' });
  await until(`document.readyState === 'complete' && !!document.querySelector('#tool-menu a[href="/json-to-toml"]')`);
  await evaluate(`document.getElementById('tools-trigger').click(); document.querySelector('#tool-menu a[href="/json-to-toml"]').click()`);
  await until(`location.pathname === '/json-to-toml' && document.getElementById('toml-status')?.textContent.startsWith('Ready')`);
  assert.equal(await evaluate(`(() => {const i=document.getElementById('toml-input'); i.value='{"package":{"name":"demo"}}'; i.dispatchEvent(new Event('change')); return document.getElementById('toml-output').value.includes('[package]');})()`), true);
  assert.equal(await evaluate(`(() => {const i=document.getElementById('toml-input'); i.value='[project]\\nname="demo"'; const m=document.querySelector('[value="toml-to-json"]'); m.checked=true; m.dispatchEvent(new Event('change')); return JSON.parse(document.getElementById('toml-output').value).project.name;})()`), 'demo');
  assert.equal(await evaluate(`(() => {const m=document.querySelector('[value="toml-formatter"]'); m.checked=true; m.dispatchEvent(new Event('change')); return document.getElementById('toml-output').value.includes('[project]');})()`), true);
  for (const theme of ['light', 'dark']) for (const width of [320, 375, 768, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.documentElement.dataset.theme='${theme}'`);
    const state = await evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth, columns:getComputedStyle(document.querySelector('#toml-tool .input-grid')).gridTemplateColumns.split(' ').length, year:document.querySelector('[data-copyright-year]').textContent})`);
    assert.equal(state.overflow, false, JSON.stringify({ width, theme, state }));
    assert.equal(state.columns, width <= 700 ? 1 : 2);
    assert.equal(state.year, String(new Date().getFullYear()));
  }
  // Return to the merger and exercise the real full-result handoff.
  await send('Page.navigate', { url: 'http://localhost:8793/' });
  await until(`document.readyState === 'complete' && !!document.getElementById('merge-toml')`);
  await evaluate(`document.getElementById('example').click()`);
  await until(`!document.getElementById('merge').disabled`);
  await evaluate(`document.getElementById('merge').click()`);
  await until(`!document.getElementById('merge-toml').disabled`);
  await evaluate(`document.getElementById('merge-toml').click()`);
  await until(`location.pathname === '/json-to-toml' && !!document.getElementById('toml-output')?.value`);
  assert.equal(await evaluate(`document.getElementById('toml-input').value.includes('Ana')`), true);
  await send('Page.navigate', { url: 'http://localhost:8793/' });
  await until(`document.readyState === 'complete' && !!document.querySelector('footer a[href="/json-to-toml"]')`);
  await evaluate(`document.querySelector('footer a[href="/json-to-toml"]').click()`);
  await until(`location.pathname === '/json-to-toml' && document.getElementById('toml-status')?.textContent.startsWith('Ready')`);
  await evaluate(`sessionStorage.setItem('joinjson:toml-input','{"transferred":true}');location.reload()`);
  await until(`document.getElementById('toml-output')?.value.includes('transferred = true')`);
  assert.equal(await evaluate(`sessionStorage.getItem('joinjson:toml-input')`), null);
  await evaluate(`document.getElementById('toml-clear').click()`);
  assert.equal(await evaluate(`document.getElementById('toml-input').value`), '');
  console.log('PASS: real CDN conversion in all modes, native Tools/footer navigation, one-time handoff loading, clear, current year, and responsive layouts at five widths in both themes.');
} finally {
  socket?.close(); chrome.kill(); server.kill(); await wait(300); await rm(profile, { recursive: true, force: true });
}
