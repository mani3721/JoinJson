# JoinJson homepage audit

Scope: the existing homepage in `index.html`, its production packaging, metadata, and hosting headers. The visual layout, colors, input methods, merge rules, downloads, and ad-consent defaults are preserved. Other pages' shared CSS and legacy modules are not deleted: they are used by guides, fixtures, or the optional backend. Existing uncommitted work was preserved.

## 1. Findings and fixes

### SEO

| Severity | Finding | Resolution |
|---|---|---|
| Medium | Homepage title (33 characters) and description (118 characters) were short; Twitter, robots and theme-color metadata were missing. | Unique 50-character title and 151-character description with “merge JSON”; robots, theme-color, Twitter summary card, OG site name and locale added. Existing canonical, language, viewport and H1 preserved. |
| Medium | No homepage WebApplication or FAQ structured data. | Added WebApplication and FAQPage with the five visible questions and exact visible answers. No invented ratings or claims. Rich-result eligibility is determined by Google; FAQ rich results are generally restricted to authoritative government/health sites. |
| Low | Sitemap used a blanket last-modified date rather than verified content timestamps. | Removed unverified dates; sitemap remains valid. Add accurate lastmod values only when reliably maintained. |
| Low | Full-width sections already have labels; decorative logo already has empty alt and dimensions. | Preserved semantics, heading hierarchy, skip link, labeled icons, keyboard focus and labels. Do not add redundant logo alt beside its wordmark. |

### Performance and security

| Severity | Finding | Resolution |
|---|---|---|
| High | Large merges, change analysis and preview generation ran on the UI thread. | Inputs totaling at least 256 KiB use a lazily created Blob worker for parsing, merge, change analysis, serialization and bounded preview data. Pending jobs are terminated on edits/clear/options changes. Small inputs retain synchronous behavior. Worker-unavailable browsers keep the original synchronous fallback. |
| High | Inline CSP hashes no longer covered the homepage; Vercel does not interpret `_headers`. | Reproducible source/production hash synchronization; equivalent security headers in `vercel.json`; generated `_headers` covers deployed scripts. No unsafe-eval or external worker dependency. |
| Medium | No production homepage CSS/JS minification. | esbuild minifies embedded CSS and executable JS during build. JSON examples and prose are not rewritten. Worker-shared binding names are deliberately preserved because worker source uses function serialization. |
| Medium | Editorial CSS blocked initial tool rendering. | Critical tool CSS remains inline. Editorial CSS starts with print media and is enabled by end-of-body code. Noscript fallback preserves the editorial layout without JavaScript. No external stylesheet request. |
| Medium | Line counting split the complete source into an array on every input. | Bounded newline scan avoids that allocation. Existing 180 ms validation debounce remains. |
| Low | Unnecessary editor/font/analytics loading would be wasteful. | Homepage already uses native textareas and system fonts, without remote font, editor, analytics, or icon-library requests. Nothing new is preloaded. Consent-gated ad loader remains disabled and lazy. |

Remaining performance limits: large-file live validation and import validation still run on the main thread after debounce; constructing the bounded 5,000-line DOM and copying/downloading full outputs still consume time and memory. A worker improves merging, not every possible interaction. Worker creation can fail on restricted browsers; failures are announced without stale results. No field CWV results or Lighthouse score are claimed.

### Redundant code

| Severity | Finding | Resolution |
|---|---|---|
| Low | `.editor-note`, `.editor-note a`, and `.url-notice` matched neither static nor generated content. | Removed after checking dynamically generated cards. |
| Low | Repeated hidden-ad and mobile minimum-height/margin declarations. | Removed; shared hidden rule and base ad sizing apply. |
| Low | Format-result repeated serialization of an already pretty-printed value. | Preserved button and announcement, removed redundant work. Worker output is already identically formatted. |
| Low | Ad script wrote an inline display style. | Replaced by scoped `.ad-mount .adsbygoogle` rule. |
| Low | No unused external fonts, libraries, console logging or duplicate listeners were found in the active homepage. | Kept working event handlers and dynamic-state selectors; did not remove controls or wrappers needed by grid, editor gutters, tabs, focus, or accessibility. |

Theme colors already use CSS custom properties. A broad renaming of classes or spacing tokens would add churn without a demonstrated performance benefit. Shared legacy styles remain untouched rather than risking other routes.

## 2. Size comparison

See `audit/sizes.json` for exact bytes and compression measurements. Units below are KiB (1,024 bytes); HTML is markup/content/JSON-LD excluding CSS and executable JS. CSS includes the deliberate no-JavaScript editorial fallback.

| Component | Before | Readable after | Production after |
|---|---:|---:|---:|
| HTML/content | 13.33 | 16.64 | 16.64 |
| Embedded CSS | 12.96 | 16.95 | 13.50 |
| Executable JS | 30.14 | 33.69 | 26.59 |
| Full standalone page | 56.44 | 67.28 | 56.73 |
| gzip, level 9 | 17.04 | 17.76 | 16.74 |
| Brotli | 14.61 | 15.20 | 14.48 |

The full uncompressed page grows slightly because structured data and a real worker were added. Compression yields a modest transfer saving, not a dramatic reduction. The readable version favors maintainability rather than byte count. Do not add HTML/CSS/JS subtotals to compressed totals.

## 3. Full cleaned source and reproducible outputs

- `index.html`: full readable standalone HTML/CSS/JS; no external runtime dependency.
- `audit/index.readable.html`: portable readable copy.
- `audit/minified/index.html`: complete standalone version with minified CSS/JS, not minified prose.
- `audit/home.css`, `audit/home.js`: extracted readable source for inspection (not extra dependencies).
- `audit/home.min.css`, `audit/home.min.js`: extracted production source.
- `audit/sitemap.xml`, `audit/robots.txt`: domain-specific templates, also present at the project root.
- `public/index.html`: production build copy.

Regenerate with `npm run audit:headers`, `npm run audit:export`, and `npm run build` using Node 20.6+. Re-run header synchronization after edits to inline scripts, structured data, or the minifier, and commit the updated `vercel.json` and `_headers` before deployment. Audit copies are not published by the build allowlist. The ignored `.audit-baseline/` directory preserves the measured original locally. `scripts/optimize-home.mjs` is the one-time migration record; do not rerun it after editing the homepage.

### URL structure

Keep existing canonical routes rather than migrating unnecessarily:

- Tool: `https://www.joinjson.com/`
- Homepage guide: `https://www.joinjson.com/#merge-guide`
- Detailed guide: `https://www.joinjson.com/deep-merge-vs-shallow-merge-json/`
- About: `https://www.joinjson.com/about/`
- Contact: `https://www.joinjson.com/contact/`
- Privacy: `https://www.joinjson.com/privacy/`
- Terms: `https://www.joinjson.com/terms/`

Use lowercase descriptive slugs, trailing slashes consistently, and permanent redirects for any actual route migration. Do not create an indexable duplicate `/guide/` with the same article. Sitemap includes canonical pages only, not fragments, audit exports or minified copies.

## 4. Manual release checklist

- [ ] Deploy over HTTPS; redirect www to the chosen apex domain. Check canonical URLs after redirects.
- [ ] Verify the deployed CSP hashes, worker-src blob:, MIME types, no-referrer and security headers. Vercel uses `vercel.json`; Netlify-style hosts use generated `public/_headers`. No live ad hosts are allowed by default.
- [ ] Let Vercel/CDN negotiate Brotli or gzip for HTML/CSS/JS/SVG. Do not manually send a Content-Encoding header without an actually compressed response. On Nginx enable gzip/brotli and Vary: Accept-Encoding for these types.
- [ ] Keep HTML revalidated; keep the current one-hour asset cache with revalidation. Do not use year-long immutable caching until asset names are content-hashed. Purge CDN caches after release.
- [ ] Run PageSpeed Insights on the production mobile and desktop URLs. Target 75th-percentile LCP <2.5s, CLS <0.1, INP <200ms; field results require real traffic and time.
- [ ] Run Lighthouse with cold cache and mobile throttling. Record metrics, version, device and network profile; do not treat a local fast machine as a CWV guarantee.
- [ ] Exercise paste/upload/URL, malformed input, 5–20 MB files, keyboard merge, wrap/find, clear during worker jobs, copy and download on a low-end phone.
- [ ] Inspect layout shifts after a successful merge and on subsequent edits. Hidden-to-visible ad placeholders still change document flow by design; reserved heights prevent creative-loading shifts, not all eligibility shifts.
- [ ] Verify AA contrast, visible focus, screen-reader status announcements, zoom to 200%, tab order and mobile touch targets. Real-browser checks cover four widths and 44px buttons, not a complete WCAG certification.
- [ ] Use Google's Rich Results Test and Schema Markup Validator; FAQ markup alone does not guarantee FAQ search features.
- [ ] Verify ownership in Search Console, submit `/sitemap.xml`, inspect the homepage and key routes, and monitor indexing/CWV reports. Check robots.txt and HTTP status codes.
- [ ] Configure real monitored contact details, approved publisher information and a Google-certified CMP before enabling advertising. Do not bypass consent or relax CSP broadly. Ads/analytics can inspect DOM data; review privacy isolation before enabling vendors on the tool origin.

## Validation

All 49 automated tests pass, including new SEO/FAQ and real Node-worker checks against readable and minified builds; existing merge/import/editor/AI/ad tests remain covered. Production build succeeds. Real Chrome checks exercise four widths, single visible input method, 44px controls, merge behavior, full-width bounded preview, ad spacing/visibility, and actual background-worker execution. Deployment CWV, Search Console and full assistive-technology testing remain manual.
