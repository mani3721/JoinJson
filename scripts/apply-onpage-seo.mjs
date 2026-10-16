// Idempotent source migration. Run from the repository with node scripts/apply-onpage-seo.mjs.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyMetadata, metadata, origin, root, buildSeo } from './seo.mjs';
import { sitePages, syncSharedLayout } from './shared-layout.mjs';
import { JSDOM } from 'jsdom';
const normalize = value => value.replace(/\s+/g, ' ').trim();
for (const page of sitePages) {
  const path = join(root, page);
  let html = await readFile(path, 'utf8');
  const document = new JSDOM(html).window.document;
  const route = page === 'index.html' ? '/' : page === 'curl-to-js.html' ? '/curl-to-js' : '/' + page.replace(/index\.html$/, '');
  let title = document.title, description = document.querySelector('meta[name="description"]').content;
  if (route === '/') [title, description] = metadata['/'];
  if (page === 'about/index.html') description = 'Learn about JoinJson, a free browser JSON merger with deep merge, array handling and highlighted changes. Paste, upload or load JSON from a URL.';
  if (page === 'curl-to-js.html') { title = 'cURL to Fetch and Axios Converter | JoinJson'; description = 'Convert cURL commands to Fetch or Axios JavaScript in your browser. Paste a command, review the generated code, then copy or download it.'; }
  html = applyMetadata(html, route, title, description);
  if (page === 'index.html') {
    html = html.replace('<h1 id="page-title">Merge <span>{ JSON }</span> files into one</h1>', '<h1 id="page-title">Merge <span><span aria-hidden="true">{ </span>JSON<span aria-hidden="true"> }</span></span> files into one</h1>');
    html = html.replace('Bring two JSON values together. Review exactly what changed.', 'Merge JSON files online. Review every highlighted change before you copy or download.');
    html = html.replace('Merging JSON means bringing two structured values together using a consistent rule for conflicts.', 'Use this JSON file merger to combine JSON files with explicit rules for conflicts. To merge multiple JSON files, combine two at a time and use each result as the next base.');
    html = html.replace('Deep merge is enabled initially, so matching nested objects are combined recursively.', 'To deep merge JSON, leave Deep merge enabled so matching nested objects are combined recursively.');
    html = html.replace('while Merge by ID joins array objects that share the selected identifier field.', 'while Merge by ID lets you merge JSON by ID using the selected identifier field.');
    const old = 'Yes. Select Concatenate both to append items, or Merge by ID to join array objects that share a field such as id. Replace with second keeps the updated array only. In shallow object mode, a conflicting nested array is handled with the selected array rule.';
    const answer = 'Yes. Select Concatenate both to append items, or Merge by ID to join array objects that share a field such as id. Replace with second uses the second array unless you select the first value for that conflict. With deep merge disabled, a conflicting nested object is replaced as a whole; its child arrays are not visited.';
    html = html.replace(old, answer);
    html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (block, json) => {
      const data = JSON.parse(json);
      if (data['@type'] === 'WebApplication') { data.description = description; data.browserRequirements = 'Requires JavaScript'; data.offers.price = 0; }
      if (data['@type'] === 'FAQPage') {
        const visible = new JSDOM(html).window.document;
        data.mainEntity = [...visible.querySelectorAll('#faq details')].map(item => ({ '@type': 'Question', name: normalize(item.querySelector('summary').textContent), acceptedAnswer: { '@type': 'Answer', text: normalize(item.querySelector('p').textContent) } }));
      }
      return '<script type="application/ld+json">' + JSON.stringify(data) + '</script>';
    });
    if (!html.includes('"@type":"WebSite"')) html = html.replace('</head>', '<script type="application/ld+json">' + JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'JoinJson', url: origin + '/' }) + '</script>\n</head>');
  }
  const changes = {
    'about/index.html': [
      ['arrays can be replaced or concatenated.', 'arrays can be replaced, concatenated, or merged by ID.'],
      ['The homepage does not join records by ID or validate application-specific schemas.', 'The homepage can join array records by ID, but it does not validate application-specific schemas.'],
      ['No live advertising or analytics vendor is enabled in the current template.', 'The homepage includes Google Analytics. Advertising remains controlled by the existing consent-gated configuration.']
    ],
    'privacy/index.html': [
      ['Advertising is not active: no Google AdSense or analytics script is loaded by the current configuration.', 'The homepage includes a Google Analytics script. Advertising is controlled separately by the consent-gated configuration; this policy does not imply that analytics is absent.']
    ]
  };
  for (const [from, to] of changes[page] || []) html = html.replace(from, to);
  // Replace only stale prose; preserve code samples, layout, IDs and ad placements.
  const paragraphs = {
    'merge-json-files-python/index.html': [
      [/If you only need a one-time result/, 'If you only need a one-time result, use the <a href="/">browser JSON file merger</a>. Paste, upload or load two inputs from URLs, review highlighted changes, then copy or download the result. The scripts below demonstrate explicit rules for local file processing.'],
      [/For a visual review, return/, 'For a visual review, return to the <a href="/">merge JSON files tool</a>. Open Advanced options and select Merge by ID for arrays with a shared identifier. Use small sample inputs first and inspect highlighted changes before applying the same rules to your data.']
    ],
    'merge-json-arrays-by-id/index.html': [
      [/The <a href="\/">JSON file merger/, 'The <a href="/">JSON file merger</a> supports two inputs. In Advanced options, choose Merge by ID and enter an ID field. The initial field is id; it is not inferred from your records. Review the highlighted result before copying or downloading it.'],
      [/In advanced mode/, 'In Advanced options, <code>user.id</code> selects a nested identifier field. For a wrapped list, provide the array itself as input; there is no Records path control. Numeric and string identifiers remain distinct: the number 7 is not the string &quot;7&quot;. String matching is case-sensitive. Dot paths cannot address property names containing literal dots.'],
      [/A record may contain tags/, 'A record may contain tags, addresses, or transactions. With deep merge enabled, matching nested objects are combined recursively. The array rule applies wherever two arrays are visited: replacement keeps the selected array, concatenation appends every item including duplicates, and Merge by ID matches array objects using the ID field. There is no separate deduplication option.'],
      [/A stable output count/, 'A stable output count does not prove correctness. An update can replace a meaningful value with an empty string or null. These are explicit JSON values, not deletion commands. Review repeated IDs within each source before merging; do not assume the tool normalizes duplicates within the first input.'],
      [/Before a production merge/, 'Before a production merge, test a matching ID, a new ID, a missing ID, and a deliberate conflict. Keep both source documents and download the merged result for review. The current tool does not export a conflict CSV. For scheduled workflows, adapt the <a href="/merge-json-files-python/">Python file-processing guide</a>. For a visual workflow, <a href="/">merge JSON arrays in your browser</a>.'],
      [/String normalization deserves/, 'String normalization deserves the same care. Trimming whitespace or removing leading zeros can turn different codes into one. The tool does not silently apply those transformations or provide case-insensitive ID matching. Review any system-specific identity mapping before merging.']
    ],
    'deep-merge-vs-shallow-merge-json/index.html': [
      [/Use the <a href="\/">merge JSON files tool/, 'Use the <a href="/">merge JSON files tool</a> to inspect highlighted changes in your browser. Deep merge is enabled initially. Arrays can be replaced, concatenated, or merged by ID. The examples below isolate these choices so you can review the expected result before downloading it.'],
      [/The following standalone Python block/, 'The following standalone Python block demonstrates both outcomes. Its deep function combines dictionaries recursively, replaces arrays and scalar values with the later value, and copies inputs. The browser tool also defaults to array replacement; leave Replace with second selected to reproduce that array rule.'],
      [/For example, combining/, 'For example, combining [1, 2] with [2, 3] yields [1, 2, 2, 3] under concatenation. Replacement initially gives [2, 3]. The browser tool does not have a unique-combination option. To reconcile objects with shared identifiers, select Merge by ID and review the <a href="/merge-json-arrays-by-id/">JSON array ID guide</a>.'],
      [/Earlier-wins is a conflict policy/, 'A conflict choice determines which competing value survives; it does not discard unrelated keys in a deep merge. The second value is selected initially. Deep merge combines matching nested objects, while disabling it replaces a conflicting nested object as a whole. Array concatenation appends both inputs rather than selecting one winner.'],
      [/JSON syntax validation only proves/, 'JSON syntax validation only proves that a parser can read a value. It does not establish required fields, valid port ranges, or application correctness. Run your application checks after merging and review the highlighted changes. The browser output is not a semantic explanation of whether each change is safe.']
    ]
  };
  html = html.replace(/<p\b[^>]*>[\s\S]*?<\/p>/g, block => {
    for (const [pattern, replacement] of paragraphs[page] || []) if (pattern.test(block)) return '<p>' + replacement + '</p>';
    return block;
  });
  await writeFile(path, html);
}
await syncSharedLayout(root);
// Generate only the metadata helper in the source tree; route HTML is build output.
const { mkdtemp, rm, mkdir } = await import('node:fs/promises');
const { tmpdir } = await import('node:os');
const temp = await mkdtemp(join(tmpdir(), 'joinjson-seo-'));
try {
  await mkdir(join(temp, 'assets'));
  await writeFile(join(temp, 'index.html'), await readFile(join(root, 'index.html')));
  await buildSeo(temp);
  await writeFile(join(root, 'assets/seo.js'), await readFile(join(temp, 'assets/seo.js')));
} finally { await rm(temp, { recursive: true, force: true }); }
console.log('Updated page metadata, accurate prose and source metadata helper.');
