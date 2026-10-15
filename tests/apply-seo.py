"""One-time SEO migration used for this delivery. Do not rerun on migrated pages.
Archived for reproducibility; use seo-audit.py for ongoing validation.
Does not touch application assets or styles.
"""
import html
import json
import re
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
DATA = {
 'index.html': ('Merge JSON Files Online: Join by ID, See Conflicts', 'Merge multiple JSON files into one. Join records by ID, merge objects or combine lists, and see every conflict. Free and private: runs in your browser.'),
 'merge-json-files-python/index.html': ('Merge JSON Files in Python: Examples and Pitfalls', 'Merge multiple JSON files in Python: combine lists, deep merge objects and join records by key. Includes tested code and a no-code online tool.'),
 'merge-json-arrays-by-id/index.html': ('Merge JSON Arrays by ID: Join Records Across Files', 'How to merge JSON arrays by ID so records with the same id become one. Covers conflicts, missing keys and nested ids, with a free in-browser tool.'),
 'deep-merge-vs-shallow-merge-json/index.html': ('Deep Merge vs Shallow Merge in JSON: The Difference', 'Shallow merge replaces whole objects; deep merge combines nested keys. See side-by-side JSON examples, how arrays behave and when to use each.'),
 'about/index.html': ('About joinjson.com: A Private JSON Merge Tool', 'Learn about joinjson.com, a free browser JSON merger with keyed joins, source-aware conflicts and local processing.'),
 'privacy/index.html': ('Privacy Policy | joinjson.com', 'How joinjson.com processes JSON locally, saves preferences and handles sharing. Includes hosting, disabled ads and consent disclosures.'),
 'terms/index.html': ('Terms of Use | joinjson.com', 'Read the plain-English terms for joinjson.com. Keep backups, validate merge results and use only data you are entitled to process.'),
 'contact/index.html': ('Contact joinjson.com', 'Contact joinjson.com by email with questions or an anonymized bug report. No contact form or confidential file uploads.'),
 '404.html': ('Page Not Found — JSON Merger', 'This page was not found. Return to the private JSON merger or browse the guides for joining records and combining objects.')
}
FAQ = [
 ('How do I merge 2 JSON files?', 'Paste or upload one JSON value in each Quick mode box, then select Merge JSON. Auto-merge is on by default. The page explains the chosen method; review the result and conflicts before exporting.'),
 ('Can I merge multiple JSON files into one?', 'Yes. Open Advanced mode, add files with the picker, drag and drop, or paste, then reorder them and select Merge JSON. Download the result as one JSON file.'),
 ('Are my files uploaded?', 'No. Processing happens in your browser. The tool sends no selected JSON over the network and never automatically stores it. Only theme and non-sensitive preferences use localStorage. Explicit sharing and exports can expose data outside the tool; read the privacy notice.'),
 ('What happens when values conflict?', 'You choose later or earlier values. New fields are kept either way. Lists can concatenate, deduplicate, or be replaced. Review JSON merge conflicts with their source files in the Conflicts tab and export the report as CSV.'),
 ('Can I join JSON files using nested IDs?', 'Yes. To join JSON files by ID, choose Join records in Advanced mode and use a dot path such as user.id. For wrapped lists, set the records field to data.items. The result is the merged list, not its original wrapper.'),
 ('Why does my JSON fail validation?', 'JSON requires double-quoted keys and strings, no comments, no trailing commas, and matching brackets. Format check explains syntax or method problems and offers fixes. Use the reported line and column when available, correct the input, and try again.'),
 ('Is there a file size limit?', 'There is no fixed tool limit, but browser memory and device speed limit practical size. Large merges use a local worker, but input checking and rendering can still take time. Preview is shortened at 50,000 characters; copies and downloads contain the full result. Keep large numeric IDs as strings to avoid precision loss.')
]
EXTRA = {
 'merge-json-files-python/index.html': '''<h2>When not to use this approach</h2>
<p>Do not use this in-memory script for exports that exceed available RAM, or when a downstream schema needs transactional validation. Its object mode is shallow, so it is also the wrong choice when nested fields must survive overrides. Use the tested recursive function in the deep-merge guide or a domain-specific pipeline instead. If you need a one-off visual review of conflicting sources, the browser tool is easier to inspect than a script that only prints the final value.</p>''',
 'merge-json-arrays-by-id/index.html': '''<h2>When not to use this approach</h2>
<p>Do not join records when the candidate key is not a stable identity shared by every source. A display name, row position, or ID allocated independently by another system can combine unrelated people or products. Append independent events instead. The flat Python example is not suitable for recursively merging nested fields or generating a source-aware conflict report. Use a reviewed identity mapping before joining, and keep unmatched records until you can explain what each missing key means.</p>''',
 'deep-merge-vs-shallow-merge-json/index.html': '''<h2>When not to use this approach</h2>
<p>Do not use a generic deep merge as an implementation of JSON Patch or JSON Merge Patch. Their operation and deletion rules differ. Recursive merging is also inappropriate when a nested block must be replaced atomically or arrays contain entities that need an ID-based join. A valid merged configuration can still violate your application's schema. Use explicit operations, validate the allowed keys, and test the resulting configuration before loading it into a production application.</p>'''
}

def apply(relative):
 path = ROOT / relative
 text = path.read_text()
 title, description = DATA[relative]
 text = re.sub(r'<title>.*?</title>', '<title>' + html.escape(title) + '</title>', text, count=1, flags=re.S)
 for kind, attr, value in [('name','description',description), ('property','og:title',title), ('property','og:description',description), ('name','twitter:title',title), ('name','twitter:description',description)]:
  pattern = r'<meta\s+' + kind + r'="' + re.escape(attr) + r'"\s+content="[^"]*"\s*/?>'
  text, count = re.subn(pattern, '<meta ' + kind + '="' + attr + '" content="' + html.escape(value, quote=True) + '">', text, count=1)
  assert count == 1, (relative, attr)
 text = text.replace('content="summary"', 'content="summary_large_image"')
 image = '''<meta property="og:image" content="https://joinjson.com/assets/og-placeholder.svg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Merge JSON files: join records by ID and review conflicts">
<meta name="twitter:image" content="https://joinjson.com/assets/og-placeholder.svg">
<meta name="twitter:image:alt" content="Merge JSON files: join records by ID and review conflicts">
'''
 text = text.replace('</head>', image + '</head>', 1)
 if relative in EXTRA:
  # Append before the editorial callout; existing ad placement stays untouched.
  text = re.sub(r'(<aside class="callout">)', EXTRA[relative] + '\n\\1', text, count=1)
 if relative == 'merge-json-files-python/index.html':
  text = text.replace('Python is useful when merging is part of a repeatable job:', 'To merge JSON files in Python, load each file with the standard-library json module, then concatenate lists, recursively merge objects, or index records by a shared key. Python is useful when merging is part of a repeatable job:', 1)
 if relative == 'merge-json-arrays-by-id/index.html':
  text = text.replace('Appending arrays is easy, but it does not reconcile records.', 'To merge JSON arrays by ID, index each record by its stable ID, combine matching fields, and choose which source wins conflicts. Appending arrays is easy, but it does not reconcile records.', 1)
 if relative == 'index.html':
  text = text.replace('<h1>Merge JSON files</h1>', '<h1>Merge JSON files into one</h1>', 1)
  # Replace FAQ content and data together so the visible answers match exactly.
  start = text.index('        <section aria-labelledby="faq">')
  end = text.index('</section>', start) + len('</section>')
  visible = '<section aria-labelledby="faq"><h2 id="faq">Frequently asked questions</h2>\n' + '\n'.join('<details><summary>' + html.escape(q) + '</summary><p>' + html.escape(a) + '</p></details>' for q,a in FAQ) + '\n</section>'
  text = text[:start] + visible + text[end:]
  def schema(match):
   data = json.loads(match.group(1))
   if data['@type'] == 'FAQPage':
    data['mainEntity'] = [{'@type':'Question','name':q,'acceptedAnswer':{'@type':'Answer','text':a}} for q,a in FAQ]
   if data['@type'] == 'WebApplication':
    data['operatingSystem'] = 'Any'
    data['offers']['price'] = 0
    data['description'] = description
   return '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False, indent=2) + '</script>'
  text = re.sub(r'<script\s+type="application/ld\+json">(.*?)</script>', schema, text, flags=re.S)
  website = {'@context':'https://schema.org','@type':'WebSite','name':'joinjson.com','url':'https://joinjson.com/'}
  text = text.replace('</head>', '<meta name="google-site-verification" content="[SEARCH CONSOLE VERIFICATION TOKEN]">\n<script type="application/ld+json">' + json.dumps(website) + '</script>\n</head>', 1)
  intro = '''<p data-seo-intro>Use this browser tool to merge JSON files without sending your inputs to a server. You can merge JSON files online by pasting two values or adding files, then review the selected method before exporting. For larger jobs, merge multiple JSON files with explicit ordering and conflict rules in Advanced mode. Join customer records by a shared ID, combine independent lists, or preserve nested fields when merging settings objects. The result includes a conflict report that names the source files, so you can inspect competing values instead of guessing which one survived. Format check flags incompatible shapes and offers fixes near your inputs. Start with a bundled example if you want to understand the workflow before using your own data. Keep original files, review the output, and validate it against the requirements of the application that will consume it.</p>'''
  text = text.replace('<h2>Combine JSON files into one, without losing the story</h2>', '<h2>Combine JSON files into one, without losing the story</h2>\n' + intro, 1)
  sections = '''<section class="tool-explanation"><h2>How it works</h2>
<ol><li><strong>Add JSON.</strong> Paste two inputs in Quick mode, or add and reorder several inputs in Advanced mode. Format check shows issues that need attention.</li>
<li><strong>Merge.</strong> Select Merge JSON or leave Auto-merge enabled. To merge JSON files by key, choose Join records and enter a shared ID field; use Combine lists for independent items or Deep-merge objects for nested settings.</li>
<li><strong>Review.</strong> Inspect the result, compare source values, and resolve your policy for conflicting fields. Copy the complete JSON or download the result and conflict CSV.</li></ol></section>
<section class="tool-explanation"><h2>Python and command-line equivalents</h2>
<p>For repeatable local jobs, Python's json module can read files, combine lists and write a new output. Save the tested script from the <a href="/merge-json-files-python/">Python JSON merging guide</a>, then run <code>python3 merge_json.py lists merged.json first.json second.json</code>. That command appends lists; it does not join matching IDs. Object mode in that script is shallow. The guide explains those limits and links to recursive and keyed examples. Check syntax from your terminal with <code>python3 -m json.tool merged.json</code>; syntax validation does not replace schema checks.</p></section>
'''
  text = text.replace('<section aria-labelledby="faq">', sections + '<section aria-labelledby="faq">', 1)
 path.write_text(text)
 print('Updated ' + relative)

if __name__ == '__main__':
 apply(sys.argv[1])
