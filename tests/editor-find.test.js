'use strict';
const assert = require('assert');
const { findMatches, nextIndex, lineColumn } = require('../assets/editor-find.js');
const { alignment, visibleMatches, shortcutAction } = require('../assets/editor-find-ui.js');
let count = 0;
function test(name, run) { run(); count++; console.log('PASS ' + name); }
const text = '{"name":"Name","items":["name",null,12],"broken":"name';
test('values, keys and all, including invalid JSON', () => {
 assert.equal(findMatches(text,'name').matches.length,3);
 assert.equal(findMatches(text,'name',{scope:'keys'}).matches.length,1);
 assert.equal(findMatches(text,'name',{scope:'all'}).matches.length,4);
});
test('match case', () => assert.equal(findMatches(text,'Name',{caseSensitive:true}).matches.length,1));
test('whole word', () => assert.equal(findMatches('["cat","cats","a cat"]','cat',{wholeWord:true}).matches.length,2));
test('unicode', () => assert.equal(findMatches('["café","CAFÉ","猫"]','café').matches.length,2));
test('regex valid and invalid', () => { assert.equal(findMatches('["abc12"]','[0-9]+',{regex:true}).matches.length,1); assert.match(findMatches(text,'[',{regex:true}).error,/Invalid pattern/); });
test('zero length unicode regex terminates', () => assert.equal(findMatches('["😀"]','(?=.)',{regex:true}).matches.length,0));
test('empty query clears', () => assert.equal(findMatches(text,'').matches.length,0));
test('navigation wraps', () => { const m=findMatches(text,'name').matches; assert.equal(nextIndex(m,text.length,'next'),0); assert.equal(nextIndex(m,0,'prev'),m.length-1); assert.equal(nextIndex([],0,'next'),-1); });
test('line and column', () => assert.deepStrictEqual(lineColumn('a\nbc',3),{line:2,column:2}));
test('cap', () => {const r=findMatches(JSON.stringify(Array(6000).fill('hit')),'hit'); assert.equal(r.matches.length,5000); assert(r.truncated);});
test('large document accurate capped count and visible window', () => { const t=JSON.stringify(Array(120000).fill('hit'))+' '.repeat(1048576); const r=findMatches(t,'hit'); assert.equal(r.matches.length,5000); const shown=visibleMatches(r.matches,4999,t,0,240,24,80); assert(shown.includes(r.matches[4999])); });
test('mirror copies typography and content width', () => { const s={fontFamily:'monospace',fontSize:'14px',lineHeight:'24px',paddingLeft:'12px',tabSize:'4'}; const a=alignment(s,300,true); assert.equal(a.fontFamily,s.fontFamily); assert.equal(a.paddingLeft,'12px'); assert.equal(a.width,'300px'); assert.equal(a.whiteSpace,'pre-wrap'); assert.equal(alignment(s,300,false).whiteSpace,'pre'); });
test('Mac and Windows shortcuts and browser escape hatch', () => {
 assert.equal(shortcutAction({key:'f',ctrlKey:true},false,false),'editor');
 assert.equal(shortcutAction({key:'F',metaKey:true},true,false),'editor');
 assert.equal(shortcutAction({key:'f',metaKey:true},true,true),'browser');
 assert.equal(shortcutAction({key:'Enter'},true,true),null);
});
test('large wrapped document limits highlights and retains current', () => {
 const t = 'x'.repeat(1100000), m = Array.from({length:5000},(_,i)=>({start:i*200,end:i*200+1}));
 const shown=visibleMatches(m,4000,t,0,240,24,80);
 assert(shown.length < 100); assert(shown.includes(m[4000]));
 assert(visibleMatches(m,-1,t,0,240,24,Infinity).includes(m[0]));
});
test('supplementary Unicode whole-word boundary', () => assert.equal(findMatches('["𐐀cat", "cat𐐀", "cat"]','cat',{wholeWord:true}).matches.length,1));
test('fallback Find buttons toggle open, closed and open again', () => {
 const { JSDOM } = require('jsdom');
 const { readFileSync } = require('fs');
 const dom = new JSDOM('<div class="editor-pane"><div class="editor-heading"></div><textarea id="first">{}</textarea></div><div class="code-toolbar"></div><pre id="preview" tabindex="0">{}</pre>', { runScripts: 'outside-only' });
 try {
  dom.window.EditorFind = { findMatches, nextIndex, lineColumn };
  dom.window.eval(readFileSync(require.resolve('../assets/editor-find-ui.js'), 'utf8'));
  for (const id of ['first', 'preview']) {
   const doc = dom.window.document;
   const launch = doc.querySelector('[aria-controls="' + id + '-find"]');
   const bar = doc.getElementById(id + '-find');
   assert.equal(bar.hidden, true);
   assert.equal(launch.textContent, 'Find');
   launch.click();
   assert.equal(bar.hidden, false);
   assert.equal(launch.textContent, 'Close ×');
   assert.match(launch.getAttribute('aria-label'), /^Close find in /);
   assert.equal(launch.getAttribute('aria-expanded'), 'true');
   launch.click();
   assert.equal(bar.hidden, true);
   assert.equal(launch.textContent, 'Find');
   assert.equal(launch.getAttribute('aria-expanded'), 'false');
   assert.equal(doc.activeElement, doc.getElementById(id));
   launch.click();
   assert.equal(bar.hidden, false);
   bar.querySelector('[aria-label="Close find"]').click();
   assert.equal(bar.hidden, true);
   assert.equal(launch.textContent, 'Find');
   launch.click();
   bar.querySelector('input').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
   assert.equal(bar.hidden, true);
   assert.equal(launch.textContent, 'Find');
  }
 } finally { dom.window.close(); }
});
console.log(count+' editor find tests passed.');
