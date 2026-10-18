(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('ai-form')) return;
  // The same-origin backend reads credentials and model settings from .env.
  const AI_CHAT_URL = '/api/ai/chat';
  let controller = null, generation = 0, history = [];
  const messages = $('ai-messages');
  function scrollChat() { messages.scrollTop = messages.scrollHeight; }
  // Build Markdown with DOM nodes, never interpret provider output as HTML.
  function inlineMarkdown(parent, text) {
    const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|\[[^\]\n]+\]\([^\s)]+\))/g;
    let start = 0;
    for (const match of text.matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(start, match.index)));
      const value = match[0];
      let node;
      if (value[0] === '`') {
        node = document.createElement('code'); node.textContent = value.slice(1, -1);
      } else if (value[0] === '[') {
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(value);
        try {
          const url = new URL(link[2], window.location.href);
          if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error('Unsafe link');
          node = document.createElement('a'); node.href = url.href;
          node.rel = 'noopener noreferrer'; node.target = '_blank';
          node.textContent = link[1];
        } catch (_) { node = document.createTextNode(value); }
      } else {
        const strong = value.startsWith('**') || value.startsWith('__');
        node = document.createElement(strong ? 'strong' : 'em');
        inlineMarkdown(node, value.slice(strong ? 2 : 1, strong ? -2 : -1));
      }
      parent.append(node); start = match.index + value.length;
    }
    parent.append(document.createTextNode(text.slice(start)));
  }
  function renderMarkdown(container, text) {
    const fragment = document.createDocumentFragment();
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
    const divider = line => line && line.includes('|') && cells(line).every(cell => /^:?-{3,}:?$/.test(cell));
    const blockStart = i => /^\s*$|^\s*(`{3,}|~{3,})|^#{1,6}\s|^\s*(?:[-+*]|\d+\.)\s+|^>\s?/.test(lines[i]) || divider(lines[i + 1]);
    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        const pre = document.createElement('pre'), code = document.createElement('code');
        const language = fence[2].trim();
        if (/^[\w+-]+$/.test(language)) code.className = 'language-' + language;
        const body = []; i++;
        while (i < lines.length && !(new RegExp('^\\s*' + fence[1][0] + '{' + fence[1].length + ',}\\s*$')).test(lines[i])) body.push(lines[i++]);
        if (i < lines.length) i++;
        code.textContent = body.join('\n'); pre.tabIndex = 0; pre.append(code); fragment.append(pre); continue;
      }
      if (line.includes('|') && divider(lines[i + 1])) {
        const wrapper = document.createElement('div'), table = document.createElement('table');
        wrapper.className = 'ai-table-scroll'; wrapper.tabIndex = 0;
        wrapper.setAttribute('role', 'region'); wrapper.setAttribute('aria-label', 'Response table');
        const head = document.createElement('thead'), row = document.createElement('tr');
        const headers = cells(line);
        headers.forEach(value => { const cell = document.createElement('th'); cell.scope = 'col'; inlineMarkdown(cell, value); row.append(cell); });
        head.append(row); table.append(head); i += 2;
        const body = document.createElement('tbody');
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
          const row = document.createElement('tr'), values = cells(lines[i++]);
          headers.forEach((_, index) => { const cell = document.createElement('td'); inlineMarkdown(cell, values[index] || ''); row.append(cell); });
          body.append(row);
        }
        table.append(body); wrapper.append(table); fragment.append(wrapper); continue;
      }
      const heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading) { const node = document.createElement('h' + heading[1].length); inlineMarkdown(node, heading[2]); fragment.append(node); i++; continue; }
      const list = /^\s*([-+*]|\d+\.)\s+(.*)$/.exec(line);
      if (list) {
        const ordered = /\d/.test(list[1]), node = document.createElement(ordered ? 'ol' : 'ul');
        if (ordered) node.start = parseInt(list[1], 10);
        while (i < lines.length) {
          const item = /^\s*([-+*]|\d+\.)\s+(.*)$/.exec(lines[i]);
          if (!item || /\d/.test(item[1]) !== ordered) break;
          const li = document.createElement('li'); inlineMarkdown(li, item[2]); node.append(li); i++;
        }
        fragment.append(node); continue;
      }
      if (/^>\s?/.test(line)) { const quote = document.createElement('blockquote'); inlineMarkdown(quote, line.replace(/^>\s?/, '')); fragment.append(quote); i++; continue; }
      const paragraph = document.createElement('p'), body = [lines[i++]];
      while (i < lines.length && !blockStart(i)) body.push(lines[i++]);
      inlineMarkdown(paragraph, body.join('\n')); fragment.append(paragraph);
    }
    container.replaceChildren(fragment);
  }
  function addMessage(role, text) {
    $('ai-empty').hidden = true;
    const article = document.createElement('article');
    article.className = 'ai-message ai-message-' + role;
    const label = document.createElement('span');
    label.className = 'ai-message-label'; label.textContent = role === 'user' ? 'You' : 'AI';
    const content = document.createElement(role === 'assistant' ? 'div' : 'pre');
    content.className = role === 'assistant' ? 'ai-markdown' : 'ai-user-text';
    content.markdownSource = text;
    content.textContent = text; content.tabIndex = 0;
    article.append(label, content); messages.append(article); scrollChat();
    return content;
  }
  const panel = $('ai-assistant'), toggle = $('ai-toggle');
  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      ($('ai-prompt').disabled ? $('ai-close') : $('ai-prompt')).focus({ preventScroll: true });
    } else if (panel.contains(document.activeElement)) {
      toggle.focus({ preventScroll: true });
    }
  }
  toggle.hidden = false;
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  $('ai-close').addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden && (panel.contains(event.target) || event.target === toggle)) {
      event.preventDefault();
      setOpen(false);
    }
  });
  function busy(value) {
    $('ai-form').dataset.busy = String(value);
    $('ai-send').disabled = value; $('ai-send').hidden = value;
    $('ai-stop').disabled = !value; $('ai-stop').hidden = !value;
    $('ai-prompt').disabled = value;
    $('ai-copy').disabled = value || !$('ai-response')?.textContent;
  }
  busy(false);
  function clear() {
    generation++; if (controller) controller.abort(); controller = null;
    messages.querySelectorAll('.ai-message').forEach(message => message.remove());
    history = []; $('ai-prompt').value = ''; $('ai-empty').hidden = false;
    busy(false); $('ai-status').textContent = '';
    if (!panel.hidden) $('ai-prompt').focus({ preventScroll: true });
  }
  $('ai-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (controller) return;
    const prompt = $('ai-prompt').value.trim();
    if (!prompt || prompt.length > 8000) { $('ai-status').textContent = 'Enter a message of up to 8,000 characters.'; return; }
    // Only typed chat messages are sent; workspace JSON is never attached.
    const turns = [...history, { role: 'user', content: prompt }];
    const body = JSON.stringify({ messages: turns });
    if (new TextEncoder().encode(body).length > 65536) { $('ai-status').textContent = 'Chat too long. Start a new chat or shorten your message.'; return; }
    const token = ++generation, request = new AbortController(); controller = request;
    const previous = $('ai-response'); if (previous) previous.removeAttribute('id');
    addMessage('user', prompt);
    const reply = addMessage('assistant', ''); reply.id = 'ai-response';
    $('ai-prompt').value = ''; $('ai-status').textContent = 'Thinking…'; busy(true);
    const timer = setTimeout(() => request.abort(), 90000);
    try {
      const response = await fetch(AI_CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body, signal: request.signal, credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer' });
      if (!response.ok) {
        const errors = { 401: 'Sign in to use AI Help.', 403: 'AI access denied. Check the server origin and access settings.', 404: 'AI backend not found. Run npm start and open the server URL.', 413: 'Chat too long. Start a new chat.', 429: 'Too many AI requests. Wait a minute and retry.', 503: 'AI is not configured or temporarily unavailable.' };
        throw new Error(errors[response.status] || 'AI request failed. Please retry later.');
      }
      if (!(response.headers.get('content-type') || '').includes('text/event-stream')) throw new Error('AI server did not return a streaming response.');
      await window.JMAIStream.read(response.body, text => {
        if (token !== generation) return;
        reply.markdownSource += text; renderMarkdown(reply, reply.markdownSource); $('ai-status').textContent = 'Replying…'; scrollChat();
      });
      if (token === generation) { history = [...turns, { role: 'assistant', content: reply.markdownSource }]; $('ai-status').textContent = ''; }
    } catch (error) {
      if (token === generation) $('ai-status').textContent = error.name === 'AbortError' ? 'Stopped. Reply may be incomplete.' : error.name === 'TypeError' ? 'Cannot reach the AI server. Check your connection and make sure the backend is running.' : error.message;
    } finally {
      clearTimeout(timer);
      if (token === generation) { controller = null; busy(false); if (!panel.hidden) $('ai-prompt').focus({ preventScroll: true }); }
    }
  });
  $('ai-stop').addEventListener('click', () => { if (controller) controller.abort(); });
  $('ai-clear').addEventListener('click', clear);
  ($('clear-data') || $('clear'))?.addEventListener('click', clear);
  $('ai-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('ai-response').markdownSource); $('ai-status').textContent = 'Response copied.'; }
    catch (_) { $('ai-status').textContent = 'Clipboard blocked. Select the response and copy manually.'; }
  });
}());
