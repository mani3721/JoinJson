"""Mutation checks for the strict encoding and structured-data scanner."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET
spec = importlib.util.spec_from_file_location('seo', Path(__file__).with_name('seo-audit.py'))
seo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seo)

class ScannerTests(unittest.TestCase):
    def test_tool_routes_match_deployment_without_trailing_slash(self):
        for tool in seo.TOOLS:
            with self.subTest(tool=tool):
                self.assertEqual(seo.route(tool.lstrip('/') + '/index.html'), tool)

    def test_static_page_routes_preserve_trailing_slash(self):
        self.assertEqual(seo.route('index.html'), '/')
        self.assertEqual(seo.route('about/index.html'), '/about/')
        self.assertEqual(seo.route('curl-to-js.html'), '/curl-to-js')

    def test_valid_encoding(self):
        self.assertEqual(seo.encoding_errors('<meta content="A &amp; B &lt; C &quot;quoted&quot;"><p>UTF-8 — A &amp; B</p>'), [])
    def test_reject_double_encoding(self):
        self.assertTrue(seo.encoding_errors('<title>A &amp;amp; B</title>'))
    def test_reject_less_than_in_attribute(self):
        self.assertTrue(seo.encoding_errors('<meta content="a < b">'))
    def test_reject_unescaped_quote(self):
        self.assertTrue(seo.encoding_errors('<meta content="a "quoted" value">'))
    def test_reject_ampersand(self):
        self.assertTrue(seo.encoding_errors('<p>A & B</p>'))
    def test_plain_json_characters(self):
        seo.errors.clear()
        page = seo.Page('<script type="application/ld+json">{"name":"A & B"}</script>')
        self.assertEqual(page.ld[0]['name'], 'A & B')
        self.assertEqual(seo.errors, [])
    def test_invalid_json(self):
        seo.errors.clear()
        seo.Page('<script type="application/ld+json">{"name":}</script>')
        self.assertTrue(seo.errors)
    def test_html_entities_in_json(self):
        seo.errors.clear()
        seo.Page('<script type="application/ld+json">{"name":"A &amp; B"}</script>')
        self.assertTrue(seo.errors)
    def test_sitemap_xml_rejects_unescaped_ampersand(self):
        with self.assertRaises(ET.ParseError): ET.fromstring('<urlset><loc>https://www.joinjson.com/?a=1&b=2</loc></urlset>')

if __name__ == '__main__': unittest.main()
