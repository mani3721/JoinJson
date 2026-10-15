/*
  editor-find.js
  JSON-aware "find" logic for the editors. Pure functions, no DOM.

    findMatches(text, query, opts) -> { matches, truncated, error }
    nextIndex(matches, caret, dir) -> index of the next/previous match (wraps around), or -1
    lineColumn(text, pos)          -> { line, column } (1-based)

  opts: {
    scope:         'values' | 'keys' | 'all'   (default 'values')
    caseSensitive: boolean                     (default false)
    wholeWord:     boolean                     (default false)
    regex:         boolean                     (default false)
    maxMatches:    number                      (default 5000)
  }

  Each match: { start, end, type }  where type is 'key' | 'value' | 'other'.
  Positions are offsets in the raw text. String matches are searched inside the quotes,
  on the raw text (so a search for \n matches the two characters backslash and n,
  not a decoded line break; "\u00e9" is not matched by "é").
  The tokenizer is tolerant, so it still works while the JSON is invalid.
*/
(function (root) {
  var WORD = /[\p{L}\p{N}_]/u;

  // Minimal tolerant lexer: strings (key or value), numbers/literals, everything else is punctuation.
  function tokenize(text) {
    var tokens = [], i = 0, n = text.length;
    while (i < n) {
      var c = text[i];
      if (c === '"') {
        var s = i; i++;
        while (i < n) {
          if (text[i] === '\\') { i += 2; continue; }
          if (text[i] === '"') { i++; break; }
          if (text[i] === '\n') break;           // unterminated string: stop at the line end
          i++;
        }
        var e = Math.min(i, n), j = e;
        while (j < n && ' \t\r\n'.indexOf(text[j]) !== -1) j++;
        tokens.push({ type: text[j] === ':' ? 'key' : 'value', start: s, end: e, quoted: true });
      } else if (/[-0-9A-Za-z_.+]/.test(c)) {
        var s2 = i;
        while (i < n && /[-0-9A-Za-z_.+]/.test(text[i])) i++;
        tokens.push({ type: 'value', start: s2, end: i, quoted: false });
      } else {
        i++;
      }
    }
    return tokens;
  }

  function buildRegex(query, o) {
    var flags = 'g' + (o.caseSensitive ? '' : 'i') + 'u';
    var src = o.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(src, flags);
  }

  function isWordAt(text, idx) {
    if (idx < 0 || idx >= text.length) return false;
    var ch = text[idx];
    // Read the complete code point on either side of a word boundary.
    if (ch.charCodeAt(0) >= 0xDC00 && ch.charCodeAt(0) <= 0xDFFF && idx > 0) ch = text[idx - 1] + ch;
    else if (ch.charCodeAt(0) >= 0xD800 && ch.charCodeAt(0) <= 0xDBFF && idx + 1 < text.length) ch += text[idx + 1];
    return WORD.test(ch);
  }

  function findMatches(text, query, opts) {
    var o = opts || {};
    var scope = o.scope || 'values';
    var max = o.maxMatches || 5000;
    var out = { matches: [], truncated: false, error: null };
    if (!query) return out;

    var re;
    try { re = buildRegex(query, o); }
    catch (err) { out.error = 'Invalid pattern: ' + err.message; return out; }

    var tokens = tokenize(text);
    for (var t = 0; t < tokens.length; t++) {
      var tok = tokens[t];
      var kind = tok.type;
      if (scope === 'values' && kind !== 'value') continue;
      if (scope === 'keys' && kind !== 'key') continue;

      var from = tok.quoted ? tok.start + 1 : tok.start;
      var to = tok.quoted && text[tok.end - 1] === '"' && tok.end - 1 > tok.start ? tok.end - 1 : tok.end;
      var slice = text.slice(from, to);
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(slice)) !== null) {
        if (m[0].length === 0) { re.lastIndex += slice.codePointAt(re.lastIndex) > 0xFFFF ? 2 : 1; continue; }     // skip empty regex matches
        var s = from + m.index, e = s + m[0].length;
        if (o.wholeWord && (isWordAt(text, s - 1) && isWordAt(text, s) || isWordAt(text, e) && isWordAt(text, e - 1))) continue;
        out.matches.push({ start: s, end: e, type: kind });
        if (out.matches.length >= max) { out.truncated = true; return out; }
      }
    }
    return out;
  }

  function nextIndex(matches, caret, dir) {
    if (!matches.length) return -1;
    var i;
    if (dir === 'prev') {
      for (i = matches.length - 1; i >= 0; i--) if (matches[i].start < caret) return i;
      return matches.length - 1;                                  // wrap
    }
    for (i = 0; i < matches.length; i++) if (matches[i].start >= caret) return i;
    return 0;                                                     // wrap
  }

  function lineColumn(text, pos) {
    var before = text.slice(0, pos), nl = before.lastIndexOf('\n');
    return { line: before.split('\n').length, column: pos - (nl + 1) + 1 };
  }

  var api = { tokenize: tokenize, findMatches: findMatches, nextIndex: nextIndex, lineColumn: lineColumn };
  if (typeof module !== 'undefined') module.exports = api; else root.EditorFind = api;
})(this);
