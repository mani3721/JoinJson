# JoinJson header redesign

## Implementation and full source

- `scripts/header.mjs`: complete HTML renderer, icons, groups, descriptions and the single `FLAT_TOOL_LINKS` flag. Set it to `true` and supply the remaining one or two tool entries when fewer than three tools are published; rerun the shared-layout script. It renders real flat links at build time, not JavaScript-injected links.
- `index.html` and all ten secondary pages: complete rendered header HTML.
- `assets/header.css`: complete responsive header styles; loaded after legacy styles.
- `assets/header.js`: complete disclosure/sheet behavior, no libraries (1,806 bytes gzip at implementation time).
- `assets/theme.js`: existing preference store retained; header button now cycles System → Light → Dark → System and updates its accessible name, native title and visible-on-focus/hover text tooltip.
- `scripts/shared-layout.mjs`: renders the same header into every source/output page and preserves the existing footer.

Re-render with Node 20.6+:

```sh
node scripts/shared-layout.mjs
node --test tests/tool-menu.test.mjs tests/theme-toggle.test.js tests/tool-routes.test.mjs
node tests/header-browser.mjs
```

Browser checks require locally installed Chrome and Python 3. The default shell here resolves an obsolete Node 12; validation used `/opt/homebrew/opt/node@22/bin/node` (reports Node 23.11).

## Final information architecture

| Location | Group | Link / control | Destination |
| --- | --- | --- | --- |
| Header | Brand | JoinJson | `/` |
| Tools | Merge and compare | JSON Merger | `/` |
| Tools | Merge and compare | JSON Diff and Compare | `/json-diff` |
| Tools | Convert | JSON to YAML | `/json-to-yaml` |
| Tools | Generate code | JSON to TypeScript | `/json-to-typescript` |
| Tools | Generate code | JSON to Pydantic | `/json-to-python` |
| Tools | Generate code | JSON to Zod | `/json-to-zod` |
| Guides | Guides | Merge JSON files in Python | `/merge-json-files-python/` |
| Guides | Guides | Merge JSON arrays by ID | `/merge-json-arrays-by-id/` |
| Guides | Guides | Deep vs shallow merge | `/deep-merge-vs-shallow-merge-json/` |
| Header / mobile sheet | Theme | System / Light / Dark cycle | Button, existing local theme preference |
| Footer | Site information | About US | `/about/` |
| Footer | Site information | Contact US | `/contact/` |
| Footer | Site information | Privacy Policy | `/privacy/` |
| Footer | Site information | Terms of use | `/terms/` |

The unchanged footer also retains Home and Disclaimer. Header contains ten links total including the logo. The existing standalone cURL converter is not included in the requested header IA; its page is not removed. JSON Diff has an existing deployment rewrite and scripts, but its actual tool markup is missing in the supplied homepage; see known limitations below.

## Changelog

- Replaced form-like Tools selector with button-based disclosure navigation; retained existing JavaScript IDs (`tool-menu`, `tool-panel`, `tool-current`, `theme-toggle`).
- Reorganized six tools into three sentence-case groups; removed the mixed category and cURL entry from this menu. No coming-soon entry.
- Added consistent decorative 20px, 1.8-stroke inline SVGs and single-line descriptions. Desktop rows use two equal columns; code generation occupies the right column so top rows and group headings align.
- Added neutral current-page accent bar and underlined title, distinct from hover fill and inset keyboard focus ring.
- Unified 44px controls and link styling; removed Privacy from primary navigation; existing footer already contains all requested informational links.
- Added solid sticky 64px desktop / 56px mobile shell, anchor offsets, viewport-shifted panels, max-height scrolling and inherited palette/radii/shadow/spacing tokens. No font/library dependencies or header animation.
- Added hover intent (120ms / 200ms), click/native keyboard activation, Escape, outside click, focus departure, one-open-at-a-time and route-event closure.
- Added under-860px modal sheet with accordions, visible Close, safe-area padding, inert background, focus containment/restoration and body scroll lock.
- Extracted old navigation-only handling from the tool router into the shared header. Conversion, route selection and data transfer logic remain unchanged.

## Automated validation

`tests/tool-menu.test.mjs` covers click toggling, expanded state, Escape/focus return, outside click, focus departure/internal focus, mutual exclusion, route selection, hover timing, flat configuration, mobile focus/scroll isolation, shared HTML destinations/icons/footer and gzip budget. `tests/theme-toggle.test.js` covers three-state cycling, saved preference, system changes and blocked storage.

`tests/header-browser.mjs` checks home and About at 320, 375, 768, 1024 and 1440 CSS pixels, both themes: header dimensions, panel viewport bounds, horizontal overflow inside navigation, single-line title fit, computed text/focus contrast and mobile dialog state; native Enter/Space/Escape and focus departure. Machine output is `header-browser-report.json`. Existing page-wide overflow is recorded separately, not repaired outside this scope.

Target contrast: normal text ≥4.5:1, focus indicator ≥3:1. Computed Chrome ratios against the solid header/panel surface:

| Palette | Title text | Muted descriptions | Focus indicator |
| --- | ---: | ---: | ---: |
| Home light | 14.27:1 | 6.25:1 | 6.38:1 |
| Home dark | 13.90:1 | 8.31:1 | 8.26:1 |
| Article light | 12.70:1 | 5.74:1 | 6.22:1 |
| Article dark | 14.20:1 | 7.70:1 | 8.66:1 |

All exceed the relevant AA thresholds. These ratios cover default surface text/focus, not a whole-site accessibility audit.

Final results: 13/13 focused navigation/theme tests passed; 9/10 existing route tests passed (the missing Diff input prevents one transfer test). A separate 44-test regression run passed 39 tests and failed the four pre-existing Diff UI checks and legacy external-script ad assertion described below. Browser checks passed all 20 home/article × viewport × theme combinations, including title fit and zero page/panel horizontal overflow, plus real native Enter/Space/Escape activation and focus departure. No language-server diagnostics were reported in changed code/pages.

## Manual QA checklist (not yet human-verified)

- [ ] Keyboard only: Tab to Tools; Enter and Space toggle; Tab/Shift+Tab traverse links naturally. Focus is never trapped on desktop.
- [ ] Escape closes a disclosure and restores its trigger; in a sheet a second Escape closes the sheet and restores Menu. Visible Close also restores Menu.
- [ ] Move focus outside a disclosure, click outside, select a route, use browser back/forward; expanded state and current-page bar remain correct.
- [ ] Pointer: fast pass across trigger does not open; pause opens after 120ms; leave closes after 200ms unless focus remains inside. Click always works.
- [ ] VoiceOver + Safari or NVDA + Firefox: landmarks, button names/expanded state, group headings and normal links announced; current page announced; icons ignored; sheet announced as a named modal; background not reachable while open.
- [ ] At each of 320/375/768/1024/1440px, in light and dark: title/description fit, panel stays inside viewport, adequate targets, no header-induced horizontal scroll.
- [ ] At 200% browser zoom: responsive breakpoint, one-line labels, scrolling panels/sheet and focus ring remain usable; anchored content is below sticky header.
- [ ] System preference follows OS; explicit Light/Dark remain stable; cycle returns to System; tooltip names current/effective mode and next action. Test blocked storage.
- [ ] Mobile Safari/Chrome on actual devices: safe-area insets, address bar/virtual viewport changes, background scroll lock, no accidental navigation, sheet scroll position and focus return.
- [ ] Reduced motion enabled: no header animation. Theme initial paint has correct height before scripts execute.

## Five-task usability script

Start each task on `/`, reset theme and viewport as appropriate. Say: “Use the header to complete this task; tell me when you are finished.” Do not explain menu structure. Record elapsed seconds from task prompt to confirmed completion, errors, first click and assistance. Targets are proposed acceptance criteria, not measured participant results.

| Task prompt | Success criterion | Target | Actual time |
| --- | --- | --- | --- |
| Find JSON to TypeScript | Opens `/json-to-typescript` | ≤10 seconds | Not measured |
| Find the Python guide | Opens `/merge-json-files-python/` | ≤12 seconds | Not measured |
| Switch to dark mode | Theme preference explicitly Dark | ≤10 seconds | Not measured |
| Return to the JSON merger | Opens `/` via logo or Tools → JSON Merger | ≤8 seconds | Not measured |
| On a 375px screen, use the mobile menu to find JSON to Pydantic, then close it | Menu → Tools → correct route; reopen/Close returns focus to Menu | ≤15 seconds | Not measured |

Run with 5 representative users, including keyboard-only participation. Record median task time, completion rate, misclicks and perceived ease; investigate tasks exceeding target or requiring help.

## Known limitations / unverified

- No human screen-reader, visual, usability timing, 200% browser zoom or physical mobile Safari testing performed. Safe-area and iOS-specific scroll behavior need device QA.
- Deployment was not performed; host rewrite behavior is checked statically, not against production.
- JSON Diff route exists in deployment configuration and scripts, but `json-diff-tool` / `diff-input-a` markup is absent from the supplied homepage. This pre-existing problem causes four existing diff UI tests and one cross-tool transfer test to fail. Left unchanged because tool logic/content are explicitly out of scope.
- Existing ad test expects zero external script elements even though the supplied page already loads many. Adding a local navigation script is not an advertising/CMP request. Ad logic and consent behavior were not changed; that legacy assertion remains failing.
- Not every legacy suite was run. No claim of whole-site WCAG certification or measured CLS is made.
- Without JavaScript, all links are in the HTML but disclosure buttons cannot expand; this task requires server-rendered link presence, not a no-script interactive replacement.
