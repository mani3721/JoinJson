/* Browser integration: exports require explicit gestures; imported data is never persisted. */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  const $=id=>document.getElementById(id), api=window.JMSharing, flow=window.JMFlow;
  if (!flow) return;
  let pending=null, undo=null, undoTimer, sharePayload=null, request=0;
  async function copy(text, anchor) { try { await navigator.clipboard.writeText(text); flow.toast('Copied',anchor); } catch (_) { flow.toast('Clipboard blocked. Use Copy or Download.',anchor); } }
  function discardUndo() { undo=null; clearTimeout(undoTimer); $('example-undo').hidden=true; }
  function load(item) {
    discardUndo(); undo=flow.snapshot();
    flow.applySnapshot(item.state); flow.run(true);
    $('example-undo').hidden=false; $('example-message').textContent='Inputs loaded. Undo is available for 10 seconds.';
    undoTimer=setTimeout(()=>{undo=null; $('example-undo').hidden=true; $('example-message').textContent='';},10000);
  }
  function requestLoad(state,id) {
    pending={state,id};
    if (flow.hasData()) { $('example-confirm').hidden=false; $('example-confirm-yes').focus(); }
    else { load(pending); pending=null; }
  }
  $('example-confirm-yes').onclick=()=>{ if(pending) load(pending); pending=null; $('example-confirm').hidden=true; $('share-tool').focus(); };
  $('example-confirm-no').onclick=()=>{pending=null; $('example-confirm').hidden=true; $('share-tool').focus();};
  $('example-undo').onclick=()=>{if(!undo)return; const saved=undo; discardUndo(); flow.applySnapshot(saved); flow.run(false); $('example-message').textContent='Input replacement undone.';};
  const activeSettings=()=>{const state=flow.snapshot();return Object.assign({},state.options,{format:state.format});};
  $('share-tool').onclick=()=>copy(api.plainURL(location.href),$('share-tool'));
  $('share-settings').onclick=()=>copy(api.settingsURL(location.href,activeSettings()),$('share-settings'));
  $('share-data-enabled').onchange=()=>{$('share-data').hidden=!$('share-data-enabled').checked;};
  $('share-data').onclick=async()=>{
    if(!$('share-data-enabled').checked)return;
    const token=++request; $('share-message').textContent='Creating link locally…';
    try { const link=await api.dataURL(location.href,flow.snapshot()); if(token!==request||!$('share-data-enabled').checked)return; await copy(link,$('share-data')); $('share-message').textContent='Anyone with this link can read the inputs. Compression is not encryption.'; }
    catch (_) { if(token===request) $('share-message').textContent='Cannot create this data link: it is invalid or exceeds 8,000 characters. Use Copy or Download instead.'; }
  };
  document.addEventListener('jm:result-ready',e=>{
    sharePayload=typeof File==='function'?{files:[new File([window.JMEditors ? window.JMEditors.text('preview',e.detail.text) : e.detail.text],'merged.json',{type:'application/json'})]}:null;
    $('share-native').hidden=!sharePayload||!api.canShare(navigator,sharePayload);
  });
  document.addEventListener('jm:inputs-changed',()=>{sharePayload=null; $('share-native').hidden=true;});
  $('share-native').onclick=async()=>{
    if(!sharePayload||!api.canShare(navigator,sharePayload)){ $('share-native').hidden=true; return; }
    try { await navigator.share(sharePayload); } catch (_) { /* Cancel or unsupported target: Copy/Download remain available. */ }
  };
  $('clear-data').addEventListener('click',()=>{request++;discardUndo();pending=null;sharePayload=null;$('share-native').hidden=true;$('example-confirm').hidden=true;$('share-data-enabled').checked=false;$('share-data').hidden=true;$('share-message').textContent='';});
  const originalURL=location.href;
  if(location.hash.startsWith('#data=')) {
    try { history.replaceState(null,'',location.pathname+location.search); } catch (_) { /* No persistence fallback. */ }
    try { const state=await api.parseData(originalURL); if(state)requestLoad(state,''); }
    catch (_) { $('share-message').textContent='Cannot open this shared data link. It may be malformed, too large, or require compression support.'; }
  } else {
    const imported=api.parseSettings(originalURL);
    if(Object.keys(imported).length){ const saved=flow.snapshot();saved.options=Object.assign(saved.options,imported);if(imported.format)saved.format=imported.format;flow.applySnapshot(saved); }
  }
});
