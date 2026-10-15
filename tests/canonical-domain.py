"""Check canonical domain and Vercel redirect without third-party dependencies.
Run: python3 tests/canonical-domain.py
"""
from html.parser import HTMLParser
import json
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://www.joinjson.com'
ROUTES = ['', 'about/', 'contact/', 'privacy/', 'terms/',
          'deep-merge-vs-shallow-merge-json/', 'merge-json-arrays-by-id/',
          'merge-json-files-python/']


class Head(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.canonicals = []
        self.social_urls = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonicals.append(attrs.get('href'))
        if tag == 'meta' and attrs.get('property') == 'og:url':
            self.social_urls.append(attrs.get('content'))


class CanonicalDomainTests(unittest.TestCase):
    def test_page_metadata(self):
        for route in ROUTES + ['404.html']:
            with self.subTest(route=route):
                page = ROOT / (route if route.endswith('.html') else route + 'index.html')
                text = page.read_text()
                head = Head(text)
                expected = ORIGIN + '/' + route
                self.assertEqual(head.canonicals, [expected])
                self.assertEqual(head.social_urls, [expected])
                self.assertNotIn('https://joinjson.com', text)

    def test_sitemap_and_robots(self):
        for directory in [ROOT, ROOT / 'audit']:
            with self.subTest(directory=str(directory)):
                tree = ET.parse(directory / 'sitemap.xml')
                urls = [item.text for item in tree.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
                self.assertEqual(set(urls), {ORIGIN + '/' + route for route in ROUTES})
                self.assertEqual(len(urls), len(ROUTES))
                self.assertIn('Sitemap: ' + ORIGIN + '/sitemap.xml', (directory / 'robots.txt').read_text())

    def test_permanent_apex_redirect(self):
        config = json.loads((ROOT / 'vercel.json').read_text())
        redirects = [rule for rule in config.get('redirects', [])
                     if {'type': 'host', 'value': 'joinjson.com'} in rule.get('has', [])]
        self.assertEqual(len(redirects), 1)
        self.assertEqual(redirects[0]['source'], '/:path*')
        self.assertEqual(redirects[0]['destination'], ORIGIN + '/:path*')
        self.assertIs(redirects[0]['permanent'], True)


if __name__ == '__main__':
    unittest.main()
