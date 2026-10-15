'use strict';
// Interaction wiring test with a minimal DOM; not a real-browser accessibility test.
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const { performance } = require('perf_hooks');
const nodes = new Map(), events = {};
function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const n = {
        id, value: '', textContent: '', checked: false, disabled: false, hidden: false, children: [], listeners: {}, attributes: {}, classList: { toggle() { } }, parentElement: null,
        addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); },
        setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; },
        replaceChildren() { this.children = []; }, append(...items) { this.children.push(...items); items.forEach(i => i.parentElement = this); },
        focus() { document.activeElement = this; }, scrollIntoView() { this.scrolled = true; }, querySelector() { return null; }, remove() { }, click() { if (this.onclick) this.onclick(); }
    };
    nodes.set(id, n); return n;
}
const document = { getElementById: node, createElement: tag => node('created-' + tag + '-' + Math.random()), activeElement: null, body: node('body'), addEventListener(type, fn) { (events[type] || (events[type] = [])).push(fn); }, dispatchEvent(e) { (events[e.type] || []).forEach(fn => fn(e)); } };
['copy', 'copy-box', 'download', 'csv', 'mobile-download'].forEach(id => { node(id).parentElement = node(id + '-anchor'); });
node('auto-merge').checked = true; node('format').value = 'pretty'; node('method').value = 'join'; node('key').value = 'id'; node('winner').value = 'later'; node('lists').value = 'concat'; node('keep-no-key').checked = true;
const context = { document, window: { JsonMerger: require('../assets/tool.js'), JsonCompare: require('../assets/compare.js'), JsonFormat: require('../assets/format-check.js') }, performance, Blob: class { constructor(parts) { this.size = Buffer.byteLength(parts.join('')); } }, CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } }, matchMedia: () => ({ matches: true }), navigator: { clipboard: { writeText: async text => { context.copied = text; } } }, setTimeout, clearTimeout, URL: { createObjectURL: () => '', revokeObjectURL() { } }, console };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/flow.js'), 'utf8'), context);
const wait = () => new Promise(r => setTimeout(r, 30));
(async () => {
    assert(node('merge').disabled); assert.equal(node('merge').attributes['aria-disabled'], 'true');
    assert.equal(node('merge-block-reason').textContent, 'Add JSON to both boxes');
    assert.equal(node('first').attributes['aria-invalid'], 'false');
    assert.equal(node('first-shape').children[1].textContent, 'Empty');
    assert.equal(node('merge-shortcut').textContent, 'Ctrl ↵');
    context.navigator.platform = 'MacIntel';
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/flow.js'), 'utf8'), context);
    assert.equal(node('merge-shortcut').textContent, '⌘ ↵');
    // The latest listeners belong to the second controller used to verify Mac UI.
    node('first').listeners.input = node('first').listeners.input.slice(-1);
    events.keydown = events.keydown.slice(-1);
    node('auto-merge').checked = false;
    node('first').value = '[{"id":1}]'; node('first').listeners.input[0]();
    assert.equal(node('merge-block-reason').textContent, 'Add the second JSON'); assert(node('merge').disabled);
    node('first').value = ''; node('second').value = '[{"id":1}]'; node('first').listeners.input[0]();
    assert.equal(node('merge-block-reason').textContent, 'Add the first JSON');
    node('first').value = '{bad'; node('first').listeners.input[0]();
    assert.equal(node('merge-block-reason').children[0].textContent, 'Fix the error in First JSON');
    assert.equal(node('first-shape').children[1].textContent, 'Invalid · line 1');
    node('merge-block-reason').children[0].onclick({ preventDefault() {} });
    assert.equal(document.activeElement.id, 'first');
    assert(node('first').scrolled);
    assert.equal(node('first-shape').attributes['data-state'], 'invalid');
    node('first').value = '{"a":1,"b":2}'; node('second').value = '{"a":1}';
    node('first').listeners.input[0]();
    assert.equal(node('first-shape').children[1].textContent, 'Valid · 2 keys');
    assert.equal(node('merge-block-reason').textContent, 'Ready to merge');
    assert.equal(node('merge').attributes['aria-disabled'], 'false');
    node('first').value = '[{"id":1}]'; node('second').value = '{bad';
    node('first').listeners.input[0]();
    assert.equal(node('merge-block-reason').children[0].textContent, 'Fix the error in Second JSON');
    node('merge-block-reason').children[0].onclick({ preventDefault() {} });
    assert.equal(document.activeElement.id, 'second');

    node('first').value = '[{"id":1,"name":"old"}]'; node('second').value = '[{"id":1,"name":"new"}]';
    node('first').listeners.input[0](); assert.equal(node('merge').textContent, 'Merge');
    assert.equal(node('first-shape').children[1].textContent, 'Valid · 1 records');
    assert.equal(node('merge-block-reason').textContent, 'Ready to merge');
    assert(!node('merge').disabled);
    let prevented = false; (events.keydown || [])[0]({ ctrlKey: true, key: 'Enter', preventDefault() { prevented = true; } }); await wait();
    assert(prevented); assert(document.activeElement, node('status').textContent); assert.equal(document.activeElement.id, 'result-heading'); assert(node('result-card').scrolled); assert.equal(node('status').textContent, 'Merged. 1 conflicts found.'); assert.equal(node('conflict-count').textContent, 1); assert.equal(node('conflicts').children.length, 1); assert(!node('review-conflicts').hidden);
    let selected; document.addEventListener('jm:tab', e => selected = e.detail); node('review-conflicts').onclick(); assert.equal(selected, 'conflicts'); assert.equal(document.activeElement.id, 'conflicts-tab');
    await node('copy').onclick(); assert.equal(node('action-toast').textContent, 'Copied'); assert(context.copied.includes('new')); assert(!node('status').textContent.includes('copied'));
    let commandPrevented = false;
    events.keydown[0]({ metaKey: true, key: 'Enter', preventDefault() { commandPrevented = true; } }); await wait();
    assert(commandPrevented); assert.equal(document.activeElement.id, 'result-heading');
    node('auto-merge').checked = true; node('auto-merge').onchange(); await wait(); assert.equal(node('merge').textContent, 'Merge'); assert.equal(node('merge-block-reason').textContent, 'Merged · 1 conflicts');
    node('first').value = '[{"id":1,"name":"latest"}]'; node('first').listeners.input[0]();
    assert.equal(node('merge-block-reason').textContent, 'Ready to merge');
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(node('merge-block-reason').textContent, 'Merged · 1 conflicts');
    assert(node('preview').textContent.includes('new'));
    node('clear-data').onclick(); assert.equal(node('first').value, ''); assert(node('code-box').hidden); assert(!node('empty-result').hidden);
    assert(!nodes.has('load-samples'));
    assert(!nodes.has('samples'), 'Sample-loading controls are removed');
    node('mode-toggle').onclick();
    context.window.JMFlow.addSource({ name: 'remote.json', text: '[{"id":7}]' });
    assert.equal(context.window.JMFlow.snapshot().files[0].name, 'remote.json');
    assert.equal(node('files').children.length, 1);
    assert.equal(node('merge-block-reason').textContent, 'Ready to merge');
    node('quick-mode').onclick();
    node('first').value = '[{"id":1}]'; node('second').value = '[{"id":1,"a":2}]';
    node('merge').onclick(); await wait();
    node('quick-mode').onclick(); node('first').value = '{bad'; node('second').value = '[]'; node('first').listeners.input[0](); node('merge').onclick(); await wait(); assert.equal(node('result-chip').textContent, 'Out of date'); assert.equal(node('format-status').attributes.role, 'alert'); assert(node('merge').disabled); assert(/Cannot merge yet/.test(node('status').textContent));
    node('first').value = '[{"id":1}]'; node('second').value = '[{"id":1,"a":2}]'; node('merge').onclick(); await wait();
    assert(node('format-check').hidden, 'Format check hides for valid compatible inputs'); assert.equal(node('merge-block-reason').textContent, 'Merged · no conflicts');
    const old = node('preview').textContent; node('first').value = '{bad'; node('first').listeners.input[0](); assert(!node('format-check').hidden, 'Format check appears for invalid JSON'); assert.equal(node('preview').textContent, old); assert.equal(node('result-chip').textContent, 'Out of date'); assert(node('merge').disabled);
    node('format-demo').onclick(); assert(node('merge').disabled); const fixRow = node('format-global').children[0]; fixRow.children[0].onclick(); await wait(); assert(!node('merge').disabled); assert(node('first').value.startsWith('[')); node('format-undo').onclick(); assert(node('first').value.startsWith('{')); assert(node('merge').disabled); node('clear-data').onclick();
    assert(node('format-check').hidden, 'Format check hides after clearing');
    node('first').value = '[]'; node('second').value = '[]'; node('first').listeners.input[0](); assert(!node('format-check').hidden, 'Format check shows compatibility warnings'); node('clear-data').onclick();
    console.log('PASS UI wiring: manual/off mode, shortcut, focus/scroll request, announcement text, conflicts tab, copy toast, current state, clear, sample, invalid JSON. UNVERIFIED: actual browser behavior.');
})().catch(e => { console.error(e); process.exitCode = 1; });
