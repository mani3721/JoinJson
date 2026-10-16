import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const { convert, jsonToPython, MAX_LENGTH } = require('../assets/json-to-python.js');
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const pythonCommand = process.env.PYTHON || 'python3';
const hasPydanticV2 = spawnSync(pythonCommand, ['-c', 'import pydantic; assert pydantic.__version__.split(".")[0] == "2"']).status === 0;
function python(code, execute = false) {
  const script = 'import ast, sys\ncode = sys.stdin.read()\nast.parse(code)\n' + (execute ? 'exec(compile(code, "generated.py", "exec"), globals())\nfrom typing import get_type_hints\nfor model in list(globals().values()):\n    if isinstance(model, type) and model.__module__ == "__main__":\n        get_type_hints(model)\n' : '');
  const result = spawnSync(pythonCommand, ['-c', script], { input: code, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
test('Python inference covers nested models, primitives, arrays, nullable values and reuse', () => {
  const text = JSON.stringify({ name: 'Ana', age: 2, price: 1.5, active: true, none: null, profile: { city: 'A' }, other: { city: 'B' }, items: [1, 'a', null], empty: [], nested: [[true]] });
  const code = convert(text);
  for (const fragment of ['from pydantic import BaseModel', 'class Profile(BaseModel):', 'class Root(BaseModel):', 'name: str', 'age: int', 'price: float', 'active: bool', 'none: Optional[Any] = None', 'other: Profile', 'items: list[Optional[Union[int, str]]]', 'empty: list[Any]', 'nested: list[list[bool]]']) assert.ok(code.includes(fragment), fragment);
  python(code);
  for (const framework of ['dataclass', 'pydantic']) for (const value of ['{}', '[]', 'null', 'true', '3.14', '"text"', '[{"a":1},{"b":true}]']) {
    const result = convert(value, { framework });
    python(result, framework === 'dataclass');
    if (value !== '{}') assert.match(result, /    value:/);
  }
});
test('safe field names, aliases, collisions, empty classes and Optional defaults compile', () => {
  const sample = { 'class': 1, 'a-b': 'x', a_b: true, '1x': null, '': 1, 'quote"\\\n': 'x', schema: 2, model_dump: 3, '__proto__': null, child: {}, root: { id: 1 }, int: 2, list: [1] };
  for (const optional of [false, true]) for (const framework of ['dataclass', 'pydantic']) {
    const code = jsonToPython(sample, { framework, optional });
    python(code, framework === 'dataclass');
    assert.match(code, /field_class:/);
    assert.match(code, /a_b2:/);
    assert.match(code, /class Root2/);
    if (framework === 'pydantic') assert.match(code, /alias="a-b"/);
    else assert.match(code, /metadata=\{"json_key": "a-b"\}/);
    if (optional) assert.match(code, /Optional\[int\].*= None/);
  }
});
test('null-only fields are flexible without weakening known nullable types', () => {
  const sample = { joined: null, 'joined-at': null, profile: { joined: null }, name: 'Ana', dates: [null, '2026-01-01'] };
  for (const optional of [false, true]) for (const framework of ['pydantic', 'dataclass']) {
    const code = jsonToPython(sample, { framework, optional });
    assert.match(code, /from typing import Any, Optional/);
    assert.match(code, /joined: Optional\[Any\]/);
    assert.doesNotMatch(code, /: None\b/);
    if (framework === 'pydantic') {
      assert.match(code, /joined: Optional\[Any\] = None/);
      assert.match(code, /joined_at: Optional\[Any\] = Field\(default=None, alias="joined-at"\)/);
    }
    assert.match(code, /dates: (?:Optional\[)?list\[Optional\[str\]\]/);
    python(code, framework === 'dataclass');
  }
  assert.match(convert('null'), /value: Optional\[Any\] = None/);
});
test('Pydantic V2 accepts omitted, null and future non-null values for null-only fields', { skip: !hasPydanticV2 && 'Python with Pydantic V2 is required (set PYTHON)' }, () => {
  for (const optional of [false, true]) {
    const code = jsonToPython({ joined: null, 'joined-at': null, profile: { joined: null }, name: 'Ana' }, { optional });
    python(code + '\n' + [
      'for value in [None, "2026-01-01", 42, True, {"date": "2026-01-01"}, ["2026-01-01"]]:',
      '    model = Root.model_validate({"joined": value, "joined-at": value, "profile": {"joined": value}, "name": "Ana"})',
      '    assert model.joined == value',
      '    assert model.joined_at == value',
      '    assert model.profile.joined == value',
      'model = Root.model_validate({"name": "Ana", "profile": {}})',
      'assert model.joined is None and model.joined_at is None and model.profile.joined is None'
    ].join('\n'), true);
  }
  python(convert('null') + '\nassert Root().value is None\nassert Root(value="2026-01-01").value == "2026-01-01"\n', true);
});
test('invalid, excessive and non-finite JSON fail safely', () => {
  assert.throws(() => convert('{bad'), SyntaxError);
  assert.throws(() => convert(' '.repeat(MAX_LENGTH + 1)), /1 MB/);
  assert.throws(() => convert('['.repeat(102) + '0' + ']'.repeat(102)), /nested/);
  assert.throws(() => convert('1e400'), /finite/);
});
function app(t, path = '/json-to-python', merger = false) {
  const dom = new JSDOM(read('index.html'), { url: 'https://www.joinjson.com' + path, runScripts: merger ? 'dangerously' : 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  for (const file of ['json-error-helper.js', 'json-to-zod.js', 'json-to-zod-ui.js', 'json-to-python.js', 'json-to-python-ui.js']) dom.window.eval(read('assets/' + file));
  return dom.window;
}
test('direct visits, legacy links, title, live events, options, errors and clear', async t => {
  for (const path of ['/json-to-python', '/json-to-python/', '/?tool=json-to-python']) {
    const w = app(t, path), d = w.document, get = id => d.getElementById('python-' + id);
    assert.equal(w.location.pathname, '/json-to-python');
    assert.equal(d.title, 'JSON to Python Pydantic Model Converter | JoinJSON');
    assert.equal(d.getElementById('python-converter-tool').hidden, false);
    get('example').click(); assert.match(get('output').value, /class Root\(BaseModel\)/);
    get('dataclass').click(); get('optional').click();
    assert.match(get('output').value, /@dataclass/); assert.match(get('output').value, /Optional\[int\] = None/);
    for (const event of ['input', 'keyup', 'paste']) {
      get('json-input').value = '{"n":2}'; get('json-input').dispatchEvent(new w.Event(event));
      assert.equal(get('output').value, '');
      await wait(210); assert.match(get('output').value, /n: Optional\[int\]/);
    }
    get('json-input').value = '{\n"n":\n}'; get('json-input').dispatchEvent(new w.Event('change'));
    assert.match(get('input-status').textContent, /line 3/); assert.equal(get('copy').disabled, true);
    assert.equal(get('json-input').getAttribute('aria-invalid'), 'true');
    get('clear').click(); assert.equal(get('output').value, ''); assert.equal(get('json-input').value, '');
    assert.equal(get('json-input').getAttribute('aria-invalid'), 'false');
  }
});
test('copy, failure feedback, download and URL revocation', async t => {
  const w = app(t), get = id => w.document.getElementById('python-' + id);
  let copied, filename, blob, revoked;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
  w.URL.createObjectURL = value => { blob = value; return 'blob:python'; };
  w.URL.revokeObjectURL = value => { revoked = value; };
  w.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  get('example').click(); get('copy').click(); await wait(0); assert.equal(copied, get('output').value);
  w.navigator.clipboard.writeText = async () => { throw Error('denied'); };
  get('copy').click(); await wait(0); assert.match(get('action-status').textContent, /unavailable/);
  get('download').click(); assert.equal(filename, 'models.py'); assert.match(blob.type, /python/);
  await wait(1050); assert.equal(revoked, 'blob:python');
});
test('merger transfers complete output in memory and invalidation disables Python action', t => {
  const w = app(t, '/', true), d = w.document, button = d.getElementById('merge-python');
  assert.equal(button.disabled, true);
  d.getElementById('example').click(); d.getElementById('merge').click();
  assert.equal(button.disabled, false); button.click();
  assert.equal(w.location.pathname, '/json-to-python'); assert.equal(w.location.search, '');
  assert.equal(JSON.parse(d.getElementById('python-json-input').value).role, 'Developer');
  assert.match(d.getElementById('python-output').value, /class Root/);
  d.querySelector('[data-tool="merge"]').click();
  d.getElementById('first').value = '{'; d.getElementById('first').dispatchEvent(new w.Event('input'));
  assert.equal(button.disabled, true);
  d.querySelector('[data-tool="json-to-python"]').click();
  assert.match(d.getElementById('python-output').value, /class Root/);
});
test('conversion scripts have no network or persistence dependencies', () => {
  for (const file of ['assets/json-to-python.js', 'assets/json-to-python-ui.js']) assert.doesNotMatch(read(file), /\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage)\b/);
});
