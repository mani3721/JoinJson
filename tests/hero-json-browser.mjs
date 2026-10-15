/* Homepage decoration checks in real Chrome; no external API requests. */
import {spawn} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const profile = await mkdtemp(join(tmpdir(), 'joinjson-hero-'));
const server = spawn('python3', ['-m', 'http.server', '8779'], {stdio:'ignore'});
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--no-first-run', '--disable-background-networking',
    '--remote-debugging-port=9239', '--user-data-dir=' + profile, 'http://localhost:8779'
], {stdio:'ignore'});
let socket;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
    let target;
    for (let i=0; i<100; i++) {
        try { target = (await (await fetch('http://localhost:9239/json')).json()).find(p => p.type === 'page'); } catch {}
        if (target) break;
        await wait(100);
    }
    assert.ok(target, 'Chrome debugging target');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
    let seq=0;
    const pending=new Map();
    socket.addEventListener('message', event => {
        const message=JSON.parse(event.data);
        if (!message.id) return;
        const task=pending.get(message.id);
        pending.delete(message.id);
        message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
    });
    const send=(method, params={}) => new Promise((resolve,reject) => {
        const id=++seq; pending.set(id,{resolve,reject}); socket.send(JSON.stringify({id,method,params}));
    });
    const evaluate=async expression => {
        const result=await send('Runtime.evaluate',{expression,returnByValue:true});
        assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    for (let i=0; i<100; i++) {
        if (await evaluate('!!document.querySelector(".hero-json-art") && !!window.JMEditors')) break;
        await wait(100);
    }
    for (const theme of ['light','dark']) for (const width of [375,768,1024,1440]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===375});
        await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
        const state=await evaluate(`(()=>{
            const art=document.querySelector('.hero-json-art');
            const card=art.querySelector('pre');
            const heading=document.querySelector('.tool-hero h1');
            const rect=heading.getBoundingClientRect();
            return {overflow:document.documentElement.scrollWidth>innerWidth,
                hidden:art.getAttribute('aria-hidden'),inert:art.inert,
                pointer:getComputedStyle(art).pointerEvents,
                card:getComputedStyle(card).display,
                duration:getComputedStyle(card).animationDuration,
                topmost:heading.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2))};
        })()`);
        assert.equal(state.overflow,false,`${theme} ${width}: no horizontal overflow`);
        assert.equal(state.hidden,'true'); assert.equal(state.inert,true);
        assert.equal(state.pointer,'none'); assert.equal(state.topmost,true);
        assert.equal(state.duration,'4.8s');
        assert.equal(state.card === 'none',width<768);
    }
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".hero-json-card")).animationName'),'none');
    await send('Emulation.setEmulatedMedia',{media:'print'});
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".hero-json-art")).display'),'none');
    await send('Emulation.setEmulatedMedia',{media:'screen',features:[{name:'forced-colors',value:'active'}]});
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".hero-json-art")).display'),'none');
    console.log('PASS hero: light/dark at four widths, no overflow, content above decoration, mobile simplification, reduced motion, print and forced colors.');
} finally {
    socket?.close();
    const chromeExited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill(); server.kill();
    await Promise.race([chromeExited, wait(3000)]);
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
