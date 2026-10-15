/* Optional real Chrome check. Uses only Node built-ins and an installed browser. */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const profile=await mkdtemp(join(tmpdir(),'jm-chrome-'));
const server=spawn('python3',['-m','http.server','8765'],{stdio:'ignore'});
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-networking','--remote-debugging-port=9226','--user-data-dir='+profile,'http://localhost:8765'],{stdio:'ignore'});
let socket;
try {
  let target;
  for(let i=0;i<100;i++) {try {target=(await (await fetch('http://localhost:9226/json')).json()).find(p=>p.type==='page');if(target)break;}catch{} await new Promise(r=>setTimeout(r,100));}
  assert.ok(target,'Chrome unavailable');
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  let seq=0;const pending=new Map(),errors=[];
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  await send('Runtime.enable');
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;}
  for(let i=0;i<100;i++){if(await evaluate('!!(window.JMEditors && JMEditors.get("first"))'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evaluate('!!JMEditors.get("first")'),true);
  const basic=await evaluate(`(async()=>{
    document.getElementById('auto-merge').checked=false;
    JMEditors.get('first').set('[{"id":1,"name":"A"}]');JMEditors.get('second').set('[{"id":1,"name":"B"}]');
    await JMFlow.run(true);await new Promise(r=>setTimeout(r,100));
    return {result:JSON.parse(JMEditors.get('preview').text())[0].name,sync:document.getElementById('first').value===JMEditors.get('first').text(),hosts:document.querySelectorAll('.cm-host').length};
  })()`);
  assert.equal(basic.result,'B');assert.equal(basic.sync,true);assert.ok(basic.hosts>=3);
  const large=await evaluate(`(async()=>{
    const text=JSON.stringify(Array.from({length:100000},(_,id)=>({id,name:'customer',note:'abcdefghijklmnop'})));
    const editor=JMEditors.get('first');let started=performance.now();editor.set(text);const loadMs=performance.now()-started;
    started=performance.now();editor.view.dispatch({changes:{from:1,insert:' '}});const typingMs=performance.now()-started;
    started=performance.now();editor.view.scrollDOM.scrollTop=5000;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const scrollFrameMs=performance.now()-started;
    editor.find();await new Promise(r=>setTimeout(r,50));const input=editor.view.dom.querySelector('input[type=search]');input.value='customer';started=performance.now();input.dispatchEvent(new Event('input',{bubbles:true}));
    let count='';for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,50));count=editor.view.dom.querySelector('[aria-live]').textContent;if(count.includes('5,000'))break;}
    const searchMs=performance.now()-started;return {bytes:text.length,loadMs,typingMs,scrollFrameMs,searchMs,count};
  })()`);
  assert.ok(large.bytes>5*1024*1024);assert.equal(large.count,'5,000+ matches');
  await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
  await new Promise(r=>setTimeout(r,100));
  const mobile=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');
  assert.ok(mobile.scroll<=mobile.width,'Page overflow at 375px');
  // Search panels must not escape the editor's stacking context, even when
  // scrolled under the sticky header or behind the floating AI controls.
  for (const width of [375, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {width,height:900,deviceScaleFactor:1,mobile:width<768});
    const stacking = await evaluate(`(async()=>{
      const editor=JMEditors.get('first');editor.find();
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const panel=editor.view.dom.querySelector('.cm-search-panel');
      const header=document.querySelector('.site-header');
      window.scrollBy(0,panel.getBoundingClientRect().top-header.getBoundingClientRect().height/2);
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const p=panel.getBoundingClientRect(),h=header.getBoundingClientRect();
      const x=Math.max(p.left,h.left)+Math.min(p.width,h.width)/2;
      const y=Math.max(p.top,h.top)+1;
      const headerOverlaps=y<Math.min(p.bottom,h.bottom);
      const headerAbove=headerOverlaps && header.contains(document.elementFromPoint(x,y));
      const launcher=document.getElementById('ai-toggle');
      if(document.getElementById('ai-assistant').hidden)launcher.click();
      // Move the editor underneath the popup to exercise a real overlap.
      const host=editor.view.dom.closest('.cm-host');
      host.style.position='fixed';host.style.inset='100px 0 0';host.style.height='700px';
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const ai=document.getElementById('ai-assistant'),a=ai.getBoundingClientRect();
      const aiAbove=ai.contains(document.elementFromPoint(a.left+a.width/2,a.top+20));
      const l=launcher.getBoundingClientRect();
      const launcherAbove=launcher.contains(document.elementFromPoint(l.left+l.width/2,l.top+l.height/2));
      const isolation=getComputedStyle(host).isolation;
      host.removeAttribute('style');document.getElementById('ai-close').click();
      return {headerOverlaps,headerAbove,aiAbove,launcherAbove,isolation};
    })()`);
    assert.equal(stacking.isolation,'isolate');
    assert.equal(stacking.headerOverlaps,true,`Search overlaps header for test at ${width}px`);
    assert.equal(stacking.headerAbove,true,`Header above search at ${width}px`);
    assert.equal(stacking.aiAbove,true,`AI popup above editor at ${width}px`);
    assert.equal(stacking.launcherAbove,true,`AI launcher above editor at ${width}px`);
  }
  assert.deepEqual(errors,[]);
  const report={basic,large,mobile,headless:true,note:'Headless Chrome timings include unchanged format validation. Not a mobile keyboard/screen reader/Lighthouse test.'};
  await writeFile('editor-browser-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{if(socket)socket.close();chrome.kill();server.kill();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true});}
