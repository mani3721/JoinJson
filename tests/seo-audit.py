"""Static SEO audit. Python standard library only; makes no network requests.
Run: python3 tests/seo-audit.py [--origin https://example.com]
Placeholders are accepted for source checks, not proof of deployment readiness.
"""
import argparse
from datetime import date
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--origin', default='https://www.joinjson.com')
args = parser.parse_args()
ORIGIN = args.origin.rstrip('/')
assert ORIGIN.startswith('https://'), 'Canonical origin must use HTTPS'
errors = []

def check(condition, message):
    if not condition:
        errors.append(message)


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.tags, self.ids, self.ld, self.headings = [], set(), [], []
        self.title, self.main_text, self.intro = '', [], []
        self.faq, self.question, self.answer = [], '', ''
        self.in_title = self.in_main = self.in_intro = self.in_faq = False
        self.in_summary = self.in_answer = False
        self.script = None
        self.feed(text)

    def handle_starttag(self, tag, pairs):
        a = dict(pairs)
        self.tags.append((tag, a))
        if 'id' in a:
            check(a['id'] not in self.ids, 'Duplicate ID: ' + a['id'])
            self.ids.add(a['id'])
        if tag == 'title': self.in_title = True
        if tag == 'main': self.in_main = True
        if re.fullmatch(r'h[1-6]', tag): self.headings.append(int(tag[1]))
        if tag == 'script': self.script = (a.get('type'), [])
        if tag == 'p' and 'data-seo-intro' in a: self.in_intro = True
        if tag == 'section' and a.get('aria-labelledby') == 'faq': self.in_faq = True
        if self.in_faq and tag == 'details': self.question = self.answer = ''
        if self.in_faq and tag == 'summary': self.in_summary = True
        if self.in_faq and tag == 'p': self.in_answer = True

    def handle_endtag(self, tag):
        if tag == 'title': self.in_title = False
        if tag == 'main': self.in_main = False
        if tag == 'p': self.in_intro = self.in_answer = False
        if tag == 'summary': self.in_summary = False
        if tag == 'details' and self.in_faq:
            self.faq.append((' '.join(self.question.split()), ' '.join(self.answer.split())))
        if tag == 'section': self.in_faq = False
        if tag == 'script' and self.script is not None:
            kind, parts = self.script
            if kind == 'application/ld+json':
                try: self.ld.append(json.loads(''.join(parts)))
                except ValueError as error: errors.append('Invalid JSON-LD: ' + str(error))
            self.script = None

    def handle_data(self, value):
        if self.script is not None:
            self.script[1].append(value)
            return
        if self.in_title: self.title += value
        if self.in_main: self.main_text.append(value)
        if self.in_intro: self.intro.append(value)
        if self.in_summary: self.question += value
        if self.in_answer: self.answer += value


def route(path):
    relative = path.relative_to(ROOT).as_posix()
    return '/' if relative == 'index.html' else '/' + relative[:-len('index.html')] if relative.endswith('/index.html') else '/' + relative

# Enumerate HTML from the filesystem, not the sitemap, so omissions are caught.
paths = sorted(ROOT.rglob('*.html'))
pages = {path: Page(path.read_text()) for path in paths}
titles, descriptions, incoming = {}, {}, {p: set() for p in paths}
for path, page in pages.items():
    label = path.relative_to(ROOT).as_posix()
    metas = {}
    for tag, a in page.tags:
        if tag == 'meta':
            key = a.get('name', a.get('property'))
            check(key not in metas, label + ': duplicate meta ' + str(key))
            metas[key] = a.get('content', '')
    check(0 < len(page.title) < 60, label + ': title length')
    description = metas.get('description', '')
    check(0 < len(description) < 155, label + ': description length')
    check(page.title not in titles, label + ': duplicate title')
    check(description not in descriptions, label + ': duplicate description')
    titles[page.title] = path
    descriptions[description] = path
    check(page.headings.count(1) == 1, label + ': exactly one H1')
    for previous, current in zip(page.headings, page.headings[1:]):
        check(current <= previous + 1, label + ': skipped heading level')
    check(any(t == 'html' and a.get('lang') == 'en' for t,a in page.tags), label + ': lang')
    check('viewport' in metas, label + ': viewport')
    canonicals = [a.get('href') for t,a in page.tags if t == 'link' and a.get('rel') == 'canonical']
    check(canonicals == [ORIGIN + route(path)], label + ': canonical route/HTTPS/slash consistency')
    check(metas.get('og:url') == ORIGIN + route(path), label + ': og:url')
    for prefix in ('og:', 'twitter:'):
        check(metas.get(prefix + 'title') == page.title, label + ': social title mismatch')
        check(metas.get(prefix + 'description') == description, label + ': social description mismatch')
        image = metas.get(prefix + 'image', '')
        check(image.startswith(ORIGIN + '/'), label + ': social image URL')
        if image.startswith(ORIGIN + '/'):
            check((ROOT / image[len(ORIGIN)+1:]).is_file(), label + ': missing social image')
        check(bool(metas.get(prefix + 'image:alt')), label + ': social image alt')
    check(metas.get('og:image:width') == '1200' and metas.get('og:image:height') == '630', label + ': image dimensions')
    check(('noindex' in metas.get('robots', '')) == (path.name == '404.html'), label + ': indexability')
    check(sum(t == 'header' for t,a in page.tags) == 1 and sum(t == 'footer' for t,a in page.tags) == 1, label + ': shared navigation')
    for tag, a in page.tags:
        if tag == 'img':
            check('alt' in a, label + ': image missing alt')
            check(bool(a.get('width')) and bool(a.get('height')), label + ': image missing dimensions')
        if tag == 'script' and a.get('src'):
            check(a.get('src', '').startswith('/') and ('defer' in a or 'async' in a), label + ': blocking/external script')
        if tag == 'link':
            check(a.get('rel') != 'preload', label + ': unexpected preload')
            if a.get('rel') == 'stylesheet': check(a.get('href', '').startswith('/'), label + ': external stylesheet')
        for attr in ('href', 'src'):
            value = a.get(attr, '')
            if not value or value.startswith(('mailto:', 'tel:')): continue
            if value.startswith(ORIGIN): value = value[len(ORIGIN):]
            if value.startswith(('http:', 'https:', '//')): continue
            parts = urlsplit(value)
            target = path if not parts.path else ROOT / unquote(parts.path).lstrip('/') if parts.path.startswith('/') else path.parent / unquote(parts.path)
            target = target.resolve()
            if target.is_dir(): target /= 'index.html'
            check(target.is_file(), label + ': unresolved link ' + value)
            if target in pages and target != path: incoming[target].add(path)
            if parts.fragment and not parts.fragment.startswith(('example=', 'data=')):
                check(target in pages and unquote(parts.fragment) in pages[target].ids, label + ': unresolved fragment ' + value)
    if path.parent.name in ('merge-json-files-python', 'merge-json-arrays-by-id', 'deep-merge-vs-shallow-merge-json'):
        check(any(v.get('@type') == 'BreadcrumbList' for v in page.ld), label + ': article breadcrumbs')
        text = path.read_text().split('<main',1)[1].split('</main>',1)[0]
        prose = re.sub(r'<pre>.*?</pre>', '', text, flags=re.S)
        words = len(re.sub(r'<[^>]+>', ' ', prose).split())
        check(words >= 800, label + ': under 800 prose words')
        check('When not to use this approach' in text, label + ': missing limitations section')
        print(f'ARTICLE {label}: {words} prose words')
    for data in page.ld:
        if data.get('@type') == 'FAQPage':
            entries = [(v['name'],v['acceptedAnswer']['text']) for v in data['mainEntity']]
            check(entries == page.faq, label + ': FAQ schema differs from visible answers')
    print(f'PAGE {label}: title {len(page.title)}, description {len(description)} characters')

home = pages[ROOT / 'index.html']
check(100 <= len(' '.join(home.intro).split()) <= 150, 'Home: intro must be 100–150 words')
check(len(home.faq) in range(6,9), 'Home: FAQ count')
check(any(v.get('@type') == 'WebSite' for v in home.ld), 'Home: WebSite schema')
app = next((v for v in home.ld if v.get('@type') == 'WebApplication'), {})
check(app.get('operatingSystem') == 'Any' and app.get('applicationCategory') == 'DeveloperApplication' and app.get('offers',{}).get('price') == 0, 'Home: WebApplication values')
check(app.get('url') == ORIGIN + '/' and bool(app.get('name')) and bool(app.get('description')), 'Home: WebApplication identity')
check(any(t == 'meta' and a.get('name') == 'google-site-verification' for t,a in home.tags), 'Home: verification placeholder')
# Inline decorative spans must not introduce spaces into visible words.
text = ' '.join(''.join(p.main_text) for p in pages.values()).lower()
for phrase in ('merge json files online','merge multiple json files','merge json files into one','combine json files into one','merge 2 json files','join json files','json file merger','merge json files by key','join json files by id','json merge conflicts'):
    check(phrase in text, 'Missing natural phrase: ' + phrase)
for path in pages:
    if path.name != '404.html': check(bool(incoming[path]), 'Orphan page: ' + str(path))
ns = {'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
sitemap = ET.parse(ROOT / 'sitemap.xml').getroot()
locations = [u.find('s:loc',ns).text for u in sitemap.findall('s:url',ns)]
check(len(locations) == len(set(locations)), 'Duplicate sitemap entries')
check(set(locations) == {ORIGIN + route(p) for p in pages if p.name != '404.html'}, 'Sitemap completeness')
for item in sitemap.findall('s:url',ns):
    try: check(date.fromisoformat(item.find('s:lastmod',ns).text) <= date.today(), 'Future lastmod')
    except (ValueError, AttributeError): errors.append('Invalid lastmod')
robots = (ROOT / 'robots.txt').read_text()
check('Allow: /' in robots and 'Disallow:' not in robots, 'Robots must allow crawling')
check('Sitemap: ' + ORIGIN + '/sitemap.xml' in robots, 'Robots sitemap origin')
if errors:
    print('\n'.join('FAIL ' + error for error in errors))
    raise SystemExit(1)
print(f'PASS SEO audit: {len(pages)} pages, {len(locations)} indexable sitemap URLs; no duplicate titles/descriptions; links and JSON-LD valid.')
print('UNVERIFIED: live HTTP/indexing, rankings, rich results, Lighthouse, Core Web Vitals, rendering, accessibility, social-image crawler support.')
