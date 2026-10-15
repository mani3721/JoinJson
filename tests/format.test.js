'use strict';
const assert = require('assert');
const rules = require('../assets/merge-format-rules.js');
const format = require('../assets/format-check.js');
const helper = require('../assets/json-error-helper.js');
const merger = require('../assets/tool.js');
const compare = require('../assets/compare.js');
let total = 0;
function test(name, fn) { fn(); total++; console.log('PASS ' + name); }
const options = { method:'join', key:'id', recordsPath:'', winner:'later', lists:'concat', keepNoKey:true };
const inspect = (data, method='join', extra={}) => format.inspect([{name:'a',data}],Object.assign({},options,{method},extra));
const cases = [
 ['records',[{id:1}],['ok','ok','error']],
 ['empty list',[],['warn','info','error']],
 ['object',{id:1},['error','warn','ok']],
 ['empty object',{},['error','warn','ok']],
 ['wrapped records',{data:[{id:1}]},['error','warn','ok']],
 ['plain values',[1,null,'a'],['error','ok','error']],
 ['lists',[[1],[2]],['error','ok','error']],
 ['mixed',[{id:1},1],['warn','ok','error']],
 ['number',1,['error','warn','error']],
 ['string','a',['error','warn','error']],
 ['null',null,['error','warn','error']],
 ['boolean',true,['error','warn','error']]
];
cases.forEach(([name,data,status])=>['join','combine','deep'].forEach((method,i)=>test(name+' / '+method,()=>assert.equal(inspect(data,method).items[0].severity,status[i]))));
test('every rule branch returns the original message and fix',()=>cases.forEach(([,data])=>['join','combine','deep'].forEach(method=>{const a=inspect(data,method).items[0],b=rules.checkCompatibility([{name:'a',data}],method==='combine'?'append':method,{keyPath:'id'}).items[0];assert.equal(a.message,b.message);assert.deepStrictEqual(a.fix,b.fix);})));
test('missing some IDs warns',()=>assert.equal(inspect([{id:1}, {}]).overall,'warn'));
test('missing all IDs suggests real keys',()=>{const r=inspect([{sku:'a'},{sku:'b'}]);assert.equal(r.overall,'error');assert.deepStrictEqual(r.items[0].fix.keys,['sku']);});
test('duplicate IDs warn',()=>assert.equal(inspect([{id:1},{id:1}]).overall,'warn'));
test('nested key ready',()=>assert.equal(inspect([{user:{id:1}}],'join',{key:'user.id'}).overall,'info'));
test('null and empty IDs count as missing; zero and false are keys',()=>{assert.equal(inspect([{id:null},{id:''}]).overall,'error');assert.equal(inspect([{id:0},{id:false}]).items[0].severity,'ok');});
test('own-property lookup and special keys',()=>{assert.equal(inspect([{}],'join',{key:'constructor'}).overall,'error');assert.equal(inspect([JSON.parse('{"__proto__":"x"}')],'join',{key:'__proto__'}).items[0].severity,'ok');});
test('records path ready and missing path fix',()=>{assert.equal(inspect({data:[{id:1}]},'join',{recordsPath:'data'}).items[0].severity,'ok');assert.equal(inspect({items:[{id:1}]},'join',{recordsPath:'data'}).items[0].fix.action,'clearRecordsPath');});
test('records path wrong inner shape',()=>assert.equal(inspect({data:[1]},'join',{recordsPath:'data'}).items[0].severity,'error'));
test('pretty concatenated values have exact second start',()=>{const text='{\n"id":1\n}\n[\n{"id":2}\n]';const r=format.inspect([{name:'a',text}],options);assert.equal(r.items[0].fix.action,'split');assert.equal(r.items[0].offset,text.indexOf('['));});
test('JSON Lines and CRLF detected',()=>{for(const text of ['{"id":1}\n{"id":2}','{"id":1}\r\n\r\n{"id":2}'])assert.equal(format.inspect([{name:'a',text}],options).items[0].fix.action,'convertLines');});
test('braces inside strings do not split',()=>assert.equal(rules.splitTopLevelValues('{"text":"} ["}').kind,'single'));
test('stray text and syntax fail',()=>{assert.equal(format.inspect([{name:'a',text:'{"id":1} junk'}],options).overall,'error');const r=helper.checkJson('{\n"a":1,\n}');assert(!r.ok);assert.equal(r.line,3);assert.equal(r.column,1);assert.equal(r.offset,9);});
test('syntax failure and valid input retain correct input indices',()=>{const r=format.inspect([{name:'bad',text:'{'},{name:'valid',data:[{id:1}]}],options);assert.equal(r.items[0].severity,'error');assert.equal(r.items[1].name,'valid');assert.equal(r.items[1].severity,'ok');});
function fixed(name, files, action, index, value, opts=options) {
 test(name,()=>{const state={mode:'advanced',files,options:Object.assign({},opts)};const before=JSON.stringify(state);const next=format.fix(state,action,index,value);assert.equal(JSON.stringify(state),before,'Undo snapshot mutated');assert.equal(format.inspect(next.files,next.options).errors,0);const r=format.calculate(Object.assign({},next,{format:'pretty'}),merger,compare);assert(r.output);});
}
fixed('wrap object fix',[{name:'a',data:{id:1}}],'wrapInList',0);
fixed('wrap all and join fix',[{name:'a',data:{id:1}},{name:'b',data:[{id:1,a:2}]}],'wrapObjects',0);
fixed('use records path fix',[{name:'a',data:{data:[{id:1}]}}],'useRecordsPath',0,'data');
fixed('clear records path fix',[{name:'a',data:[{id:1}]}],'clearRecordsPath',0,null,Object.assign({},options,{recordsPath:'data'}));
fixed('switch Combine fix',[{name:'a',data:[1]}],'switchMethod',0,'append');
fixed('switch objects fix',[{name:'a',data:{id:1}}],'switchMethod',0,'deep');
fixed('switch Join fix',[{name:'a',data:[{id:1}]}],'switchMethod',0,'join',Object.assign({},options,{method:'deep'}));
fixed('choose key fix',[{name:'a',data:[{sku:'a'}]}],'chooseKey',0,'sku');
fixed('split fix',[{name:'a',text:'{\n"id":1\n}\n{\n"id":2\n}'}],'split',0,null,Object.assign({},options,{method:'deep'}));
fixed('JSON Lines conversion fix',[{name:'a',text:'{"id":1}\n{"id":2}'}],'convertLines',0);
test('Combine adapter preserves objects and scalar values',()=>{const r=format.calculate({files:[{name:'a',data:{x:1}},{name:'b',data:null}],options:{...options,method:'combine'},format:'compact'},merger,compare);assert.deepStrictEqual(r.output.result,[{x:1},null]);assert.equal(r.warnings.length,2);assert.equal(r.report.rows[0].cells[0].value,1);});
test('mixed Join adapter appends extras in source order',()=>{const r=format.calculate({files:[{name:'a',data:[{id:1,a:1},null]},{name:'b',data:[{id:1,a:2},'x']}],options,format:'pretty'},merger,compare);assert.deepStrictEqual(r.output.result,[{id:1,a:2},null,'x']);assert.equal(r.output.conflicts[0].incomingSource,'b');});
test('earlier wins still works with adapter',()=>{const r=format.calculate({files:[{name:'a',data:[{id:1,a:1},0]},{name:'b',data:[{id:1,a:2}]}],options:{...options,winner:'earlier'},format:'pretty'},merger,compare);assert.equal(r.output.result[0].a,1);});
test('three inputs and warning status',()=>{const r=format.inspect([{name:'a',data:[{id:1}]},{name:'b',data:[]},{name:'c',data:[{id:2}]}],options);assert.equal(r.warnings,1);assert.equal(r.errors,0);});
console.log(total+' format tests passed.');
