'use strict';
const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const {createStore,valid,defaults} = require('../assets/theme.js');
let count=0;
function test(name,run){run();count++;console.log('PASS '+name);}
function memory(){const data=new Map();return {data,getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
test('all default values round trip under versioned keys',()=>{const m=memory(),s=createStore(()=>m);Object.entries(defaults).forEach(([k,v])=>{assert.strictEqual(s.read(k),v);assert(s.write(k,v));assert.strictEqual(s.read(k),v);assert(m.data.has('jm:v1:'+k));});});
test('corrupted and out-of-range values fall back',()=>{const m=memory(),s=createStore(()=>m);for(const bad of ['bad JSON','null','{}','"auto"','42']){m.data.set('jm:v1:theme',bad);assert.strictEqual(s.read('theme'),'system');}m.data.set('jm:v1:caseInsensitive','"true"');assert.strictEqual(s.read('caseInsensitive'),false);});
test('throwing storage methods and getter are contained',()=>{for(const provider of [()=>{throw Error('blocked');},()=>({getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}})]){const s=createStore(provider);assert.strictEqual(s.read('theme'),'system');assert.strictEqual(s.write('theme','dark'),false);assert.strictEqual(s.reset(),false);}});
test('strict field allowlist rejects JSON, names, and prototype keys',()=>{const m=memory(),s=createStore(()=>m);['files','result','filename','recordsPath','__proto__','constructor'].forEach(k=>{assert.strictEqual(s.write(k,'private'),false);assert.strictEqual(s.read(k),undefined);});assert.strictEqual(s.write('key','{"secret":1}'),false);assert.strictEqual(s.write('key','a'.repeat(121)),false);assert.strictEqual(s.write('caseInsensitive',1),false);assert.strictEqual(m.data.size,0);assert(valid('key','user.id'));});
test('reset touches only seven owned preference keys',()=>{const m=memory(),s=createStore(()=>m);m.data.set('other:app','keep');s.write('theme','dark');assert(s.reset());assert.deepStrictEqual([...m.data.entries()],[['other:app','keep']]);});
test('head bootstrap validates values and tolerates blocked storage',()=>{const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');const source=html.match(/<script data-theme-init>([\s\S]*?)<\/script>/)[1];for(const value of ['"dark"','"light"','"system"','broken','"invalid"']){const context={document:{documentElement:{dataset:{}}},localStorage:{getItem:()=>value}};vm.runInNewContext(source,context);assert.strictEqual(context.document.documentElement.dataset.theme,['"dark"','"light"','"system"'].includes(value)?JSON.parse(value):undefined);}vm.runInNewContext(source,{document:{documentElement:{dataset:{}}},get localStorage(){throw Error('blocked');}});});
console.log(count+' storage tests passed.');
