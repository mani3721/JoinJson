"""Dependency-free source checks and real execution of article examples."""
import base64
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.tags = []
        self.ids = set()
        self.data = []
        self.blocks = {}
        self.ld = []
        self.current = None
        self.title = ""
        self.in_title = False
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if "id" in attrs:
            assert attrs["id"] not in self.ids, "Duplicate ID"
            self.ids.add(attrs["id"])
        if tag == "title":
            self.in_title = True
        if tag == "code" and "data-test" in attrs:
            self.current = ("code", attrs["data-test"], [])
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.current = ("script", "", [])

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if self.current and tag == self.current[0]:
            kind, key, pieces = self.current
            value = "".join(pieces)
            if kind == "code":
                self.blocks[key] = value
            else:
                self.ld.append(json.loads(value))
            self.current = None

    def handle_data(self, data):
        self.data.append(data)
        if self.in_title:
            self.title += data
        if self.current:
            self.current[2].append(data)


def run(*args, cwd, ok=True):
    process = subprocess.run(args, cwd=cwd, text=True, capture_output=True)
    assert (process.returncode == 0) == ok, process.stdout + process.stderr
    return process


pages = {}
raw = {}
for path in sorted(ROOT.rglob("*.html")):
    text = path.read_text()
    raw[path] = text
    pages[path] = Page(text)
assert len(pages) == 9
all_titles = set()
inline = []
for path, page in pages.items():
    assert len(page.title) < 60 and page.title not in all_titles, path
    all_titles.add(page.title)
    assert sum(tag == "h1" for tag, _ in page.tags) == 1, path
    meta = {a.get("name", a.get("property")): a.get("content") for t, a in page.tags if t == "meta"}
    assert 0 < len(meta["description"]) < 155, path
    for key in ("og:type", "og:title", "og:description", "og:url", "twitter:card", "twitter:title", "twitter:description"):
        assert meta.get(key), (path, key)
    assert any(t == "link" and a.get("rel") == "canonical" for t, a in page.tags), path
    assert sum(t == "header" for t, _ in page.tags) == 1
    assert sum(t == "footer" for t, _ in page.tags) == 1
    for tag, attrs in page.tags:
        for key in ("href", "src"):
            link = attrs.get(key)
            if not link or link.startswith("mailto:"):
                continue
            if link.startswith("https://joinjson.com"):
                link = link[len("https://joinjson.com"):]
            if link in ('https://adssettings.google.com/', 'https://policies.google.com/technologies/ads'):
                continue
            assert not link.startswith(("https:", "http:", "//")), link
            parts = urlsplit(link)
            target = path if not parts.path else ROOT / unquote(parts.path).lstrip("/")
            if target.is_dir():
                target /= "index.html"
            assert target.is_file(), (path, link)
            if parts.fragment:
                assert target in pages and parts.fragment in pages[target].ids, (path, link)
        if tag == "label" and "for" in attrs:
            assert attrs["for"] in page.ids, (path, attrs)
        for attr in ("aria-controls", "aria-labelledby", "aria-describedby"):
            if attr in attrs:
                assert all(v in page.ids for v in attrs[attr].split()), (path, attrs)
    for match in re.finditer(r'<script(?: type="application/ld\+json"| data-theme-init)>(.*?)</script>', raw[path], re.S):
        inline.append(base64.b64encode(hashlib.sha256(match[1].encode()).digest()).decode())
    if path.parent != ROOT and path.parent.name not in ("about", "privacy", "terms", "contact"):
        # Count visible article prose, excluding code, header/footer and metadata.
        main = raw[path].split('<main ', 1)[1].split('</main>', 1)[0]
        prose = re.sub(r'<pre>.*?</pre>', '', main, flags=re.S)
        words = len(re.sub(r'<[^>]+>', ' ', prose).split())
        assert words >= 800, (path, words)
        assert any(v['@type'] == 'BreadcrumbList' for v in page.ld), path
        print(f"PASS article {path.parent.name}: {words} prose words")

home = pages[ROOT / 'index.html']
faq = next(v for v in home.ld if v['@type'] == 'FAQPage')
for entry in faq['mainEntity']:
    assert entry['name'] in ''.join(home.data)
    assert entry['acceptedAnswer']['text'] in ''.join(home.data)
assert len(faq['mainEntity']) == 7
assert any(v['@type'] == 'WebApplication' for v in home.ld)
js = '\n'.join((ROOT / 'assets' / name).read_text() for name in ('tool.js', 'compare.js', 'compare-ui.js', 'flow.js', 'examples-share.js', 'examples-share-ui.js'))
assert {'merge-tab', 'compare-tab', 'merge-panel', 'compare-panel'} <= home.ids
assert all('compare-' + suffix in home.ids for suffix in ('matrix', 'side', 'summary', 'export', 'side-toggle', 'prev', 'next', 'page', 'status', 'filter', 'search', 'sort', 'hide-same'))
referenced = set(re.findall(r"\$\('([^']+)'\)", js)) | {'theme', 'first', 'second', 'first-file', 'second-file', 'copy', 'download', 'csv', 'format', 'clear-data'}
assert referenced <= home.ids, referenced - home.ids
for forbidden in ('fetch(', 'XMLHttpRequest', 'sendBeacon', 'localStorage', 'sessionStorage', 'WebSocket'):
    assert forbidden not in js, forbidden

headers_path = ROOT / '_headers'
headers = headers_path.read_text()
hashes = ["'sha256-" + v + "'" for v in inline]
if '--update-csp' in sys.argv:
    hashes = list(dict.fromkeys(hashes))
    headers = re.sub(r"script-src-elem[^;]+;", "script-src-elem 'self' " + ' '.join(hashes) + ';', headers)
    headers = re.sub(r"script-src (?!elem)[^;]+;", "script-src 'self' " + ' '.join(hashes) + ';', headers)
    headers_path.write_text(headers)
assert all(v in headers for v in hashes), 'Run --update-csp after changing JSON-LD'
assert 'REPLACE_' not in headers
for asset in ('theme.js','consent.js','ads.js'):
    source=(ROOT/'assets'/asset).read_text()
    ids=set(re.findall(r"getElementById\('([^']+)'\)",source))
    assert all(ids <= page.ids for page in pages.values()), (asset,ids)
    for forbidden in ('fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket'):
        assert forbidden not in source
assert 'enabled:false' in (ROOT/'assets/consent.js').read_text()
assert all('data-ad-placeholder' not in raw[p] for p in pages if p.parent.name in ('privacy','terms','contact','about') or p in (ROOT/'404.html',ROOT/'index.html'))
assert "connect-src 'self'" in headers
ai_source = (ROOT / 'assets/ai-assistant.js').read_text()
assert "'https://api.cohere.ai/compatibility/v1/chat/completions'" in ai_source
assert "'/api/ai/chat'" not in ai_source
assert "connect-src 'self' https:;" in headers, 'URL imports require HTTPS source connections'
assert '/assets/json-url.js' in raw[ROOT / 'index.html']
assert '/assets/json-url.css' in raw[ROOT / 'index.html']
assert 'localStorage' not in ai_source and 'innerHTML' not in ai_source

ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
sitemap = ET.fromstring((ROOT / 'sitemap.xml').read_text())
locations = {n.text for n in sitemap.findall('s:url/s:loc', ns)}
expected = {'https://joinjson.com/' + (str(p.parent.relative_to(ROOT)) + '/' if p.parent != ROOT else '') for p in pages if p.name != '404.html'}
assert locations == expected
assert all(n.text == '2026-10-14' for n in sitemap.findall('s:url/s:lastmod', ns))
assert 'Sitemap: https://joinjson.com/sitemap.xml' in (ROOT / 'robots.txt').read_text()
print('PASS nine pages: links, fragments, IDs, metadata, FAQ/schema, CSP, sitemap, no network/storage APIs')

blocks = {}
for page in pages.values():
    blocks.update(page.blocks)
with tempfile.TemporaryDirectory() as tmp:
    work = Path(tmp)
    for label, filename in [('python-cli', 'merge_json.py'), ('python-join', 'join_by_id.py'), ('python-deep', 'deep_merge.py')]:
        (work / filename).write_text(blocks[label])
    for key in ('python-shell', 'join-shell', 'deep-shell'):
        run('sh', '-eu', '-c', blocks[key], cwd=tmp)
    assert json.loads((work / 'combined.json').read_text()) == [{'id': 1}, {'id': 2}]
    assert json.loads((work / 'settings.json').read_text()) == {'region': 'west', 'enabled': True}
    (work / 'bad.json').write_text('{"a":}')
    run(sys.executable, 'merge_json.py', 'objects', 'out.json', 'base.json', 'bad.json', cwd=tmp, ok=False)
    assert not (work / 'out.json').exists()
    run(sys.executable, 'merge_json.py', 'lists', 'out.json', 'first.json', 'base.json', cwd=tmp, ok=False)
    run(sys.executable, 'merge_json.py', 'lists', 'first.json', 'first.json', 'second.json', cwd=tmp, ok=False)
    assert json.loads((work / 'first.json').read_text()) == [{'id': 1}]
print('PASS all three Python examples and all three shell blocks; CLI invalid JSON, wrong shape, overwrite guard')
