// Reproducible local diagnostics, not a replacement for deployed Lighthouse/field data.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const profile = await mkdtemp(join(tmpdir(), 'joinjson-perf-'));
const server = spawn('python3', ['-m', 'http.server', '8793', '--directory', process.env.SITE_DIR || '.'], { stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=9253', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://localhost:9253/json')).json()).find(p => p.type === 'page'); } catch {}
    if (target) break;
    await wait(100);
  }
  assert.ok(target, 'Chrome started');
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
    const id = ++seq; pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.perfResults = { lcp: 0, lcpElement: '', cls: 0, shifts: [], longTasks: [] };
    new PerformanceObserver(list => { for (const e of list.getEntries()) {
      perfResults.lcp = e.startTime; perfResults.lcpElement = e.element?.id || e.element?.tagName;
    }}).observe({type:'largest-contentful-paint', buffered:true});
    new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) {
      perfResults.cls += e.value;
      perfResults.shifts.push({value:e.value, elements:e.sources.map(s=>s.node?.id || s.node?.className || s.node?.tagName)});
    }}).observe({type:'layout-shift', buffered:true});
    new PerformanceObserver(list => { for (const e of list.getEntries()) perfResults.longTasks.push(e.duration); }).observe({type:'longtask', buffered:true});
  ` });
  if (process.env.THROTTLE_NETWORK) await send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750
  });
  const samples = [];
  for (let run = 0; run < 3; run++) {
    await send('Page.navigate', { url: 'http://localhost:8793/' });
    await wait(process.env.THROTTLE_NETWORK ? 7000 : 2400);
    samples.push(await evaluate(`(() => {
      const nav=performance.getEntriesByType('navigation')[0];
      const nodes=[...document.querySelectorAll('body *')];
      return {...perfResults, fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
        ttfb:nav.responseStart, documentDownload:nav.responseEnd-nav.responseStart,
        lcpAfterResponse:Math.max(0,perfResults.lcp-nav.responseEnd),
        elements:document.querySelectorAll('*').length,
        maxDepth:Math.max(...nodes.map(n=>{let depth=0;while(n.parentElement){depth++;n=n.parentElement;}return depth;})),
        blocking:perfResults.longTasks.reduce((n,d)=>n+Math.max(0,d-50),0),
        requests:performance.getEntriesByType('resource').map(e=>new URL(e.name).pathname)};
    })()`));
  }
  // Verify skipped sections become visible on scroll and browser Find can reach the guide.
  const visible = await evaluate(`(async () => {
    document.getElementById('guide-heading').scrollIntoView();
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const heading=document.getElementById('guide-heading').getBoundingClientRect();
    return {guide:heading.height>0 && heading.top<innerHeight, overflow:document.documentElement.scrollWidth>innerWidth};
  })()`);
  assert.equal(visible.guide, true); assert.equal(visible.overflow, false);
  if (!process.env.PERF_BASELINE) for (const sample of samples) assert.ok(sample.cls < 0.1, 'startup CLS must stay below 0.1: ' + JSON.stringify(sample.shifts));
  const report = { environment: 'Local Chrome, cold cache, 390x844, 4x CPU slowdown; ' + (process.env.THROTTLE_NETWORK ? '150ms latency, 1.6Mbps download' : 'no network throttling'), samples };
  if (process.env.PERF_REPORT) await writeFile(process.env.PERF_REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket?.close();
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.kill(); server.kill();
  await Promise.race([exited, wait(3000)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
