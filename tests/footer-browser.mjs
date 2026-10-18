// Run against the production build: npm run build && node tests/footer-browser.mjs
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url).pathname;
const profile = await mkdtemp(join(tmpdir(), 'joinjson-footer-'));
const server = spawn('python3', ['-m', 'http.server', '8787', '--directory', join(root, 'public')], { stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=9247', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://localhost:9247/json')).json()).find(page => page.type === 'page'); if (target) break; } catch {}
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
    const item = pending.get(message.id);
    pending.delete(message.id);
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
  for (const page of ['/', '/about/', '/curl-to-js.html', '/json-to-yaml/']) {
    await send('Page.navigate', { url: 'http://localhost:8787' + page });
    let ready = false;
    for (let i = 0; i < 150; i++) {
      ready = await evaluate(`location.pathname.split('/').filter(Boolean).join('/') === ${JSON.stringify(page.split('/').filter(Boolean).join('/'))} && document.readyState !== 'loading' && !!document.querySelector('[data-copyright-year]')?.textContent`);
      if (ready) break;
      await wait(100);
    }
    assert.ok(ready, 'page ready: ' + page);
    for (const theme of ['light', 'dark']) for (const width of [320, 375, 540, 768, 1024, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
      const state = await evaluate(`(() => {
        const footer = document.querySelector('footer');
        const rect = footer.getBoundingClientRect();
        const background = getComputedStyle(footer).backgroundColor;
        const rgb = value => value.match(/[0-9.]+/g).slice(0, 3).map(Number);
        const luminance = color => rgb(color).map(c => c/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4).reduce((sum,c,i) => sum+c*[.2126,.7152,.0722][i],0);
        const ratio = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
        const links = [...footer.querySelectorAll('a')];
        return {
          left: rect.left, right: rect.right, overflow: footer.scrollWidth > footer.clientWidth,
          columns: getComputedStyle(footer.querySelector('.footer-navigation')).gridTemplateColumns.split(' ').length,
          textContrast: Math.min(...[...footer.querySelectorAll('a,h2,p')].map(el => ratio(getComputedStyle(el).color, background))),
          linksInside: links.every(el => {const r=el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth;}),
          year: footer.querySelector('[data-copyright-year]').textContent
        };
      })()`);
      assert.ok(state.left >= 0 && state.right <= width + 1 && !state.overflow && state.linksInside, JSON.stringify({ page, theme, width, state }));
      assert.equal(state.columns, width <= 540 ? 1 : width <= 900 ? 2 : 4);
      assert.ok(state.textContrast >= 4.5, JSON.stringify({ page, theme, width, state }));
      assert.equal(state.year, String(new Date().getFullYear()));
      await evaluate(`document.querySelector('.footer-brand-name').focus()`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      const focus = await evaluate(`({href:document.activeElement.getAttribute('href'),outline:getComputedStyle(document.activeElement).outlineStyle,width:getComputedStyle(document.activeElement).outlineWidth})`);
      assert.equal(focus.href, '/json-to-yaml');
      assert.equal(focus.outline, 'solid');
      assert.equal(focus.width, '3px');
    }
    const links = await evaluate(`[...document.querySelectorAll('footer a')].map(a => a.getAttribute('href'))`);
    for (const href of links) {
      const response = await fetch('http://localhost:8787' + href);
      assert.equal(response.status, 200, href);
    }
  }
  console.log('PASS: footer links, current year, AA contrast, native keyboard focus, and responsive 1/2/4-column geometry on four pages in light/dark themes at six widths.');
} finally {
  socket?.close(); chrome.kill(); server.kill(); await wait(300); await rm(profile, { recursive: true, force: true });
}
