"""Dependency-free regression checks for the common site shell."""
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
PAGES = ['index.html', '404.html', *[name + '/index.html' for name in (
    'about', 'contact', 'privacy', 'terms', 'disclaimer', 'merge-json-files-python',
    'merge-json-arrays-by-id', 'deep-merge-vs-shallow-merge-json')]]
GUIDES = ['/merge-json-files-python/', '/merge-json-arrays-by-id/',
          '/deep-merge-vs-shallow-merge-json/']


class ShellParser(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tags = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


class SharedLayoutTests(unittest.TestCase):
    def test_every_page_uses_home_shell(self):
        home = (ROOT / 'index.html').read_text()
        for name in PAGES:
            text = (ROOT / name).read_text()
            with self.subTest(page=name):
                for tag in ('header', 'footer'):
                    pattern = rf'<{tag}\b[^>]*>[\s\S]*?</{tag}>'
                    self.assertEqual(re.findall(pattern, text), re.findall(pattern, home))
                    self.assertEqual(len(re.findall(pattern, text)), 1)
                self.assertEqual(text.count('href="/assets/site-layout.css"'), 1)

    def test_dropdown_links_are_regular_same_tab_links(self):
        home = (ROOT / 'index.html').read_text()
        dropdown = re.search(r'<details class="guide-dropdown">([\s\S]*?)</details>', home).group(1)
        parser = ShellParser(dropdown)
        self.assertIn(('summary', {}), parser.tags)
        links = [attrs for tag, attrs in parser.tags if tag == 'a']
        self.assertEqual([a['href'] for a in links], GUIDES)
        for link in links:
            self.assertNotIn('target', link)
            self.assertTrue((ROOT / link['href'].strip('/') / 'index.html').is_file())

    def test_build_keeps_shell_synchronized(self):
        build = (ROOT / 'scripts/build-site.mjs').read_text()
        self.assertLess(build.index('await syncSharedLayout(output)'), build.index('await buildHome(output)'))

    def test_theme_toggle_is_last_in_every_header(self):
        for name in PAGES:
            text = (ROOT / name).read_text()
            with self.subTest(page=name):
                header = re.search(r'<header\b[^>]*>[\s\S]*?</header>', text).group()
                tags = ShellParser(header).tags
                buttons = [attrs for tag, attrs in tags if tag == 'button']
                self.assertEqual(len(buttons), 1)
                self.assertEqual(buttons[0]['id'], 'theme-toggle')
                self.assertEqual(buttons[0]['type'], 'button')
                self.assertEqual(buttons[0]['aria-label'], 'Dark mode')
                self.assertIn(buttons[0]['aria-pressed'], ('true', 'false'))
                self.assertGreater(header.index('id="theme-toggle"'), header.index('</nav>'))
                self.assertEqual(text.count('src="/assets/theme.js"'), 1)

    def test_footer_menu_labels_order_and_destinations(self):
        expected = [('/json-to-yaml', 'JSON to YAML / YAML to JSON'),
                    ('/json-to-typescript', 'JSON to TypeScript'),
                    ('/json-to-python', 'JSON to Python (Pydantic)'),
                    ('/json-diff', 'JSON Diff Checker'),
                    ('/json-to-zod', 'JSON to Zod Schema'),
                    ('/curl-to-js.html', 'cURL to JavaScript'),
                    ('/about/', 'About Us'), ('/contact/', 'Contact Us'),
                    ('/privacy/', 'Privacy Policy'), ('/terms/', 'Terms of Use'),
                    ('/disclaimer/', 'Disclaimer')]
        for name in PAGES:
            with self.subTest(page=name):
                text = (ROOT / name).read_text()
                footer = re.search(r'<footer\b[^>]*>[\s\S]*?</footer>', text).group()
                links = re.findall(r'<a href="([^"]+)">([^<]+)</a>', footer)
                self.assertEqual(links, expected)
                for href, _ in links:
                    if href.startswith('/json-'):
                        self.assertIn(href, (ROOT / 'scripts/seo-pages.json').read_text())
                    elif href.endswith('.html'):
                        self.assertTrue((ROOT / href.lstrip('/')).is_file())
                    else:
                        self.assertTrue((ROOT / href.strip('/') / 'index.html').is_file())

    def test_disclaimer_is_published(self):
        self.assertIn("'disclaimer'", (ROOT / 'scripts/build-site.mjs').read_text())
        self.assertIn("'disclaimer/index.html'", (ROOT / 'scripts/shared-layout.mjs').read_text())
        self.assertIn("'disclaimer'", (ROOT / 'scripts/sync-security.mjs').read_text())
        self.assertIn('https://www.joinjson.com/disclaimer/', (ROOT / 'sitemap.xml').read_text())

    def test_no_duplicate_ids(self):
        for name in PAGES:
            with self.subTest(page=name):
                ids = [attrs['id'] for _, attrs in ShellParser((ROOT / name).read_text()).tags if 'id' in attrs]
                self.assertEqual(len(ids), len(set(ids)))


if __name__ == '__main__':
    unittest.main()
