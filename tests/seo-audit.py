"""Offline SEO audit of publishable pages (standard library only).
Run: python3 tests/seo-audit.py [--directory public]
Build output includes server-rendered metadata for the existing SPA tool routes.
"""
import argparse
from datetime import date, datetime
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://www.joinjson.com'
GUIDES = ['merge-json-files-python', 'merge-json-arrays-by-id', 'deep-merge-vs-shallow-merge-json']
SOURCE = ['index.html', 'curl-to-js.html', '404.html'] + [x + '/index.html' for x in GUIDES + ['about', 'contact', 'privacy', 'terms', 'disclaimer']]
TOOLS = list(json.loads((ROOT / 'scripts/seo-pages.json').read_text()))[1:]
errors = []
def check(condition, message):
    if not condition: errors.append(message)
def normalized(value): return ' '.join(value.split())

# HTMLParser intentionally recovers malformed attributes. This strict lexical pass
# rejects recovery cases such as content="a "quote"", including extra bare attrs.
ATTRIBUTE = re.compile(r'''\s+([^\s=<>/"']+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s<>"'=\x60]+))?''')
BOOLEAN = set('allowfullscreen async autofocus autoplay checked controls default defer disabled formnovalidate hidden inert ismap itemscope loop multiple muted nomodule novalidate open playsinline readonly required reversed selected'.split())
ENTITY = re.compile(r'&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);')
def encoding_errors(text):
    found = []
    if re.search(r'&amp;(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);', text, re.I): found.append('double-encoded entity')
    clean = re.sub(r'<(script|style)\b[^>]*>[\s\S]*?</\1\s*>', '', text, flags=re.I)
    clean = re.sub(r'<!--[\s\S]*?-->', '', clean)
    tag_pattern = re.compile(r'''</?[a-zA-Z][\w:-]*(?:[^>"']|"[^"]*"|'[^']*')*>''')
    for match in tag_pattern.finditer(clean):
        tag = match[0]
        if tag.startswith('</'): continue
        name = re.match(r'<[\w:-]+', tag).end()
        end = len(tag) - (2 if tag.endswith('/>') else 1)
        pos, names = name, set()
        while pos < end:
            if not tag[pos:end].strip(): break
            attribute = ATTRIBUTE.match(tag, pos)
            if not attribute or attribute.end() > end:
                found.append('malformed/unescaped quote in attribute: ' + tag[:90]); break
            key, value = attribute.groups()
            if key in names: found.append('duplicate attribute: ' + key)
            names.add(key)
            if value is None and key.lower() not in BOOLEAN and not key.startswith('data-'): found.append('unexpected bare attribute/possible unescaped quote: ' + key)
            if value:
                if '<' in value: found.append('unescaped < in attribute ' + key)
                if re.search(r'&(?![a-zA-Z][\w]+;|#\d+;|#x[\da-fA-F]+;)', value): found.append('unescaped ampersand in attribute ' + key)
                if not value.startswith(('"', "'")): found.append('attribute value must be quoted: ' + key)
            pos = attribute.end()
    prose = tag_pattern.sub('', clean)
    prose = re.sub(r'<!doctype[^>]*>', '', prose, flags=re.I)
    if '<' in prose: found.append('unescaped < or malformed tag in HTML text')
    if re.search(r'&(?![a-zA-Z][\w]+;|#\d+;|#x[\da-fA-F]+;)', prose): found.append('unescaped ampersand in HTML text')
    return found

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.tags, self.ids, self.ld, self.headings = [], set(), [], []
        self.title, self.script = '', None
        self.in_title = self.in_main = False
        self.feed(text)
    def handle_starttag(self, tag, pairs):
        attrs = dict(pairs); self.tags.append((tag, attrs))
        if 'id' in attrs:
            check(attrs['id'] not in self.ids, 'Duplicate ID: ' + attrs['id']); self.ids.add(attrs['id'])
        if tag == 'main': self.in_main = True
        if tag == 'title': self.in_title = True
        if self.in_main and re.fullmatch(r'h[1-6]', tag): self.headings.append(int(tag[1]))
        if tag == 'script': self.script = (attrs.get('type'), [])
    def handle_startendtag(self, tag, attrs): self.handle_starttag(tag, attrs)
    def handle_endtag(self, tag):
        if tag == 'title': self.in_title = False
        if tag == 'main': self.in_main = False
        if tag == 'script' and self.script:
            kind, parts = self.script
            if kind == 'application/ld+json':
                raw = ''.join(parts)
                check(not ENTITY.search(raw), 'HTML entities in JSON-LD; use plain characters')
                try:
                    data = json.loads(raw)
                    check(isinstance(data, dict), 'JSON-LD must be an object')
                    if isinstance(data, dict): self.ld.append(data)
                except ValueError as error: errors.append('Invalid JSON-LD: ' + str(error))
            self.script = None
    def handle_data(self, value):
        if self.script is not None: self.script[1].append(value)
        elif self.in_title: self.title += value

def route(relative):
    if relative == 'index.html': return '/'
    if relative == 'curl-to-js.html': return '/curl-to-js'
    path = '/' + relative.removesuffix('index.html')
    return path.rstrip('/') if path.rstrip('/') in TOOLS else path

def audit(directory):
    production = directory.resolve() != ROOT
    paths = SOURCE + [x[1:] + '/index.html' for x in TOOLS] if production else SOURCE
    texts = {name: (directory / name).read_text(encoding='utf-8') for name in paths}
    pages = {name: Page(text) for name, text in texts.items()}
    routes = {route(name): name for name in paths}
    # In source mode the verified deployment rewrites resolve these existing tools.
    aliases = {} if production else {tool: 'index.html' for tool in TOOLS}
    routes.update(aliases)
    incoming = {name: set() for name in paths}
    titles, descriptions = set(), set()
    for name, page in pages.items():
        label = name + ': '
        for error in encoding_errors(texts[name]): errors.append(label + error)
        check(bool(re.search(r'<head>\s*<meta charset="utf-8">', texts[name], re.I)), label + 'charset must be first in head')
        metas = {}
        for tag, attrs in page.tags:
            if tag == 'meta':
                key = attrs.get('name', attrs.get('property', 'charset'))
                check(key not in metas, label + 'duplicate meta ' + key)
                metas[key] = attrs.get('content', '')
        check(sum(tag == 'title' for tag, _ in page.tags) == 1, label + 'one title')
        check(0 < len(page.title) < 60, label + 'title under 60 characters')
        description = metas.get('description', '')
        check(0 < len(description) < 155, label + 'description under 155 characters')
        check(page.title not in titles, label + 'duplicate title'); titles.add(page.title)
        check(description not in descriptions, label + 'duplicate description'); descriptions.add(description)
        check(page.headings.count(1) == 1, label + 'exactly one H1')
        for a, b in zip(page.headings, page.headings[1:]): check(b <= a + 1, label + 'skipped main heading level')
        check(any(t == 'html' and a.get('lang') == 'en' for t, a in page.tags), label + 'lang=en')
        check('viewport' in metas, label + 'viewport')
        expected = ORIGIN + route(name)
        check([a.get('href') for t, a in page.tags if t == 'link' and a.get('rel') == 'canonical'] == [expected], label + 'canonical route/host')
        check(metas.get('og:url') == expected, label + 'og:url')
        check(metas.get('og:site_name') == 'JoinJson', label + 'site name')
        check(metas.get('robots') == ('noindex' if name == '404.html' else 'index,follow,max-image-preview:large'), label + 'robots')
        for prefix in ['og:', 'twitter:']:
            check(metas.get(prefix + 'title') == page.title, label + prefix + 'title mismatch')
            check(metas.get(prefix + 'description') == description, label + prefix + 'description mismatch')
            image = metas.get(prefix + 'image', '')
            check(image.startswith(ORIGIN + '/') and (directory / image.removeprefix(ORIGIN + '/')).is_file(), label + 'social image missing')
            check(bool(metas.get(prefix + 'image:alt')), label + 'social image alt')
        check(metas.get('og:image:width') == '1200' and metas.get('og:image:height') == '630', label + 'social image dimensions')
        check(metas.get('twitter:card') == 'summary_large_image', label + 'twitter card')
        for data in page.ld:
            check('https://joinjson.com' not in json.dumps(data), label + 'JSON-LD host mismatch')
            if data.get('@type') == 'FAQPage':
                faq = re.search(r'<section id="faq"[\s\S]*?</section>', texts[name])
                visible = []
                if faq:
                    for question, answer in re.findall(r'<summary>([\s\S]*?)</summary><p>([\s\S]*?)</p>', faq[0]):
                        visible.append((normalized(unescape(re.sub('<[^>]+>', '', question))), normalized(unescape(re.sub('<[^>]+>', '', answer)))))
                schema = [(q['name'], q['acceptedAnswer']['text']) for q in data.get('mainEntity', [])]
                check(bool(visible) and schema == visible, label + 'FAQ schema must match visible text exactly')
        if name.split('/')[0] in GUIDES:
            check(any(d.get('@type') == 'BreadcrumbList' for d in page.ld), label + 'guide breadcrumbs')
            check(any(t == 'a' and a.get('href') == '/' for t, a in page.tags), label + 'guide link home')
        for tag, attrs in page.tags:
            if tag == 'img': check('alt' in attrs and bool(attrs.get('width')) and bool(attrs.get('height')), label + 'image alt/dimensions')
            if tag == 'script' and attrs.get('src', '').startswith('http'):
                check('async' in attrs or 'defer' in attrs or attrs.get('type') == 'module', label + 'blocking third-party script')
            if tag == 'link' and attrs.get('rel') == 'stylesheet': check(not attrs.get('href', '').startswith(('http', '//')), label + 'third-party stylesheet')
            for attribute in ['href', 'src']:
                value = attrs.get(attribute, '')
                if not value or value.startswith(('mailto:', 'tel:', 'data:', 'blob:')): continue
                parts = urlsplit(value)
                if parts.netloc:
                    if parts.hostname in ['joinjson.com', 'www.joinjson.com']:
                        check(parts.scheme + '://' + parts.netloc == ORIGIN, label + 'internal host mismatch: ' + value)
                    else: continue
                target_route = unquote(parts.path)
                target_name = routes.get(target_route) if target_route else name
                if target_name is None:
                    target = directory / target_route.lstrip('/') if target_route.startswith('/') else (directory / name).parent / target_route
                    if target.is_dir(): target /= 'index.html'
                    check(target.is_file(), label + 'unresolved local link: ' + value)
                else:
                    if target_name != name: incoming[target_name].add(name)
                    if parts.fragment: check(unquote(parts.fragment) in pages[target_name].ids, label + 'broken fragment: ' + value)
        print(f'PAGE {name}: title={len(page.title)}, description={len(description)}, H1={page.headings.count(1)}')
    home = pages['index.html']
    for guide in GUIDES: check(any(t == 'a' and a.get('href') == '/' + guide + '/' for t, a in home.tags), 'Home link missing: ' + guide)
    for name in paths:
        if name != '404.html': check(bool(incoming[name]), 'Orphan page: ' + name)
    data = home.ld
    app = next((d for d in data if d.get('@type') == 'WebApplication'), {})
    check(app.get('applicationCategory') == 'DeveloperApplication' and app.get('operatingSystem') == 'Any' and app.get('browserRequirements') == 'Requires JavaScript' and str(app.get('offers', {}).get('price')) == '0', 'Home WebApplication fields')
    check(app.get('name') == 'JoinJson' and app.get('url') == ORIGIN + '/', 'Home WebApplication identity')
    check(any(d.get('@type') == 'WebSite' and d.get('name') == 'JoinJson' for d in data), 'Home WebSite')
    check(any(t == 'meta' and a.get('name') == 'google-site-verification' and a.get('content') for t, a in home.tags), 'Search Console verification missing')
    try:
        tree = ET.parse(directory / 'sitemap.xml'); ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        check(tree.getroot().tag == '{' + ns['s'] + '}urlset', 'Sitemap namespace')
        locations = [node.text for node in tree.findall('s:url/s:loc', ns)]
        check(len(locations) == len(set(locations)), 'Duplicate sitemap URL')
        check(set(locations) == {ORIGIN + r for r in routes if r != '/404.html'}, 'Sitemap completeness/host')
        for node in tree.findall('s:url/s:lastmod', ns):
            try: check(datetime.fromisoformat(node.text.replace('Z', '+00:00')).date() <= date.today(), 'Future sitemap lastmod')
            except (ValueError, TypeError): errors.append('Invalid sitemap lastmod')
    except ET.ParseError as error: errors.append('Invalid sitemap XML: ' + str(error))
    robots = (directory / 'robots.txt').read_text()
    check('Allow: /' in robots and 'Sitemap: ' + ORIGIN + '/sitemap.xml' in robots, 'Robots allow/sitemap')
    config = json.loads((ROOT / 'vercel.json').read_text())
    check(any(r.get('statusCode') == 301 and r.get('destination') == ORIGIN + '/:path*' and {'type': 'host', 'value': 'joinjson.com'} in r.get('has', []) for r in config['redirects']), 'Apex must explicitly 301 to www')
    if errors:
        print('\n'.join('FAIL ' + error for error in errors)); return 1
    print(f'PASS: {len(pages)} pages; {len(routes)-1} indexable URLs; metadata, links, encoding, JSON-LD and sitemap valid.')
    print('UNVERIFIED: deployment, live indexing, rankings, social image crawler support, Lighthouse, field Core Web Vitals, full WCAG conformance.')
    return 0

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=ROOT)
    args = parser.parse_args()
    sys.exit(audit(args.directory))
