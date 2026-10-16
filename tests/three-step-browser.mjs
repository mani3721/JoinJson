// Headless Chrome: real layout, focus, keyboard and rendered visibility checks.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const profile = await mkdtemp(join(tmpdir(), 'joinjson-flow-'));
const server = spawn('python3', ['-m', 'http.server', '8791', '--directory', process.env.SITE_DIR || '.'], { stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=9251', '--user-data-dir=' + profile, 'http://localhost:8791'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://localhost:9251/json')).json()).find(page => page.type === 'page'); } catch {}
    if (target) break; await wait(100);
  }
  assert.ok(target); socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let seq = 0; const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data); if (!message.id) return;
    const task = pending.get(message.id); pending.delete(message.id);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
  };
  for (let i = 0; i < 100; i++) { if (await evaluate('!!document.getElementById("first")')) break; await wait(100); }
  for (const width of [320, 375, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 700 });
    for (const mode of ['paste', 'upload', 'url']) {
      const layout = await evaluate(`(() => {
        ['first','second'].forEach(id => document.getElementById(id+'-tab-${mode}').click());
        return { overflow:document.documentElement.scrollWidth > innerWidth,
          panels:[...document.querySelectorAll('#inputs .input-card')].map(c=>[...c.querySelectorAll('.method-panel')].filter(p=>getComputedStyle(p).display!=='none').length),
          buttons:[...document.querySelectorAll('button')].filter(b=>b.getClientRects().length).every(b=>b.getBoundingClientRect().height>=44) };
      })()`);
      assert.equal(layout.overflow, false, width + ' ' + mode + ' horizontal overflow');
      assert.deepEqual(layout.panels, [1, 1]); assert.equal(layout.buttons, true, '44px buttons');
    }
  }
  const merged = await evaluate(`(() => {
    document.getElementById('example').click();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));
    return { visible:getComputedStyle(document.getElementById('result-output')).display!=='none',
      focus:document.activeElement.id, added:document.querySelectorAll('.result-lines .added').length,
      overridden:document.querySelectorAll('.result-lines .overridden').length,
      value:JSON.parse([...document.querySelectorAll('#result-lines code')].map(c=>c.textContent).join('\\n')) };
  })()`);
  assert.equal(merged.visible, true); assert.equal(merged.focus, 'result-heading');
  assert.equal(merged.value.role, 'Developer'); assert.ok(merged.added > 0 && merged.overridden > 0);
  for (const width of [320, 375, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 700 });
    const ads = await evaluate(`(() => {
      const slots = [...document.querySelectorAll('.ad-slot')];
      const controls = [...document.querySelectorAll('button,summary,input,textarea,select')].filter(n => n.getClientRects().length);
      return { overflow:document.documentElement.scrollWidth > innerWidth,
        visible:slots.every(s => getComputedStyle(s).display !== 'none'),
        height:slots.every(s => s.getBoundingClientRect().height >= 280),
        stationary:slots.every(s => !['fixed','sticky'].includes(getComputedStyle(s).position)),
        spacing:slots.every(s => controls.every(c => {
          const a=s.getBoundingClientRect(), b=c.getBoundingClientRect();
          const vertical=Math.max(b.top-a.bottom,a.top-b.bottom,0);
          const horizontal=Math.max(b.left-a.right,a.left-b.right,0);
          return Math.hypot(vertical,horizontal)>=120;
        })) };
    })()`);
    assert.equal(ads.overflow, false, 'editorial overflow at ' + width);
    for (const key of ['visible','height','stationary','spacing']) assert.equal(ads[key], true, key + ' at ' + width);
  }
  // Execute the actual browser Worker, including the minified production variant.
  await evaluate(`(async () => {
    const first=document.getElementById('first'), second=document.getElementById('second');
    first.value=JSON.stringify({items:Array.from({length:18000},(_,id)=>({id,name:'Item '+id}))});
    second.value='{"worker":true}';
    first.dispatchEvent(new Event('input')); second.dispatchEvent(new Event('input'));
    await new Promise(resolve=>setTimeout(resolve,300));
    document.getElementById('merge').click();
  })()`);
  let workerReady=false;
  for(let i=0;i<100;i++) {
    workerReady=await evaluate(`!document.getElementById('copy').disabled`);
    if(workerReady)break; await wait(50);
  }
  assert.equal(workerReady,true,'real browser worker completed');
  assert.equal(await evaluate(`!document.getElementById('preview-notice').hidden`),true);
  const cleared = await evaluate(`(() => { document.getElementById('clear').click(); return [...document.querySelectorAll('.ad-slot')].every(s=>getComputedStyle(s).display==='none'); })()`);
  assert.equal(cleared, true);
  console.log('PASS Chrome: four widths, input methods, merge behavior, ad visibility, 280px reservations and 120px control clearance.');
} finally {
  socket?.close(); const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.kill(); server.kill(); await Promise.race([exited, wait(3000)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
