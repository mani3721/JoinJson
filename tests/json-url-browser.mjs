/* Real Chrome URL-import layout and existing-editor integration checks. */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const profile = await mkdtemp(join(tmpdir(), 'joinjson-url-'));
const server = spawn('python3', ['-m', 'http.server', '8782'], { stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=9242', '--user-data-dir=' + profile, 'http://localhost:8782'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://localhost:9242/json')).json()).find(page => page.type === 'page'); } catch {}
    if (target) break;
    await wait(100);
  }
  assert.ok(target);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let seq = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const task = pending.get(message.id); pending.delete(message.id);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  for (let i = 0; i < 100; i++) {
    if (await evaluate('!!window.JMJsonUrl && !!window.JMEditors')) break;
    await wait(100);
  }
  assert.equal(await evaluate('!!window.JMJsonUrl && !!window.JMEditors'), true);
  for (const width of [375, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 375 });
    assert.equal(await evaluate(`(() => {
      document.querySelectorAll('[data-json-url]').forEach(panel => panel.open = true);
      return document.documentElement.scrollWidth > innerWidth;
    })()`), false, 'no overflow at ' + width);
  }
  const imported = await evaluate(`(async () => {
    document.getElementById('auto-merge').checked = false;
    const fetchOriginal = window.fetch;
    window.fetch = async () => new Response('[{"id":1,"source":"url"}]');
    document.getElementById('first-url').value = window.JMJsonUrl.EXAMPLE_URL;
    await document.querySelector('[data-json-url="first"] [data-url-load]').onclick();
    document.getElementById('mode-toggle').click();
    document.getElementById('advanced-url').value = window.JMJsonUrl.EXAMPLE_URL;
    await document.querySelector('[data-json-url="advanced"] [data-url-load]').onclick();
    const result = {
      text: document.getElementById('first').value,
      editor: window.JMEditors.get('first').view.state.doc.toString(),
      status: document.getElementById('first-url-status').textContent,
      files: window.JMFlow.snapshot().files.map(file => file.name)
    };
    window.fetch = fetchOriginal;
    return result;
  })()`);
  assert.equal(imported.text, '[{"id":1,"source":"url"}]');
  assert.equal(imported.editor, imported.text);
  assert.equal(imported.status, 'Loaded 5MB.json.');
  assert.deepEqual(imported.files, ['5MB.json']);
  console.log('PASS Chrome: three responsive widths, Quick import updates CodeMirror, Advanced import uses the existing file list. Requests mocked; live example checked separately.');
} finally {
  socket?.close();
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.kill(); server.kill();
  await Promise.race([exited, wait(3000)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
