/* Shell text is parsed, never executed. No HTTP requests are sent. */
(function (root) {
  'use strict';
  const quote = value => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  function tokenize(source) {
    const tokens = [];
    let value = '', mode = '', started = false;
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (char === '\\' && mode !== "'") {
        if (i + 1 === source.length) throw new Error('Incomplete escape at the end of the command.');
        const next = source[++i];
        if (next === '\n') continue;
        if (next === '\r' && source[i + 1] === '\n') { i++; continue; }
        if (mode === '"' && !['"', '\\', '$', '`'].includes(next)) value += '\\';
        value += next; started = true;
      } else if (mode) {
        if (char === mode) mode = '';
        else {
          if (mode === '"' && (char === '$' || char === '`')) throw new Error('Shell expansion is not supported. Use literal values in single quotes.');
          value += char;
        }
      } else if (char === "'" || char === '"') { mode = char; started = true; }
      else if (/\s/.test(char)) {
        if (started) { tokens.push(value); value = ''; started = false; }
      } else {
        if (/[|;&<>`$]/.test(char)) throw new Error('Shell operators and expansion are not supported. Paste one literal cURL command.');
        value += char; started = true;
      }
    }
    if (mode) throw new Error('Unclosed quote in cURL command.');
    if (started) tokens.push(value);
    return tokens;
  }
  function parse(source) {
    if (typeof source !== 'string' || source.length > 1000000) throw new Error('Use a cURL command smaller than 1 MB.');
    const tokens = tokenize(source.trim());
    if (!/^curl(?:\.exe)?$/i.test(tokens.shift() || '')) throw new Error('Start the command with curl.');
    let url, method, auth, head = false, get = false;
    const headers = Object.create(null), parts = [];
    const ignored = new Set(['--compressed', '--silent', '-s', '--show-error', '-S', '--location', '-L', '--globoff', '-g', '--fail', '-f', '--include', '-i']);
    const valueFlags = new Set(['-X', '--request', '-H', '--header', '-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '-u', '--user', '--url']);
    for (let i = 0; i < tokens.length; i++) {
      let flag = tokens[i], value;
      if (flag === '--head' || flag === '-I') { head = true; continue; }
      if (flag === '--get' || flag === '-G') { get = true; continue; }
      if (ignored.has(flag)) continue;
      if (flag.startsWith('--') && flag.includes('=')) {
        const index = flag.indexOf('='); value = flag.slice(index + 1); flag = flag.slice(0, index);
      } else if (/^-[XHdu].+/.test(flag)) { value = flag.slice(2); flag = flag.slice(0, 2); }
      if (valueFlags.has(flag)) {
        if (value === undefined) value = tokens[++i];
        if (value === undefined) throw new Error('Missing value for ' + flag + '.');
        if (flag === '-X' || flag === '--request') method = value.toUpperCase();
        else if (flag === '--url') { if (url) throw new Error('Only one request URL is supported.'); url = value; }
        else if (flag === '-u' || flag === '--user') {
          if (!value.includes(':')) throw new Error('Basic Auth needs an explicit username:password; interactive prompts are not supported.');
          auth = value;
        } else if (flag === '-H' || flag === '--header') {
          const index = value.indexOf(':');
          if (index < 1 || /[\r\n]/.test(value)) throw new Error('Headers must use Name: value without line breaks.');
          const name = value.slice(0, index).trim().toLowerCase();
          if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name)) throw new Error('Invalid HTTP header name.');
          const content = value.slice(index + 1).trim();
          headers[name] = Object.hasOwn(headers, name) ? headers[name] + ', ' + content : content;
        } else {
          if (value.startsWith('@') && flag !== '--data-raw') throw new Error('Local file and stdin references cannot be read. Paste the literal body with --data-raw instead.');
          parts.push(value);
        }
      } else if (flag.startsWith('-')) throw new Error('Unsupported cURL option: ' + flag + '. Remove it rather than silently changing request behavior.');
      else { if (url) throw new Error('Only one request URL is supported.'); url = flag; }
    }
    if (!url) throw new Error('Add an HTTP or HTTPS request URL.');
    let parsed;
    try { parsed = new URL(url); } catch (_) { throw new Error('Use a complete HTTP or HTTPS URL.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use HTTP(S) URLs without embedded credentials; use --user for Basic Auth.');
    if (method && !/^[!#$%&'*+.^_`|~0-9A-Z-]+$/.test(method)) throw new Error('Invalid HTTP method.');
    let body = parts.length ? parts.join('&') : undefined;
    if (get && body !== undefined) { const hash = url.indexOf('#'), suffix = hash < 0 ? '' : url.slice(hash); url = hash < 0 ? url : url.slice(0, hash); url += (url.includes('?') ? '&' : '?') + body + suffix; body = undefined; }
    method = method || (head ? 'HEAD' : get ? 'GET' : body !== undefined ? 'POST' : 'GET');
    if (head && body !== undefined) throw new Error('HEAD with a body cannot be represented safely.');
    if (body !== undefined && !Object.hasOwn(headers, 'content-type')) headers['content-type'] = 'application/x-www-form-urlencoded';
    if (auth && !Object.hasOwn(headers, 'authorization')) {
      if (/[^\x00-\x7f]/.test(auth)) throw new Error('Basic Auth currently supports ASCII credentials only.');
      headers.authorization = 'Basic ' + (typeof btoa === 'function' ? btoa(auth) : Buffer.from(auth, 'ascii').toString('base64'));
    }
    return { url, method, headers, body };
  }
  function generate(request, target = 'fetch') {
    if (!['fetch', 'axios'].includes(target)) throw new Error('Choose Fetch or Axios.');
    const { url, method, headers, body } = request;
    if (target === 'fetch' && body !== undefined && ['GET', 'HEAD'].includes(method)) throw new Error('Fetch does not allow a GET/HEAD body. Use Axios, --get, or change the method.');
    const config = { method, headers };
    if (body !== undefined) config.body = body;
    let call;
    if (target === 'fetch') {
      call = 'const response = await fetch(' + quote(url) + ', ' + JSON.stringify(config, null, 2) + ');\n' +
        'if (!response.ok) {\n  throw new Error(`HTTP ${response.status}: ${response.statusText}`);\n}\n' +
        'const contentType = response.headers.get("content-type") || "";\n' +
        'const data = response.status === 204 || response.status === 205 || ' + quote(method) + ' === "HEAD"\n  ? null\n  : contentType.includes("json") ? await response.json() : await response.text();\nconsole.log(data);';
    } else {
      const options = { headers };
      if (body !== undefined) options.transformRequest = ['__RAW_BODY__'];
      const stringify = object => JSON.stringify(object, null, 2).replace(/"transformRequest": \[\s*"__RAW_BODY__"\s*\]/, '"transformRequest": [(data) => data]');
      const lower = method.toLowerCase();
      if (['post', 'put', 'patch'].includes(lower)) call = 'const response = await axios.' + lower + '(' + quote(url) + ', ' + (body === undefined ? 'undefined' : quote(body)) + ', ' + stringify(options) + ');';
      else if (['get', 'head', 'options', 'delete'].includes(lower)) {
        if (body !== undefined) options.data = body;
        call = 'const response = await axios.' + lower + '(' + quote(url) + ', ' + stringify(options) + ');';
      } else call = 'const response = await axios.request(' + stringify({ url, method, ...options, ...(body === undefined ? {} : { data: body }) }) + ');';
      call += '\nconsole.log(response.data);';
    }
    return (target === 'axios' ? '// Install Axios first: npm install axios\nimport axios from "axios";\n\n' : '') +
      '// Review credentials and browser CORS/header restrictions before running.\nasync function sendRequest() {\n  try {\n' +
      call.split('\n').map(line => '    ' + line).join('\n') + '\n  } catch (error) {\n    console.error("Request failed:", error);\n  }\n}\n\n// Run explicitly when ready:\n// sendRequest();\n';
  }
  function extractJSON(request) {
    if (request.body === undefined) return null;
    try { return JSON.stringify(JSON.parse(request.body), null, 2); } catch (_) { return null; }
  }
  const api = { tokenize, parse, generate, extractJSON };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CurlToJS = api;
}(typeof globalThis === 'object' ? globalThis : this));
