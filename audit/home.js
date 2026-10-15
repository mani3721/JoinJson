
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_PREVIEW_LINES = 5e3;
  const MAX_PREVIEW_CHARS = 25e4;
  const MAX_DEPTH = 120;
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const states = [];
  let resultText = "", lastResult = null, resultReady = false;
  let changes = /* @__PURE__ */ new Map(), totalAdded = 0, totalOverridden = 0;
  let mergeWorker = null, mergeJob = 0, merging = false;
  const WORKER_THRESHOLD = 256 * 1024;
  const pointer = (path, key) => path + "/" + String(key).replace(/~/g, "~0").replace(/\//g, "~1");
  const announce = (message) => {
    $("status").textContent = message;
  };
  const sizeLabel = (bytes) => bytes < 1024 ? bytes + " B" : bytes < 1048576 ? (bytes / 1024).toFixed(1) + " KB" : (bytes / 1048576).toFixed(1) + " MB";
  const searchIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"></circle><path d="m15 15 5 5"></path></svg>';
  ["First", "Second"].forEach((name, index) => {
    const id = index === 0 ? "first" : "second";
    const card = document.createElement("article");
    card.className = "input-card";
    card.dataset.state = "empty";
    card.setAttribute("aria-labelledby", id + "-heading");
    card.innerHTML = `
      <div class="card-heading"><h3 id="${id}-heading">${name} JSON <span class="muted">${index ? "B" : "A"}</span></h3><span id="${id}-status" class="badge" data-state="empty" role="status" aria-live="polite">Empty</span></div>
      <div class="segments" role="tablist" aria-label="${name} JSON input method">
        <button id="${id}-tab-paste" type="button" role="tab" aria-selected="true" aria-controls="${id}-paste" data-method="paste">Paste</button>
        <button id="${id}-tab-upload" type="button" role="tab" aria-selected="false" aria-controls="${id}-upload" tabindex="-1" data-method="upload">Upload</button>
        <button id="${id}-tab-url" type="button" role="tab" aria-selected="false" aria-controls="${id}-url-panel" tabindex="-1" data-method="url">From URL</button>
      </div>
      <div id="${id}-paste" class="method-panel" role="tabpanel" aria-labelledby="${id}-tab-paste">
        <div class="editor"><div class="editor-top"><label class="editor-label" for="${id}">${index ? "second" : "first"}.json</label><div class="icon-tools" role="group" aria-label="${name} JSON editor tools">
          <button type="button" class="icon-button" data-action="find" title="Find" aria-label="Find in ${name.toLowerCase()} JSON" aria-expanded="false" aria-controls="${id}-find-bar">${searchIcon}</button>
          <button type="button" class="icon-button" data-action="wrap" title="Wrap lines" aria-label="Wrap lines in ${name.toLowerCase()} JSON" aria-pressed="false">\u21B5</button>
          <button type="button" class="icon-button" data-action="format" title="Format JSON" aria-label="Format ${name.toLowerCase()} JSON">{ }</button>
          <details class="help-popover"><summary aria-label="Editor keyboard help" title="Editor help">?</summary><p>Tab moves to the next control. Ctrl/Cmd+F opens Find in this editor. Escape closes Find. Ctrl/Cmd+Enter merges both inputs.</p></details>
        </div></div>
        <div id="${id}-find-bar" class="find-bar" hidden><label class="sr-only" for="${id}-find">Find text in ${name.toLowerCase()} JSON</label><input id="${id}-find" type="search" placeholder="Find text\u2026" autocomplete="off"><button type="button" data-action="next" class="icon-button" title="Next match" aria-label="Next match">\u2193</button><button type="button" data-action="close-find" class="icon-button" title="Close Find" aria-label="Close Find">\xD7</button><span class="find-status" role="status"></span></div>
        <div class="edit-body"><pre id="${id}-lines" class="line-numbers" aria-hidden="true">1</pre><textarea id="${id}" class="json-input" rows="10" wrap="off" placeholder='{"name": "Ana"}' spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="${id}-status"></textarea></div></div>
      </div>
      <div id="${id}-upload" class="method-panel" role="tabpanel" aria-labelledby="${id}-tab-upload" hidden>
        <input id="${id}-file" type="file" accept=".json,application/json" class="sr-only" tabindex="-1" aria-label="Upload ${name.toLowerCase()} JSON file">
        <button type="button" class="drop-zone" data-action="browse"><span class="drop-icon" aria-hidden="true">\u21E7</span><span>Drop a .json file here or click to browse</span><span class="muted">Up to 20 MB \xB7 stays in your browser</span></button>
        <div id="${id}-file-info" class="file-info" hidden><div class="file-description"><strong></strong><span class="muted"></span></div><button type="button" class="icon-button" data-action="remove" aria-label="Remove ${name.toLowerCase()} JSON file" title="Remove file">\xD7</button></div>
        <button type="button" class="link-button" data-action="edit-upload" hidden>Edit loaded JSON</button>
      </div>
      <div id="${id}-url-panel" class="method-panel" role="tabpanel" aria-labelledby="${id}-tab-url" hidden>
        <label class="url-label" for="${id}-url">${name} JSON URL</label><div class="url-controls"><input id="${id}-url" type="url" placeholder="https://example.com/data.json" autocomplete="off" spellcheck="false" aria-describedby="${id}-url-help"><button type="button" data-action="load">Load</button><button type="button" data-action="cancel" hidden>Cancel</button></div>
        <p id="${id}-url-help" class="url-help">Must be a public HTTPS link with CORS enabled, up to 20 MB</p><button type="button" class="link-button" data-action="edit-url" hidden>Edit loaded JSON</button>
      </div><p id="${id}-import-status" class="import-status" role="status" aria-live="polite"></p>`;
    $("inputs").append(card);
    const state = { id, card, editor: $(id), value: void 0, valid: false, method: "paste", revision: 0, controller: null, timer: null, file: null };
    states.push(state);
    const action = (name2) => card.querySelector('[data-action="' + name2 + '"]');
    state.action = action;
    state.editor.addEventListener("input", () => {
      cancelImport(state);
      state.file = null;
      updateFile(state);
      state.revision++;
      invalidateResult();
      clearTimeout(state.timer);
      state.valid = false;
      updateReady();
      state.timer = setTimeout(() => validate(state), 180);
      updateLines(state);
    });
    state.editor.addEventListener("scroll", () => {
      $(id + "-lines").scrollTop = state.editor.scrollTop;
    });
    state.editor.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFind(state, true);
      }
      if (event.key === "Escape") setFind(state, false);
    });
    card.querySelectorAll("[role=tab]").forEach((tab) => {
      tab.addEventListener("click", () => setMethod(state, tab.dataset.method));
      tab.addEventListener("keydown", (event) => {
        const tabs = [...card.querySelectorAll("[role=tab]")];
        let next;
        if (event.key === "ArrowRight") next = (tabs.indexOf(tab) + 1) % 3;
        if (event.key === "ArrowLeft") next = (tabs.indexOf(tab) + 2) % 3;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = 2;
        if (next !== void 0) {
          event.preventDefault();
          tabs[next].click();
          tabs[next].focus();
        }
      });
    });
    action("find").onclick = () => setFind(state, $(id + "-find-bar").hidden);
    action("close-find").onclick = () => setFind(state, false);
    action("next").onclick = () => findNext(state);
    $(id + "-find").addEventListener("input", () => {
      state.editor.setSelectionRange(0, 0);
      findNext(state);
    });
    $(id + "-find").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        findNext(state);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setFind(state, false);
      }
    });
    action("wrap").onclick = () => {
      const wrap = !state.editor.classList.contains("wrap");
      state.editor.classList.toggle("wrap", wrap);
      state.editor.wrap = wrap ? "soft" : "off";
      action("wrap").setAttribute("aria-pressed", String(wrap));
      $(id + "-lines").hidden = wrap;
    };
    action("format").onclick = () => {
      if (validate(state)) {
        setText(state, JSON.stringify(state.value, null, 2));
        announce(name + " JSON formatted.");
      } else announce("Fix " + name.toLowerCase() + " JSON before formatting.");
    };
    action("browse").onclick = () => $(id + "-file").click();
    $(id + "-file").onchange = (event) => {
      if (event.target.files[0]) importFile(state, event.target.files[0]);
    };
    const zone = action("browse");
    ["dragenter", "dragover"].forEach((type) => zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.classList.add("dragging");
    }));
    ["dragleave", "drop"].forEach((type) => zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.classList.remove("dragging");
    }));
    zone.addEventListener("drop", (event) => {
      if (event.dataTransfer.files.length !== 1) {
        importStatus(state, "Choose one .json file for this input.", true);
        return;
      }
      importFile(state, event.dataTransfer.files[0]);
    });
    action("remove").onclick = () => {
      cancelImport(state);
      state.file = null;
      $(id + "-file").value = "";
      setText(state, "");
      updateFile(state);
      importStatus(state, "File removed.");
      action("browse").focus();
    };
    action("edit-upload").onclick = action("edit-url").onclick = () => {
      setMethod(state, "paste");
      state.editor.focus();
    };
    action("load").onclick = () => loadUrl(state);
    action("cancel").onclick = () => {
      cancelImport(state);
      importStatus(state, "Loading cancelled. Existing JSON unchanged.");
      action("load").focus();
    };
    $(id + "-url").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        loadUrl(state);
      }
    });
    $(id + "-url").addEventListener("input", () => cancelImport(state));
  });
  function setMethod(state, method) {
    if (state.method !== method) cancelImport(state);
    state.method = method;
    state.card.querySelectorAll("[role=tab]").forEach((tab) => {
      const active = tab.dataset.method === method;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      $(tab.getAttribute("aria-controls")).hidden = !active;
    });
    importStatus(state, "");
  }
  function setFind(state, open) {
    $(state.id + "-find-bar").hidden = !open;
    state.action("find").setAttribute("aria-expanded", String(open));
    (open ? $(state.id + "-find") : state.editor).focus();
  }
  function findNext(state) {
    const query = $(state.id + "-find").value;
    const status = state.card.querySelector(".find-status");
    if (!query) {
      status.textContent = "";
      return;
    }
    const text = state.editor.value.toLowerCase(), needle = query.toLowerCase();
    let index = text.indexOf(needle, state.editor.selectionEnd);
    if (index < 0) index = text.indexOf(needle);
    if (index < 0) {
      status.textContent = "No matches";
      return;
    }
    state.editor.focus();
    state.editor.setSelectionRange(index, index + query.length);
    state.editor.scrollTop = Math.max(0, (state.editor.value.slice(0, index).split("\n").length - 3) * 22);
    $(state.id + "-lines").scrollTop = state.editor.scrollTop;
    status.textContent = "Match selected";
  }
  function updateLines(state) {
    const text = state.editor.value;
    let count = 1, position = -1;
    while (count < 5e4 && (position = text.indexOf("\n", position + 1)) !== -1) count++;
    $(state.id + "-lines").textContent = Array.from({ length: count }, (_, i) => i + 1).join("\n");
  }
  function parse(text) {
    if (!text.trim()) throw new Error("Enter a JSON value first.");
    let depth = 0, quoted = false, escaped = false;
    for (const char of text) {
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{" || char === "[") {
        if (++depth > MAX_DEPTH) throw new Error("Use fewer than " + MAX_DEPTH + " nested levels.");
      } else if (char === "}" || char === "]") depth--;
    }
    return JSON.parse(text);
  }
  function errorMessage(text, error) {
    const position = /position\s+(\d+)/i.exec(error.message);
    const location = /line\s+(\d+)/i.exec(error.message);
    const line = location ? Number(location[1]) : position ? text.slice(0, Number(position[1])).split("\n").length : text.split("\n").length;
    let reason = "Check double quotes, commas, and matching brackets.";
    if (/nested levels/.test(error.message)) reason = error.message;
    else if (/unexpected end|unterminated|end of json/i.test(error.message)) reason = "The JSON is incomplete. Close any open quotes or brackets.";
    else if (/property name|double.quoted/i.test(error.message)) reason = "Use double-quoted keys and remove any trailing comma.";
    else if (/after json|non-whitespace/i.test(error.message)) reason = "Use one JSON value only; remove extra text after it.";
    return "Error on line " + Math.max(1, line) + ": " + reason;
  }
  function validate(state) {
    clearTimeout(state.timer);
    const text = state.editor.value, badge = $(state.id + "-status");
    state.valid = false;
    state.value = void 0;
    let status = "empty", message = "Empty";
    if (text.trim()) {
      try {
        state.value = parse(text);
        state.valid = true;
        status = "valid";
        message = "Valid JSON \u2713";
      } catch (error) {
        status = "error";
        message = errorMessage(text, error);
      }
    }
    state.card.dataset.state = badge.dataset.state = status;
    badge.textContent = message;
    state.editor.setAttribute("aria-invalid", String(status === "error"));
    updateReady();
    return state.valid;
  }
  function updateAds() {
    const eligible = resultReady && states.length === 2 && states.every((state) => state.valid && !state.importError && !state.controller);
    document.querySelectorAll(".ad-slot").forEach((slot) => {
      slot.hidden = !eligible;
    });
  }
  function updateReady() {
    updateAds();
    const ready = !merging && states.length === 2 && states.every((state) => state.valid);
    $("merge").disabled = !ready;
    $("merge-reason").textContent = ready ? "Both inputs are ready." : "Add valid JSON to both inputs to continue.";
    const step = resultReady ? 3 : ready ? 2 : 1;
    [1, 2, 3].forEach((n) => {
      if (n === step) $("step-" + n).setAttribute("aria-current", "step");
      else $("step-" + n).removeAttribute("aria-current");
    });
  }
  function invalidateResult() {
    mergeJob++;
    merging = false;
    if (mergeWorker) {
      mergeWorker.terminate();
      mergeWorker = null;
    }
    $("merge").removeAttribute("aria-busy");
    resultText = "";
    lastResult = null;
    resultReady = false;
    ["copy", "download", "format-result"].forEach((id) => {
      $(id).disabled = true;
    });
    $("result-output").hidden = $("result-legend").hidden = $("preview-notice").hidden = true;
    $("result-empty").hidden = false;
    $("result-lines").replaceChildren();
    $("result-empty").textContent = "Your merged JSON will appear here.";
    updateReady();
  }
  function setText(state, text) {
    clearTimeout(state.timer);
    state.editor.value = text;
    state.revision++;
    invalidateResult();
    updateLines(state);
    validate(state);
  }
  function importStatus(state, message, error = false) {
    const node = $(state.id + "-import-status");
    node.textContent = message;
    node.classList.toggle("error", error);
    state.importError = error;
    updateAds();
  }
  function updateFile(state) {
    const info = $(state.id + "-file-info");
    info.hidden = !state.file;
    state.action("edit-upload").hidden = !state.file;
    if (state.file) {
      info.querySelector("strong").textContent = state.file.name;
      info.querySelector(".muted").textContent = sizeLabel(state.file.size);
    }
  }
  function busy(state, loading) {
    state.action("load").disabled = loading;
    state.action("cancel").hidden = !loading;
    state.action("browse").disabled = loading;
    state.card.setAttribute("aria-busy", String(loading));
    updateAds();
  }
  function cancelImport(state) {
    if (state.controller) {
      state.controller.abort();
      state.controller = null;
    }
    busy(state, false);
  }
  async function importFile(state, file) {
    cancelImport(state);
    if (!/\.json$/i.test(file.name)) {
      importStatus(state, "Choose a file ending in .json.", true);
      return;
    }
    if (file.size > MAX_BYTES) {
      importStatus(state, "File is larger than 20 MB.", true);
      return;
    }
    const controller = new AbortController(), revision = state.revision;
    state.controller = controller;
    busy(state, true);
    importStatus(state, "Reading file\u2026");
    try {
      const text = (await file.text()).replace(/^\uFEFF/, "");
      if (controller.signal.aborted || state.revision !== revision) return;
      parse(text);
      setText(state, text);
      state.file = { name: file.name, size: file.size };
      updateFile(state);
      state.action("edit-url").hidden = true;
      importStatus(state, "Loaded " + file.name + ".");
    } catch (error) {
      if (!controller.signal.aborted) importStatus(state, "Could not load file. " + errorMessage("", error) + " Existing JSON unchanged.", true);
    } finally {
      if (state.controller === controller) {
        state.controller = null;
        busy(state, false);
      }
      $(state.id + "-file").value = "";
    }
  }
  async function loadUrl(state) {
    cancelImport(state);
    let url;
    try {
      url = new URL($(state.id + "-url").value.trim());
      if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    } catch {
      importStatus(state, "Enter a public HTTPS URL without embedded credentials.", true);
      return;
    }
    const controller = new AbortController(), revision = state.revision;
    state.controller = controller;
    busy(state, true);
    importStatus(state, "Loading JSON\u2026");
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 3e4);
    try {
      const response = await fetch(url.href, { signal: controller.signal, mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
      if (!response.ok) throw new Error("The source returned HTTP " + response.status + ".");
      if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("The response is larger than 20 MB.");
      if (response.url && new URL(response.url).protocol !== "https:") throw new Error("The source must stay on HTTPS.");
      let text = "";
      if (response.body && response.body.getReader) {
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let bytes = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > MAX_BYTES) {
              controller.abort();
              throw new Error("The response is larger than 20 MB.");
            }
            text += decoder.decode(part.value, { stream: true });
          }
          text += decoder.decode();
        } finally {
          reader.releaseLock();
        }
      } else {
        text = await response.text();
        if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error("The response is larger than 20 MB.");
      }
      if (controller.signal.aborted || state.revision !== revision) return;
      text = text.replace(/^\uFEFF/, "");
      try {
        parse(text);
      } catch (error) {
        throw new Error("The source did not return valid JSON. " + errorMessage(text, error));
      }
      setText(state, text);
      state.file = null;
      updateFile(state);
      state.action("edit-url").hidden = false;
      importStatus(state, "JSON loaded. Select \u201CEdit loaded JSON\u201D to review it.");
    } catch (error) {
      if (state.controller !== controller) return;
      const message = timedOut ? "Request timed out after 30 seconds." : error.name === "TypeError" ? "Unable to load this URL. Check the link, your connection, and the source\u2019s CORS settings." : error.message;
      importStatus(state, message + " Existing JSON unchanged.", true);
    } finally {
      clearTimeout(timeout);
      if (state.controller === controller) {
        state.controller = null;
        busy(state, false);
      }
    }
  }
  function mergeValues(first, second, deep, arrays, depth = 0) {
    if (depth > MAX_DEPTH) throw new Error("The merged JSON is too deeply nested.");
    if (Array.isArray(first) && Array.isArray(second)) return arrays === "concat" ? first.concat(second) : second;
    if (object(first) && object(second)) {
      const output = /* @__PURE__ */ Object.create(null);
      for (const key of Object.keys(first)) output[key] = first[key];
      for (const key of Object.keys(second)) output[key] = own(first, key) && deep ? mergeValues(first[key], second[key], deep, arrays, depth + 1) : second[key];
      return output;
    }
    return second;
  }
  function collectChanges(first, merged, path = "", exists = true) {
    if (!exists) {
      changes.set(path, "added");
      totalAdded++;
      return;
    }
    if (object(first) && object(merged)) {
      for (const key of Object.keys(merged)) collectChanges(first[key], merged[key], pointer(path, key), own(first, key));
      if (Object.keys(first).some((key) => !own(merged, key))) {
        changes.set(path, "overridden");
        totalOverridden++;
      }
    } else if (JSON.stringify(first) !== JSON.stringify(merged)) {
      changes.set(path, "overridden");
      totalOverridden++;
    }
  }
  function workerSource() {
    return [
      "'use strict'; const MAX_DEPTH = " + MAX_DEPTH + "; const MAX_PREVIEW_LINES = " + MAX_PREVIEW_LINES + "; const MAX_PREVIEW_CHARS = " + MAX_PREVIEW_CHARS + ";",
      "const own = " + own + "; const object = " + object + "; const pointer = " + pointer + ";",
      "let changes = new Map(), totalAdded = 0, totalOverridden = 0;",
      parse.toString(),
      mergeValues.toString(),
      collectChanges.toString(),
      previewLines.toString(),
      "onmessage = function(event) { try { const { id, first, second, deep, arrays } = event.data; const base = parse(first); const result = mergeValues(base, parse(second), deep, arrays); collectChanges(base, result); const preview = previewLines(result); postMessage({ id, text: JSON.stringify(result, null, 2), preview, added: totalAdded, overridden: totalOverridden }); } catch(error) { postMessage({ id: event.data.id, error: error.message }); } };"
    ].join("\n");
  }
  function finishMerge(text, preview, added, overridden) {
    resultText = text;
    resultReady = true;
    merging = false;
    totalAdded = added;
    totalOverridden = overridden;
    $("merge").removeAttribute("aria-busy");
    renderResult(preview);
    ["copy", "download", "format-result"].forEach((id) => {
      $(id).disabled = false;
    });
    updateReady();
    announce("Merged successfully. " + totalAdded + " added and " + totalOverridden + " overridden keys or values.");
    $("result-heading").focus();
  }
  function merge() {
    if (merging) return;
    const first = states[0].editor.value, second = states[1].editor.value;
    const large = first.length + second.length >= WORKER_THRESHOLD;
    if (!large || typeof Worker === "undefined") states.forEach(validate);
    if (!states.every((state) => state.valid)) {
      announce("Both inputs must contain valid JSON before merging.");
      return;
    }
    const deep = $("deep").checked, arrays = $("arrays").value;
    if (large && typeof Worker !== "undefined") {
      invalidateResult();
      const id = ++mergeJob;
      merging = true;
      updateReady();
      $("merge").setAttribute("aria-busy", "true");
      announce("Merging JSON\u2026");
      let url;
      try {
        url = URL.createObjectURL(new Blob([workerSource()], { type: "text/javascript" }));
        mergeWorker = new Worker(url);
        mergeWorker.onmessage = (event) => {
          if (event.data.id !== mergeJob) return;
          const data = event.data;
          mergeWorker.terminate();
          mergeWorker = null;
          if (data.error) {
            invalidateResult();
            announce("Unable to merge: " + data.error);
            return;
          }
          lastResult = null;
          finishMerge(data.text, data.preview, data.added, data.overridden);
        };
        mergeWorker.onerror = () => {
          invalidateResult();
          announce("Unable to merge in a background worker. Check browser security settings.");
        };
        mergeWorker.postMessage({ id, first, second, deep, arrays });
      } catch (error) {
        invalidateResult();
        announce("Unable to merge: " + error.message);
      } finally {
        if (url) URL.revokeObjectURL(url);
      }
      return;
    }
    try {
      lastResult = mergeValues(states[0].value, states[1].value, deep, arrays);
      changes = /* @__PURE__ */ new Map();
      totalAdded = totalOverridden = 0;
      collectChanges(states[0].value, lastResult);
      finishMerge(JSON.stringify(lastResult, null, 2), previewLines(lastResult), totalAdded, totalOverridden);
    } catch (error) {
      invalidateResult();
      announce("Unable to merge: " + error.message);
    }
  }
  function previewLines(value) {
    const lines = [];
    let lineCount = 0, charCount = 0, truncated = false;
    function line(text, kind) {
      if (lineCount >= MAX_PREVIEW_LINES || charCount + text.length > MAX_PREVIEW_CHARS) {
        truncated = true;
        return false;
      }
      lines.push({ text, kind });
      lineCount++;
      charCount += text.length;
      return true;
    }
    function walk(value2, path, indent, prefix = "", suffix = "", inherited = "") {
      if (truncated) return;
      const kind = changes.get(path) || inherited, pad = "  ".repeat(indent);
      if (value2 !== null && typeof value2 === "object") {
        const array = Array.isArray(value2), keys = Object.keys(value2), open = array ? "[" : "{", close = array ? "]" : "}";
        if (!keys.length) {
          line(pad + prefix + open + close + suffix, kind);
          return;
        }
        if (!line(pad + prefix + open, kind)) return;
        for (let i = 0; i < keys.length && !truncated; i++) {
          const key = keys[i];
          walk(value2[key], pointer(path, key), indent + 1, array ? "" : JSON.stringify(key) + ": ", i < keys.length - 1 ? "," : "", kind);
        }
        line(pad + close + suffix, kind);
      } else line(pad + prefix + JSON.stringify(value2) + suffix, kind);
    }
    walk(value, "", 0);
    return { lines, truncated, lineCount };
  }
  function renderResult(preview) {
    const { lines, truncated, lineCount } = preview;
    const fragment = document.createDocumentFragment();
    for (const { text, kind } of lines) {
      const item = document.createElement("li"), code = document.createElement("code");
      if (kind) {
        item.className = kind;
        item.setAttribute("aria-label", kind === "added" ? "Added key" : "Overridden value");
      }
      code.textContent = text;
      item.append(code);
      fragment.append(item);
    }
    $("result-lines").replaceChildren(fragment);
    $("result-empty").hidden = true;
    $("result-output").hidden = $("result-legend").hidden = false;
    $("preview-notice").hidden = !truncated;
    $("preview-notice").textContent = truncated ? "Preview limited to " + lineCount.toLocaleString() + " lines / 250,000 characters. Copy and Download include the complete result." : "";
    $("change-count").textContent = totalAdded + " added \xB7 " + totalOverridden + " overridden \xB7 compared with first JSON";
  }
  $("merge").onclick = merge;
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      merge();
    }
  });
  ["deep", "arrays"].forEach((id) => $(id).addEventListener("change", () => {
    invalidateResult();
    announce("Merge options changed. Merge again to update the result.");
  }));
  $("example").onclick = () => {
    const examples = [{ name: "Ana", role: "Designer", settings: { theme: "light", notifications: true }, tags: ["design"] }, { role: "Developer", city: "Chennai", settings: { theme: "dark" }, tags: ["code"] }];
    states.forEach((state, i) => {
      cancelImport(state);
      state.file = null;
      updateFile(state);
      setMethod(state, "paste");
      state.action("edit-url").hidden = true;
      setText(state, JSON.stringify(examples[i], null, 2));
    });
    announce("Example loaded. Select Merge JSON to see what changes.");
  };
  $("clear").onclick = () => {
    states.forEach((state) => {
      cancelImport(state);
      state.file = null;
      updateFile(state);
      setMethod(state, "paste");
      setText(state, "");
      $(state.id + "-url").value = "";
      $(state.id + "-file").value = "";
      state.action("edit-url").hidden = true;
    });
    announce("All JSON inputs and the result cleared.");
    states[0].editor.focus();
  };
  $("swap").onclick = () => {
    const values = states.map((state) => state.editor.value);
    states.forEach((state, i) => {
      cancelImport(state);
      state.file = null;
      updateFile(state);
      setMethod(state, "paste");
      state.action("edit-url").hidden = true;
      setText(state, values[1 - i]);
    });
    announce("First and second JSON swapped. The second JSON now wins conflicts.");
  };
  $("copy").onclick = async () => {
    if (!resultReady) return;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(resultText);
      announce("Merged JSON copied.");
    } catch {
      announce("Clipboard access is unavailable. Select the result and copy it, or use Download .json.");
    }
  };
  $("download").onclick = () => {
    if (!resultReady) return;
    const url = URL.createObjectURL(new Blob([resultText + "\n"], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "merged.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
    announce("Merged JSON downloaded.");
  };
  $("format-result").onclick = () => {
    if (resultReady) {
      announce("Result formatted with two-space indentation.");
    }
  };
  updateReady();
})();
(() => {
  const config = Object.freeze({
    enabled: false,
    publisher: "",
    // Verified ca-pub-… value, never an invented ID.
    slots: { "after-result": "", "before-faq": "" },
    consentAllowed: null
    // Implement using the actual certified CMP, not a checkbox.
  });
  if (!config.enabled || !/^ca-pub-\d{16}$/.test(config.publisher) || typeof config.consentAllowed !== "function" || !("IntersectionObserver" in window)) return;
  const allowed = () => {
    try {
      return config.consentAllowed() === true;
    } catch {
      return false;
    }
  };
  let library = null;
  function loadLibrary() {
    if (!library) library = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + config.publisher;
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        library = null;
        reject(new Error("Ad script unavailable"));
      };
      document.head.append(script);
    });
    return library;
  }
  const nearby = /* @__PURE__ */ new Set(), pending = /* @__PURE__ */ new Set(), rendered = /* @__PURE__ */ new Set();
  async function render(slot) {
    const mount = slot.querySelector(".ad-mount"), placement = mount.dataset.placement;
    if (slot.hidden || !nearby.has(slot) || !allowed() || pending.has(slot) || rendered.has(slot) || !/^\d+$/.test(config.slots[placement])) return;
    pending.add(slot);
    try {
      await loadLibrary();
      if (slot.hidden || !nearby.has(slot) || !allowed()) return;
      const ad = document.createElement("ins");
      ad.className = "adsbygoogle";
      ad.dataset.adClient = config.publisher;
      ad.dataset.adSlot = config.slots[placement];
      ad.dataset.adFormat = "auto";
      ad.dataset.fullWidthResponsive = "true";
      mount.append(ad);
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      rendered.add(slot);
    } catch {
    } finally {
      pending.delete(slot);
    }
  }
  const slots = [...document.querySelectorAll(".ad-slot")];
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) {
      nearby.add(entry.target);
      render(entry.target);
    } else nearby.delete(entry.target);
  }), { rootMargin: "200px" });
  slots.forEach((slot) => {
    observer.observe(slot);
    new MutationObserver(() => render(slot)).observe(slot, { attributes: true, attributeFilter: ["hidden"] });
  });
  window.addEventListener("joinjson:consent-change", () => {
    if (!allowed()) {
      slots.forEach((slot) => {
        slot.querySelector(".ad-mount").replaceChildren();
        rendered.delete(slot);
      });
    } else slots.forEach(render);
  });
})();
