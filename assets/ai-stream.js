/* Shared streaming parser; never interprets model output as HTML. */
(function (root) {
  'use strict';
  async function read(stream, onText) {
    if (!stream) throw new Error('Streaming is unavailable.');
    const reader = stream.getReader(), decoder = new TextDecoder();
    let buffer = '', complete = false, received = false, size = 0;
    function event(block) {
      const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data) return;
      if (data.trim() === '[DONE]') { complete = true; return; }
      let value;
      try { value = JSON.parse(data); } catch (_) { throw new Error('Invalid AI stream.'); }
      if (value.error) throw new Error('The AI provider could not complete the response.');
      const text = value.choices && value.choices[0] && value.choices[0].delta && value.choices[0].delta.content;
      if (typeof text === 'string' && text) { received = true; onText(text); }
    }
    try {
      while (!complete) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
        size += chunk.value ? chunk.value.byteLength : 0;
        if (size > 1000000) throw new Error('AI response exceeded the size limit.');
        buffer = buffer.replace(/\r\n/g, '\n');
        let end;
        while (!complete && (end = buffer.indexOf('\n\n')) !== -1) {
          event(buffer.slice(0, end)); buffer = buffer.slice(end + 2);
        }
        if (chunk.done) { if (buffer.trim() && !complete) event(buffer); break; }
      }
      if (!complete) throw new Error('AI response was interrupted. Please retry.');
      if (!received) throw new Error('The AI provider returned an empty response.');
    } finally { try { await reader.cancel(); } catch (_) {} reader.releaseLock(); }
  }
  const api = { read };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JMAIStream = api;
}(typeof window === 'object' ? window : globalThis));
