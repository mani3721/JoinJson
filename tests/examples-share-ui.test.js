'use strict';
/* Simulated DOM integration; not a browser or permission test. */
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const api=require('../assets/examples-share.js');
const nodes=new Map(),events={};
function node(id){if(nodes.has(id))return nodes.get(id);const n={id,value:'',checked:false,hidden:false,disabled:false,textContent:'',listeners:{},children:[],append(x){this.children.push(x);},focus(){focused=id;},addEventListener(t,fn){this.listeners[t]=fn;}};nodes.set(id,n);return n;}
let focused='',state={mode:'quick',files:[{text:'private first'},{text:'private second'}],options:{method:'join',key:'id',recordsPath:'',winner:'later',lists:'concat'},format:'pretty'},copied='',toast='',runs=0,hasData=true;
const window={JMSharing:api,JMFlow:{snapshot:()=>JSON.parse(JSON.stringify(state)),applySnapshot:s=>{state=s;},run:()=>runs++,hasData:()=>hasData,toast:message=>{toast=message;}},addEventListener:(t,fn)=>{events[t]=fn;}};
const document={getElementById:node,createElement:()=>node('generated-'+Math.random()),addEventListener:(t,fn)=>{events[t]=fn;}};
['share-data','share-native','example-confirm','example-undo'].forEach(id=>{node(id).hidden=true;});
const location={href:'https://example.test/?unknown=private#other',hash:'#data=test',pathname:'/',search:'?unknown=private'};
const sharing=Object.assign({},api,{parseData:async()=>api.example('join-customers')});
window.JMSharing=sharing;
const navigator={clipboard:{writeText:async text=>{copied=text;}},canShare:()=>false,share:async()=>{throw Object.assign(Error(),{name:'AbortError'});}};
let timers=new Map(),id=0;
const context={window,document,location,navigator,history:{replaceState(){}},File,JSON,setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:i=>timers.delete(i)};
vm.runInNewContext(fs.readFileSync(require('path').join(__dirname,'../assets/examples-share-ui.js'),'utf8'),context);
(async()=>{
 await events.DOMContentLoaded();
 assert(!node('example-confirm').hidden);assert.equal(state.files[0].text,'private first');assert.equal(focused,'example-confirm-yes');
 node('example-confirm-no').onclick();assert.equal(state.files[0].text,'private first');
 await events.DOMContentLoaded();node('example-confirm-yes').onclick();assert(state.files[0].text.includes('Ada'));assert.equal(runs,1);assert(!node('example-undo').hidden);
 node('example-undo').onclick();assert.equal(state.files[0].text,'private first');assert.equal(runs,2);
 assert(!nodes.has('example-select'));assert(!nodes.has('try-example'));assert(!nodes.has('example-load'));
 await node('share-tool').onclick();assert.equal(copied,'https://example.test/');
 await node('share-settings').onclick();assert(!copied.includes('private'));assert(!copied.includes('#'));assert(copied.includes('method=join'));
 assert(node('share-data').hidden);node('share-data-enabled').checked=true;node('share-data-enabled').onchange();assert(!node('share-data').hidden);
 await node('share-data').onclick();assert(copied.includes('#data='));assert(node('share-message').textContent.includes('Anyone'));
 events['jm:result-ready']({detail:{text:'[]'}});assert(node('share-native').hidden);
 navigator.canShare=()=>true;events['jm:result-ready']({detail:{text:'[]'}});assert(!node('share-native').hidden);
 await node('share-native').onclick();assert.equal(toast,'Copied'); // AbortError adds no error.
 events['jm:inputs-changed']();assert(node('share-native').hidden);
 await events.DOMContentLoaded();node('example-confirm-yes').onclick();assert(!node('example-undo').hidden);
 [...timers.values()].forEach(fn=>fn());assert(node('example-undo').hidden);
 node('clear-data').listeners.click();assert(node('share-native').hidden);assert(!node('share-data-enabled').checked);assert(node('share-data').hidden);
 console.log('PASS examples/share UI: confirmation, cancel, full Undo snapshot, merge request, removed example controls, settings/tool links, opt-in data export, native detection, AbortError, stale share invalidation, timer expiry callback, clear cleanup. UNVERIFIED: browser permissions, rendering and actual ten-second timing.');
})().catch(e=>{console.error(e);process.exitCode=1;});
