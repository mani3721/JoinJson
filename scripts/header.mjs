// Single build-time flag: set true when publishing fewer than three tools.
export const FLAT_TOOL_LINKS = false;
export const toolGroups = [
  ['Merge and compare', [
    ['/', 'merge', 'JSON Merger', 'Combine files, keep every record', 'M4 5h6v6H4zM14 13h6v6h-6zM14 5h6M17 2v6M4 16h6'],
    ['/json-diff', 'json-diff', 'JSON Diff and Compare', 'See every change side by side', 'M4 4h6v16H4zM14 4h6v16h-6zM6 8h2M16 8h2M16 12h2']
  ]],
  ['Convert', [
    ['/json-to-yaml', 'json-to-yaml', 'JSON to YAML', 'Convert YAML and JSON both ways', 'M4 8h16M16 4l4 4-4 4M20 16H4M8 12l-4 4 4 4']
  ]],
  ['Generate code', [
    ['/json-to-typescript', 'json-to-typescript', 'JSON to TypeScript', 'Create typed interfaces from JSON', 'm8 5-6 7 6 7M16 5l6 7-6 7M14 3l-4 18'],
    ['/json-to-python', 'json-to-python', 'JSON to Pydantic', 'Build validated Python models', 'M8 4H5v16h3M16 4h3v16h-3M10 8h4v8h-4z'],
    ['/json-to-zod', 'json-to-zod', 'JSON to Zod', 'Generate runtime validation schemas', 'm12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7zM8 12l3 3 5-6']
  ]]
];
const svg = path => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
function toolLink([href, tool, title, description, icon]) {
  return `<li><a class="nav-tool" href="${href}" data-tool="${tool}">${svg(icon)}<span class="nav-copy"><span class="nav-title">${title}</span><span class="nav-description">${description}</span></span></a></li>`;
}
export function renderHeader({ flatTools = FLAT_TOOL_LINKS, groups = toolGroups } = {}) {
  const tools = groups.map(([title, items]) => `<section class="nav-group"><h2>${title}</h2><ul>${items.map(toolLink).join('')}</ul></section>`).join('\n');
  return `<header class="site-header shared-header join-header" data-flat-tools="${flatTools}">
  <div class="header-inner">
    <a class="brand" href="/" aria-label="JoinJson home"><img src="/favicon.svg" width="32" height="32" alt=""><span>JoinJson</span></a>
    <button class="nav-control mobile-menu" id="site-menu-toggle" type="button" aria-expanded="false" aria-controls="site-navigation">Menu ${svg('M4 6h16M4 12h16M4 18h16')}</button>
    <div class="nav-shell" id="site-navigation">
      <div class="sheet-heading"><span id="sheet-title">Navigation</span><button class="nav-control" id="site-menu-close" type="button">Close ${svg('m6 6 12 12M18 6 6 18')}</button></div>
      <nav class="primary-nav" aria-label="Primary">
        <div class="nav-disclosure${flatTools ? ' nav-flat' : ''}" id="tool-menu">
          <button class="nav-control disclosure-trigger" id="tools-trigger" type="button" aria-expanded="false" aria-controls="tool-panel"${flatTools ? ' hidden' : ''}>Tools ${svg('m7 10 5 5 5-5')}</button>
          <span id="tool-current" class="layout-status">JSON Merger</span>
          <div class="nav-panel tools-panel" id="tool-panel"${flatTools ? '' : ' hidden'}>
${tools}
          </div>
        </div>
        <div class="nav-disclosure" id="guides-disclosure">
          <button class="nav-control disclosure-trigger" id="guides-trigger" type="button" aria-expanded="false" aria-controls="guides-panel">Guides ${svg('m7 10 5 5 5-5')}</button>
          <div class="nav-panel guides-panel" id="guides-panel" hidden><ul>
            <li><a href="/merge-json-files-python/">Merge JSON files in Python</a></li>
            <li><a href="/merge-json-arrays-by-id/">Merge JSON arrays by ID</a></li>
            <li><a href="/deep-merge-vs-shallow-merge-json/">Deep vs shallow merge</a></li>
          </ul></div>
        </div>
      </nav>
      <div class="theme-control">
        <button type="button" id="theme-toggle" class="nav-control theme-toggle" aria-label="System theme; switch to light mode" title="System theme; switch to light mode">${svg('M8 3h8M12 3v2M5 6l2 2M19 6l-2 2M3 12h2M19 12h2M5 18l2-2M19 18l-2-2M12 19v2M8 21h8M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0')}<span class="theme-toggle-label layout-status">System</span></button>
        <span class="theme-tooltip" role="tooltip" id="theme-tooltip">System theme; switch to light mode</span>
      </div>
    </div>
  </div>
</header>`;
}
