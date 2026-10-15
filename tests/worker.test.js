'use strict';
const assert = require('assert');
const {performance} = require('perf_hooks');
const {Worker} = require('worker_threads');
const merger = require('../assets/tool.js');
const compare = require('../assets/compare.js');
const fs = require('fs');
const ui = fs.readFileSync(require('path').join(__dirname,'../assets/flow.js'),'utf8');
const rules=require('../assets/merge-format-rules.js'), helper=require('../assets/json-error-helper.js'), format=require('../assets/format-check.js');
const calculate = ui.slice(ui.indexOf('  function calculate('),ui.indexOf('  function snapshot()'));
const source = `const {performance}=require('perf_hooks'); const {parentPort}=require('worker_threads'); const merger=(${merger.createMerger})(); const compare=(${compare.createCompare})(merger); const rules=(${rules.createRules})(); const checkJson=${helper.checkJson.toString()}; const formatter=(${format.createFormat})(rules,checkJson); ${calculate} parentPort.on('message',job=>{try{parentPort.postMessage({result:calculate(job,merger,compare)})}catch(e){parentPort.postMessage({error:e.message})}});`;
async function processJob(job) {
 job.options=job.options || {method:job.files.every(f=>f.text.trim().startsWith('{'))?'deep':'join',key:'id',recordsPath:'',winner:'later',lists:'concat',keepNoKey:true};
 const worker=new Worker(source,{eval:true});
 try {return await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(job);});} finally {await worker.terminate();}
}
(async()=>{
 const files=[{name:'a',text:'[{"id":1,"name":"old"}]'},{name:'b',text:'[{"id":1,"name":"new"}]'}];
 const r=await processJob({quick:true,files,format:'pretty'});assert(!r.error,r.error);assert.equal(r.result.output.result[0].name,'new');assert.equal(r.result.output.conflicts.length,1);assert.equal(r.result.report.counts.different,1);
 const bad=await processJob({quick:true,files:[files[0],{name:'bad',text:'{bad}'}]});assert(/Invalid JSON/.test(bad.error));
 const big='x'.repeat(5*1024*1024);
 let ticks=0;const heartbeat=setInterval(()=>ticks++,5);
 const start=performance.now();const large=await processJob({quick:true,files:[{name:'a',text:JSON.stringify({payload:big})},{name:'b',text:'{"extra":1}'}],format:'compact'});clearInterval(heartbeat);
 assert(!large.error,large.error);assert.equal(large.result.output.result.payload.length,big.length);assert(ticks>0,'Main event loop did not advance');assert(large.result.elapsed>=0);
 console.log('PASS worker: automatic join, conflicts, comparison, invalid JSON, 5 MB object; main event-loop ticks='+ticks+'; wall ms='+Math.round(performance.now()-start));
})().catch(e=>{console.error(e);process.exitCode=1;});
