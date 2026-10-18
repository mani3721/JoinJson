import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { toolGroups } from '../scripts/header.mjs';
const root = new URL('../', import.meta.url).pathname;
const profile = await mkdtemp(join(tmpdir(), 'joinjson-navigation-'));
// Test a plain static server: no hosting rewrites or SPA fallback to hide errors.
const server = spawn('python3', ['-m', 'http.server', '8798', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=9258', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://localhost:9258/json')).json()).find(page => page.type === 'page'); if (target) break; } catch {}
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
    assert.fail('Timed out: ' + expression + ' ' + JSON.stringify(await evaluate(`({path:location.pathname,ready:document.readyState,current:document.querySelector('#tool-menu [aria-current]')?.dataset.tool,expanded:document.getElementById('tools-trigger')?.getAttribute('aria-expanded'),sheet:document.getElementById('site-menu-toggle')?.getAttribute('aria-expanded'),title:document.title})`)));
  };
  const click = async selector => {
    const point = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({block:'nearest'}); const r = el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  };
  const workspaces = { merge: 'first', 'json-diff': 'json-diff-tool', 'json-to-zod': 'zod-tool', 'json-to-typescript': 'typescript-tool', 'json-to-python': 'python-converter-tool', 'json-to-yaml': 'yaml-converter-tool', 'json-to-go': 'go-tool', 'json-to-pydantic': 'pydantic-tool', 'json-to-toml': 'toml-tool', 'jsonc-formatter': 'jsonc-tool' };
  for (const width of [375, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://localhost:8798/' });
    await until(`document.readyState === 'complete' && !!document.querySelector('#tool-menu [aria-current="page"]')`);
    // Alternate standalone and embedded tools to exercise full-document transitions.
    const tools = toolGroups.flatMap(([, items]) => items);
    const order = ['json-to-go', 'json-to-typescript', 'json-to-pydantic', 'json-to-yaml', 'json-to-toml', 'json-to-zod', 'jsonc-formatter', 'json-to-python', 'json-diff', 'merge'];
    for (const tool of order) {
      if (width < 860) await click('#site-menu-toggle');
      // On desktop allow hover intent to open first, then click the trigger.
      if (width >= 860) {
        const point = await evaluate(`(() => {const r=document.getElementById('tools-trigger').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
        await wait(160);
      }
      await click('#tools-trigger');
      assert.equal(await evaluate(`document.getElementById('tool-panel').hidden`), false, 'Tools remains open after hover then click');
      await click(`#tool-menu [data-tool="${tool}"]`);
      const path = tools.find(([, id]) => id === tool)[0];
      await until(`location.pathname.replace(/\\/$/,'') === ${JSON.stringify(path === '/' ? '' : path)} && document.querySelector('#tool-menu [aria-current="page"]')?.dataset.tool === ${JSON.stringify(tool)}`);
      const workspace = workspaces[tool];
      // Standalone formatter's editor ID avoids depending on section naming.
      const selector = tool === 'jsonc-formatter' ? '#jsonc-input' : '#' + workspace;
      await until(`!!document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().height`);
      assert.equal(await evaluate(`document.querySelector('main').inert`), false);
      assert.equal(await evaluate(`document.body.style.overflow === 'hidden'`), false);
      assert.equal(await evaluate(`document.getElementById('tool-panel').hidden`), true);
    }
    // Browser history must restore the visible tool as well as the URL.
    await evaluate('history.back()');
    await until(`document.body.dataset.tool === 'json-diff' && !document.getElementById('json-diff-tool').hidden`);
    await evaluate('history.forward()');
    await until(`document.body.dataset.tool === 'merge' && location.pathname === '/'`);
  }
  console.log('PASS: real pointer navigation across every header tool at mobile, tablet and desktop widths, hover/click, static clean URLs, visible workspaces, mobile unlock, and Back/Forward.');
} finally {
  socket?.close(); chrome.kill(); server.kill(); await wait(300); await rm(profile, { recursive: true, force: true });
}
