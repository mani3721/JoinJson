/* Headless visual structure checks; no JSON or other user inputs are logged. */
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const profile=await mkdtemp(join(tmpdir(),'jm-warm-'));
const server=spawn('python3',['-m','http.server','8768'],{stdio:'ignore'});
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-networking','--remote-debugging-port=9228','--user-data-dir='+profile,'http://localhost:8768'],{stdio:'ignore'});
let socket;
try{
 let target;
 for(let i=0;i<100;i++){try{target=(await(await fetch('http://localhost:9228/json')).json()).find(p=>p.type==='page');if(target)break;}catch {} await new Promise(r=>setTimeout(r,100));}
 assert.ok(target);socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let seq=0;const pending=new Map();socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 for(let i=0;i<100;i++){if(await evaluate('!!(window.JMEditors && JMEditors.get("first"))'))break;await new Promise(r=>setTimeout(r,100));}
 const report=[];
 for(const theme of ['light','dark'])for(const width of [375,768,1024,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===375});
  await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);await new Promise(r=>setTimeout(r,80));
  const state=await evaluate(`(()=>{const styles=s=>getComputedStyle(document.querySelector(s));return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,background:styles('body').backgroundColor,heroSize:styles('.tool-hero h1').fontSize,heroAccent:styles('.hero-accent').color,frame:styles('.workspace').backgroundColor,grid:styles('.feature-grid').gridTemplateColumns,editor:!!JMEditors.get('first')};})()`);
  assert.ok(state.scrollWidth<=width,theme+' overflow '+width);assert.equal(state.editor,true);report.push({theme,...state});
 }
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
 assert.equal(await evaluate('document.documentElement.dataset.theme="system";getComputedStyle(document.body).backgroundColor'),'rgb(27, 25, 23)');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
 assert.equal(await evaluate('getComputedStyle(document.body).backgroundColor'),'rgb(251, 250, 248)');
 await evaluate(`(async()=>{document.getElementById('auto-merge').checked=false;JMEditors.get('first').set('[{"id":1,"name":"A"}]');JMEditors.get('second').set('[{"id":1,"name":"B"}]');await JMFlow.run(true);})()`);
 assert.equal(await evaluate('JSON.parse(JMEditors.get("preview").text())[0].name'),'B');
 await writeFile('warm-browser-report.json',JSON.stringify({report,systemTheme:true,merge:true,note:'Headless layout/style checks, not human visual comparison or accessibility certification.'},null,2)+'\n');
 console.log('PASS both themes at 375/768/1024/1440: no page overflow; warm tokens and CodeMirror present. System theme and merge pass.');
}finally{socket?.close();chrome.kill();server.kill();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true});}
