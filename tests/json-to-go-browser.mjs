import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url).pathname;
const profile = await mkdtemp(join(tmpdir(), 'joinjson-go-'));
const server = spawn(process.execPath, ['server/ai-server.mjs'], { cwd: root, env: { ...process.env, PORT: '8794' }, stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=9254', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://localhost:9254/json')).json()).find(page => page.type === 'page'); if (target) break; } catch {}
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
  await send('Page.navigate', { url: 'http://localhost:8794/' });
  await until(`document.readyState === 'complete' && !!document.querySelector('#tool-menu a[href="/json-to-go"]')`);
  await evaluate(`document.getElementById('tools-trigger').click(); document.querySelector('#tool-menu a[href="/json-to-go"]').click()`);
  await until(`location.pathname === '/json-to-go' && document.getElementById('go-status')?.textContent.startsWith('Ready')`);
  assert.equal(await evaluate(`(() => {const i=document.getElementById('go-json-input'); i.value='{"user_id":1,"profile":{"name":"demo"}}'; i.dispatchEvent(new Event('change')); return document.getElementById('go-output').value.includes('UserID int64');})()`), true);
  assert.equal(await evaluate(`(() => {const m=document.getElementById('go-omitempty'); m.checked=true; m.dispatchEvent(new Event('change')); return document.getElementById('go-output').value.includes(',omitempty');})()`), true);
  assert.equal(await evaluate(`(() => {const i=document.getElementById('go-json-input'); i.value='{'; i.dispatchEvent(new Event('change')); return !document.getElementById('go-error').hidden && document.getElementById('go-copy').disabled;})()`), true);
  await evaluate(`document.getElementById('go-clear').click()`);
  for (const theme of ['light', 'dark']) for (const width of [320, 375, 768, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.documentElement.dataset.theme='${theme}'`);
    const state = await evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth, columns:getComputedStyle(document.querySelector('#go-tool .input-grid')).gridTemplateColumns.split(' ').length, year:document.querySelector('[data-copyright-year]').textContent})`);
    assert.equal(state.overflow, false, JSON.stringify({ width, theme, state }));
    assert.equal(state.columns, width <= 700 ? 1 : 2);
    assert.equal(state.year, String(new Date().getFullYear()));
  }
  // Return to the merger and exercise the real full-result handoff.
  await send('Page.navigate', { url: 'http://localhost:8794/' });
  await until(`document.readyState === 'complete' && !!document.getElementById('merge-go')`);
  await evaluate(`document.getElementById('example').click()`);
  await until(`!document.getElementById('merge').disabled`);
  await evaluate(`document.getElementById('merge').click()`);
  await until(`!document.getElementById('merge-go').disabled`);
  await evaluate(`document.getElementById('merge-go').click()`);
  await until(`location.pathname === '/json-to-go' && !!document.getElementById('go-output')?.value`);
  assert.equal(await evaluate(`document.getElementById('go-json-input').value.includes('Ana')`), true);
  await send('Page.navigate', { url: 'http://localhost:8794/' });
  await until(`document.readyState === 'complete' && !!document.querySelector('footer a[href="/json-to-go"]')`);
  await evaluate(`document.querySelector('footer a[href="/json-to-go"]').click()`);
  await until(`location.pathname === '/json-to-go' && document.getElementById('go-status')?.textContent.startsWith('Ready')`);
  await evaluate(`sessionStorage.setItem('joinjson:go-input','{"transferred":true}');location.reload()`);
  await until(`document.getElementById('go-output')?.value.includes('Transferred bool')`);
  assert.equal(await evaluate(`sessionStorage.getItem('joinjson:go-input')`), null);
  await evaluate(`document.getElementById('go-clear').click()`);
  assert.equal(await evaluate(`document.getElementById('go-json-input').value`), '');
  console.log('PASS: Go generation, options, invalid input, Tools/footer navigation, real merger handoff, clear, current year, and five responsive widths in both themes.');
} finally {
  socket?.close(); chrome.kill(); server.kill(); await wait(300); await rm(profile, { recursive: true, force: true });
}
