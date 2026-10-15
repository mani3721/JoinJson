'use strict';
const assert = require('assert');
const {merge, parse, infer, csv} = require('../assets/tool.js');
let count = 0;
function test(name, run) { run(); count++; console.log('PASS ' + name); }
const file = (name, data) => ({name, data});
const pair = [file('first.json', [{id:1, name:'old', keep:true}]), file('second.json', [{id:1, name:'new', extra:2}])];
test('join later wins and source', () => {const r=merge(pair); assert.deepStrictEqual(r.result,[{id:1,name:'new',keep:true,extra:2}]); assert.strictEqual(r.conflicts[0].previousSource,'first.json'); assert.strictEqual(r.conflicts[0].incomingSource,'second.json');});
test('join earlier wins still adds fields', () => assert.deepStrictEqual(merge(pair,{winner:'earlier'}).result,[{id:1,name:'old',keep:true,extra:2}]));
test('three files track actual retained source', () => {
 const files=pair.concat(file('third.json',[{id:1,name:'latest'}]));
 assert.strictEqual(merge(files).conflicts[1].previousSource,'second.json');
 assert.strictEqual(merge(files,{winner:'earlier'}).conflicts[1].previousSource,'first.json');
 assert.strictEqual(merge(files).result[0].name,'latest');
});
test('nested ID and records path', () => {const r=merge([file('a',{data:{items:[{user:{id:7},x:1}]}}),file('b',{data:{items:[{user:{id:7},y:2}]}})],{key:'user.id',recordsPath:'data.items'}); assert.deepStrictEqual(r.result,[{user:{id:7},x:1,y:2}]);});
test('case-insensitive string IDs', () => assert.strictEqual(merge([file('a',[{id:'ABC'}]),file('b',[{id:'abc'}])],{caseInsensitive:true}).result.length,1));
test('case sensitive and typed identities', () => {assert.strictEqual(merge([file('a',[{id:'ABC'},{id:'abc'},{id:1},{id:'1'}])]).result.length,4);});
test('missing IDs kept independently or removed', () => {const f=[file('a',[{}, {id:null}, {id:''}, {id:0}, {id:false}])]; assert.strictEqual(merge(f).result.length,5); assert.strictEqual(merge(f,{keepNoKey:false}).result.length,2);});
test('duplicates within one file join', () => assert.deepStrictEqual(merge([file('a',[{id:1,a:2},{id:1,b:3}])]).result,[{id:1,a:2,b:3}]));
test('earlier replacement preserves an empty first list', () => assert.deepStrictEqual(merge([file('a',[]),file('b',[1])],{method:'combine',lists:'replace',winner:'earlier'}).result,[]));
test('combine concatenates', () => assert.deepStrictEqual(merge([file('a',[1,2]),file('b',[2,3])],{method:'combine'}).result,[1,2,2,3]));
test('combine unique structural objects and arrays', () => assert.deepStrictEqual(merge([file('a',[{a:1,b:2},[1,2]]),file('b',[{b:2,a:1},[2,1]])],{method:'combine',lists:'unique'}).result,[{b:2,a:1},[1,2],[2,1]]));
test('list replacement both priorities', () => {const f=[file('a',[1]),file('b',[2])]; assert.deepStrictEqual(merge(f,{method:'combine',lists:'replace'}).result,[2]); assert.deepStrictEqual(merge(f,{method:'combine',lists:'replace',winner:'earlier'}).result,[1]);});
test('deep objects and nested array policies', () => {
 const f=[file('a',{config:{x:1,z:0},tags:[1]}),file('b',{config:{x:2,y:3},tags:[1,2]})];
 assert.deepStrictEqual(merge(f,{method:'deep'}).result,{config:{x:2,z:0,y:3},tags:[1,1,2]});
 assert.deepStrictEqual(merge(f,{method:'deep',lists:'unique'}).result.tags,[1,2]);
 assert.deepStrictEqual(merge(f,{method:'deep',lists:'replace',winner:'earlier'}).result.tags,[1]);
});
test('false-like values and null are not missing', () => assert.deepStrictEqual(merge([file('a',{x:1,y:true,z:'yes'}),file('b',{x:0,y:false,z:null})],{method:'deep'}).result,{x:0,y:false,z:null}));
test('wrong shapes and options reject with guidance', () => {
 assert.throws(()=>merge([file('bad',{})]),/expected a list/);
 assert.throws(()=>merge([file('bad',[1])]),/Use combine lists/);
 assert.throws(()=>merge([file('bad',[])],{method:'deep'}),/needs a JSON object/);
 assert.throws(()=>merge([file('bad',[{id:{a:1}}])]),/non-scalar ID/);
 assert.throws(()=>merge([]),/Add at least one/);
 assert.throws(()=>merge(pair,{key:''}),/Enter an ID key/);
 assert.throws(()=>merge(pair,{method:'unknown'}),/valid merge method/);
});
test('invalid JSON includes location and repair guidance', () => {
 assert.throws(()=>parse('{\n"a": 1,\n}', 'broken.json'),/broken.json: invalid JSON at line 3, column 1/);
 assert.throws(()=>parse('{"a":', 'incomplete'),/line 1, column 6/);
 assert.throws(()=>parse("{'a':1}", 'quotes'),/double quotes/);
});
test('__proto__ stays ordinary data and never pollutes prototypes', () => {
 const a=parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"bad":1}}}');
 const b=parse('{"__proto__":{"extra":2}}');
 const r=merge([file('a',a),file('b',b)],{method:'deep'}).result;
 assert.strictEqual(Object.getPrototypeOf(r),Object.prototype);
 assert.strictEqual(Object.prototype.polluted,undefined);
 assert.strictEqual(({}).bad,undefined);
 assert.strictEqual(Object.prototype.hasOwnProperty.call(r,'__proto__'),true);
 assert.strictEqual(JSON.parse(JSON.stringify(r)).__proto__.extra,2);
 assert.strictEqual(merge([file('a',[parse('{"__proto__":"x"}')])],{key:'__proto__'}).result.length,1);
});
test('paths do not traverse inherited properties', () => assert.strictEqual(merge([file('a',[{}])],{key:'constructor',keepNoKey:false}).result.length,0));
test('input immutability', () => {const before=JSON.stringify(pair); merge(pair); assert.strictEqual(JSON.stringify(pair),before);});
test('automatic method selection including nested ID', () => {
 assert.strictEqual(infer({},{}).method,'deep');
 assert.strictEqual(infer([{id:1}],[{id:1}]).key,'id');
 assert.strictEqual(infer([{user:{id:1}}],[{user:{id:1}}]).key,'user.id');
 assert.strictEqual(infer([1],[2]).method,'combine');
 assert.strictEqual(infer([],[{id:1}]).method,'combine');
 assert.throws(()=>infer({},[]),/two objects or two lists/);
});
test('CSV escapes quotes, commas, newlines and spreadsheet formulas', () => {const out=csv([{path:'/a',previousSource:'=SUM(1,2)',incomingSource:'file"name',previous:'line\nvalue',incoming:2,resolution:'later'}]); assert(out.includes('"\'=SUM(1,2)"')); assert(out.includes('file""name')); assert(out.includes('Previous source'));});
console.log(count + ' merge tests passed.');
