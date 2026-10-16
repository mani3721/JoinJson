import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const profile = await mkdtemp(join(tmpdir(), 'joinjson-header-'));
const server = spawn('python3', ['-m', 'http.server', '8776'], {stdio:'ignore'});
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=9236', '--user-data-dir=' + profile, 'http://localhost:8776'], {stdio:'ignore'});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch('http://localhost:9236/json')).json()).find(page => page.type === 'page'); if (target) break; } catch {}
    await wait(100);
  }
  assert.ok(target, 'Chrome started');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
  let sequence = 0; const pending = new Map();
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.id) { const item = pending.get(message.id); pending.delete(message.id); message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, {resolve,reject}); socket.send(JSON.stringify({id,method,params})); });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true}); assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value; };
  for (let i = 0; i < 100; i++) { if (await evaluate('!!document.querySelector(".join-header")')) break; await wait(100); }
  const report = [];
  for (const page of ['/', '/about/']) {
    await send('Page.navigate', {url:'http://localhost:8776' + page});
    for (let i = 0; i < 100; i++) { if (await evaluate('document.readyState === "complete" && !!document.querySelector(".join-header")')) break; await wait(100); }
    for (const theme of ['light','dark']) for (const width of [320,375,768,1024,1440]) {
      await send('Emulation.setDeviceMetricsOverride', {width,height:900,deviceScaleFactor:1,mobile:false});
      await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.getElementById('site-menu-close').click();`);
      await wait(60);
      const closed = await evaluate(`({height:document.querySelector('header').getBoundingClientRect().height,width:document.documentElement.scrollWidth,body:innerWidth})`);
      assert.equal(closed.height, width < 860 ? 56 : 64);
      const logo = await evaluate(`(async () => {
        const image = document.querySelector('.brand img');
        if (!image) return null;
        try { await image.decode(); } catch {}
        const rect = image.getBoundingClientRect();
        return {loaded:image.complete && image.naturalWidth > 0,width:rect.width,height:rect.height,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,display:getComputedStyle(image).display,visibility:getComputedStyle(image).visibility};
      })()`);
      assert.ok(logo?.loaded, 'brand logo loads');
      assert.ok(logo.width >= 28 && logo.height >= 28, 'brand logo has visible dimensions');
      assert.ok(logo.left >= 0 && logo.right <= width && logo.top >= 0 && logo.bottom <= closed.height, 'brand logo stays inside header');
      assert.notEqual(logo.display, 'none');
      assert.notEqual(logo.visibility, 'hidden');
      // Existing content outside the header is measured separately, not redesigned.
      if (width < 860) await evaluate(`document.getElementById('site-menu-toggle').click()`);
      await evaluate(`document.getElementById('tools-trigger').click()`);
      const state = await evaluate(`(() => {
        const panel = document.getElementById('tool-panel'), rect = panel.getBoundingClientRect();
        const rgb = value => value.match(/[0-9.]+/g).slice(0,3).map(Number);
        const luminance = color => rgb(color).map(c => c/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4).reduce((sum,c,i) => sum+c*[.2126,.7152,.0722][i],0);
        const ratio = (foreground, background) => {const a=luminance(foreground),b=luminance(background);return +( (Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2);};
        const background = getComputedStyle(document.querySelector('header')).backgroundColor;
        const title = getComputedStyle(document.querySelector('.nav-title')).color;
        const muted = getComputedStyle(document.querySelector('.nav-description')).color;
        const focus = getComputedStyle(document.querySelector('header')).getPropertyValue('--focus').trim();
        const swatch=document.createElement('span');swatch.style.color=focus;document.body.append(swatch);const focusColor=getComputedStyle(swatch).color;swatch.remove();
        return {left:rect.left,right:rect.right,panelScroll:panel.scrollWidth,panelWidth:panel.clientWidth,titleRatio:ratio(title,background),mutedRatio:ratio(muted,background),focusRatio:ratio(focusColor,background),titlesFit:[...document.querySelectorAll('.nav-title')].every(el => el.scrollWidth <= el.clientWidth),sheet:document.querySelector('.nav-shell').getAttribute('aria-modal')};
      })()`);
      assert.ok(state.left >= 0 && state.right <= width + 1, JSON.stringify({page,theme,width,state}));
      assert.ok(state.panelScroll <= state.panelWidth, 'panel has no horizontal scroll');
      assert.ok(state.titlesFit, 'titles fit');
      assert.ok(state.titleRatio >= 4.5 && state.mutedRatio >= 4.5 && state.focusRatio >= 3, JSON.stringify(state));
      if (width < 860) assert.equal(state.sheet,'true');
      report.push({page,theme,width,closed,...state});
      await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.getElementById('site-menu-close').click()`);
    }
    // Keyboard activation uses native button Enter and Space behavior in a real browser.
    await send('Emulation.setDeviceMetricsOverride', {width:1024,height:900,deviceScaleFactor:1,mobile:false});
    await evaluate(`document.getElementById('tools-trigger').focus()`);
    await wait(30);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    assert.equal(await evaluate(`document.getElementById('tools-trigger').getAttribute('aria-expanded')`),'true');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    assert.equal(await evaluate(`document.activeElement.id`),'tools-trigger');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
    assert.equal(await evaluate(`document.getElementById('tools-trigger').getAttribute('aria-expanded')`),'true');
    await evaluate(`document.querySelector('.brand').focus()`); await wait(20);
    assert.equal(await evaluate(`document.getElementById('tool-panel').hidden`),true);
  }
  await writeFile('header-browser-report.json', JSON.stringify({report, nativeKeyboard:true, note:'Headless Chrome geometry/contrast checks; not human visual review or screen reader certification.'},null,2) + '\n');
  console.log('PASS header geometry, title fit, AA text/focus contrast, mobile sheet, native Enter/Space/Escape and focus-out on home and article pages.');
} finally {
  socket?.close(); chrome.kill(); server.kill(); await wait(300); await rm(profile,{recursive:true,force:true});
}
