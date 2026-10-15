'use strict';
const assert=require('assert');
const api=require('../assets/examples-share.js'), formatter=require('../assets/format-check.js'), merger=require('../assets/tool.js'), compare=require('../assets/compare.js');
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
const base='https://example.test/';
const expected={
 'join-customers':[{id:1,name:'Ada Lovelace',plan:'paid',email:'ada@example.test'}],
 'merge-settings':{service:{host:'localhost',timeout:30},tags:['base','override']},
 'combine-lists':[1,2,2,3],
 'conflict-winners':[{id:1,name:'Later'}],
 'nested-key':[{user:{id:1},name:'Ada',active:true}],
 'api-data':[{id:1,name:'Ada',active:true}]
};
api.examples.forEach(e=>test('example '+e.id,()=>{
 const s=api.example(e.id);
 if(e.conflicts===null){assert.equal(formatter.inspect(s.files,s.options).errors,1);const fixed=formatter.fix(s,'wrapObjects',0);assert.equal(formatter.calculate({...fixed,format:'pretty'},merger,compare).output.conflicts.length,1);return;}
 const output=formatter.calculate(s,merger,compare).output;
 assert.equal(output.conflicts.length,e.conflicts);assert.deepStrictEqual(output.result,expected[e.id]);
}));
test('earlier-wins conflict example',()=>{const s=api.example('conflict-winners');s.options.winner='earlier';assert.equal(formatter.calculate(s,merger,compare).output.result[0].name,'Earlier');});
test('fixtures are independent snapshots',()=>{const a=api.example('join-customers');a.options.key='bad';a.files[0].text='bad';assert.equal(api.example('join-customers').options.key,'id');assert.equal(api.example('unknown'),null);});
test('all six valid settings round trip',()=>{const s={method:'join',key:'user.id',recordsPath:'data.items',winner:'earlier',lists:'unique',format:'compact'};assert.deepStrictEqual(api.parseSettings(api.settingsURL(base,s)),s);});
test('malformed and unknown settings ignored',()=>{assert.deepStrictEqual(api.parseSettings('bad'),{});assert.deepStrictEqual(api.parseSettings(base+'?method=eval&key=%3Cscript%3E&recordsPath=..&winner=no&lists=x&format=x&unknown=secret'),{});assert.deepStrictEqual(api.parseSettings(base+'?method=deep&unknown=x'),{method:'deep'});});
test('tool URL strips query and fragment',()=>assert.equal(api.plainURL(base+'?key=secret#data=private'),base));
test('settings exclude every non-allowlisted field',()=>{const link=api.settingsURL(base,{method:'join',data:'secret',files:['private'],caseInsensitive:true,keepNoKey:true});assert.equal(link,base+'?method=join');});
test('native sharing detection',()=>{assert(!api.canShare({},{}));assert(!api.canShare({share(){},canShare(){throw Error();}},{}));assert(!api.canShare({share(){},canShare:()=>false},{}));assert(!api.canShare({share(){}},{}));assert(api.canShare({share(){},canShare:()=>true},{}));});
(async()=>{
 for(const compress of [false,true]){
  const s=api.example('join-customers');const link=await api.dataURL(base,s,compress);const restored=await api.parseData(link);
  assert.deepStrictEqual(restored.files.map(f=>f.text),s.files.map(f=>f.text));assert.equal(restored.options.method,s.options.method);assert(!link.includes('crm.json'));count++;console.log('PASS data round trip '+(compress?'compressed':'raw'));
 }
 for(const inputs of [[],[{text:''},{text:''}]]){const state={files:inputs,options:{method:'combine'},format:'pretty'};const restored=await api.parseData(await api.dataURL(base,state,false));assert.deepStrictEqual(restored.files.map(f=>f.text),inputs.map(f=>f.text));count++;console.log('PASS empty data round trip');}
 const s={files:[{text:'x'.repeat(9000)}],options:{method:'combine'}};
 await assert.rejects(api.dataURL(base,s,false),/8,000/);count++;console.log('PASS oversized raw link refused');
 await assert.rejects(api.parseData(base+'#data=raw.invalid!'),/Invalid/);count++;console.log('PASS malformed data rejected');
 assert.equal(await api.parseData(base),null);count++;
 // Compression bombs are bounded before JSON parse.
 const bomb=JSON.stringify({version:1,inputs:['x'.repeat(1200000)],settings:{}});
 const bytes=await new Response(new Blob([bomb]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
 await assert.rejects(api.parseData(base+'#data=gzip.'+Buffer.from(bytes).toString('base64url')),/too large/);count++;
 console.log(count+' examples/share tests passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
