# Homepage rendering performance

## Current fix: startup CLS and critical stylesheet requests

The supplied report identifies `.merge-section` with CLS 0.488. The input
container was empty in the response, and the inline controller created both input
cards only after the browser could paint. On a streamed/throttled connection this
pushed the Merge and Result sections down. Unthrottled local runs hid the problem.

Changes:
- Render both complete input cards in `index.html` before JavaScript. The existing
  controller reuses those nodes and preserves early typed input. All IDs, controls,
  validation, merge rules, advertisements and consent behavior remain unchanged.
- In production, inline and minify the six local homepage stylesheets in their
  original cascade order. The generated tool-route pages inherit these styles.
  This removes six render-blocking CSS requests without a late style swap, a
  flash of unstyled content, or changing the final design. Source files stay
  separate and readable. Tradeoff: styles travel with the HTML rather than being
  cached independently on these routes.
- Cache the existing, unversioned favicon for 30 days instead of one day in both
  hosting configurations and the security-header generator. Do not mark this
  unversioned asset immutable; when changing it, change its URL to invalidate
  existing browser caches.
- Add pre-JavaScript markup, hydration, production CSS-order and cache tests.
  Extend browser diagnostics with shift sources, optional network throttling and
  a CLS <0.1 assertion. Scope the merger browser test to its own input cards.
  Fix a pre-existing unit-test timing issue: validation plus live-render debounce
  exceeded its fixed 260ms wait; wait for output instead. No tool timing changed.

Measured in isolated local Chrome at 390×844, cold cache, 4× CPU slowdown,
150ms emulated latency and 1.6Mbps download (three samples per version):

| Metric | Previous production-style HTML | Updated production HTML |
| --- | --- | --- |
| CLS | 0 / 0.499 / 0.499 | 0 / 0 / 0 |
| LCP | 1012 / 908 / 904ms | 488 / 476 / 524ms |
| Render-blocking external CSS requests | 6 | 0 |

The comparison uses minified previous committed homepage HTML and the new build,
with the same current local assets. Measurements are diagnostics, not Lighthouse
scores or field Core Web Vitals. The local Python server does not emulate CDN
compression or production caching. Different runs were not concurrent. Actual
production gains are **UNVERIFIED** until deployment and a clean-browser audit.

Browser regression checks passed at 320, 375, 768 and 1440px, covering all three
input modes, keyboard merge, real background-worker execution, advertisement
visibility, reserved ad height and control clearance. Existing local stylesheet
edits were preserved.

Validation: production build passed; 40 focused tests passed; the built-site SEO
audit passed for all 16 pages. The full `npm test` chain stops at the existing
advertising test that expects zero external script elements (there are 19,
including local tool scripts and existing analytics). Ad behavior was not changed.
The remaining suites after that stop were not run through the full chain.

The reported `chrome-extension://` scripts belong to an installed extension, not
this site's payload. Do not modify site logic to address their minification.
Repeat Lighthouse in a fresh profile with extensions disabled. The new Lighthouse
score, live cache headers, deployed CLS and real-user INP are **UNVERIFIED**.

Reproduce with Node 20.6+:

```sh
npm run build
npm run test:audit
SITE_DIR=public THROTTLE_NETWORK=1 PERF_REPORT=/tmp/joinjson-performance.json npm run test:performance
SITE_DIR=public node tests/three-step-browser.mjs
```

Set `PERF_BASELINE=1` only when diagnosing an older build to report its CLS without
failing the new threshold assertion.

## Historical measurements (prior site version; not current results)

## Diagnosis

The reported 241 elements, depth 12 and maximum 14 children are a modest DOM, not evidence of excessive DOM size. The supplied report's 2,010 ms element render delay and 3,468 ms of unattributed main-thread work need a deployed Chrome/Lighthouse trace to establish their full cause. Local measurements cannot identify that production work or guarantee a Lighthouse score.

## Changes

- Apply the small inline editorial stylesheet normally instead of switching its media from print to all during JavaScript startup. This avoids a startup stylesheet invalidation and works without JavaScript.
- Remove the now-unnecessary duplicate noscript stylesheet.
- Use content-visibility: auto with a remembered intrinsic block-size on the three below-the-fold editorial sections. Their full content stays in the DOM for search, browser Find and accessibility. Offscreen layout and paint can be skipped; unsupported browsers render normally.
- Retain the existing system fonts, dependency-free tool, debounced validation, bounded preview, lazy merge worker and disabled/consent-gated advertising.
- Regenerate minified/readable exports and CSP hashes for the changed inline script.
- Preserve all controls, merge rules, guide text, FAQ schema and preview/export behavior. Do not delete semantic elements or hide content to chase a DOM count.

## Verification

51 automated tests pass. Chrome production checks pass at 320, 375, 768 and 1440 px, including input methods, keyboard merge, actual background worker execution, ad gating and spacing. Performance checks also scroll to the deferred guide and verify its heading is rendered without horizontal overflow.

Three local production samples in an isolated Chrome run: LCP 416/52/44 ms, CLS 0/0/0, observed long-task blocking 0/0/0 ms. Conditions: 390x844, cold resource cache on each navigation, 4x CPU slowdown, no network throttling. These are local diagnostic measurements, not Lighthouse scores or field Core Web Vitals. Chrome startup and OS cache make the first navigation different from subsequent navigations.

Baseline first navigation under the same nominal conditions: LCP 484 ms, render delay 467 ms, one 339 ms long task (289 ms above the 50 ms threshold). Optimized production first navigation: LCP 416 ms, render delay 343 ms, no observed long tasks. This small sample is noisy and does not establish a guaranteed production gain.

Production page: 57,040 bytes; gzip 17,133 bytes; Brotli 14,823 bytes. It makes no startup font, editor library, analytics or ad requests in the default configuration.

## Reproduce

Use Node 20.6+ (the default shell on this machine is Node 12).

```sh
npm test
npm run build
SITE_DIR=public npm run test:performance
SITE_DIR=public node tests/three-step-browser.mjs
```

Optional: set PERF_REPORT to a local JSON output path to save measurements. Browser checks require Google Chrome on macOS and use local ports 8793/9253 for performance and 8791/9251 for layout.

After deployment, rerun mobile Lighthouse at least three times against the exact production URL, without extensions and under identical throttling. Check the LCP element and Performance trace for the remaining unattributed work. Verify the new deployment and its CSP headers are active. Aim for LCP <2.5 s, CLS <0.1 and field INP <200 ms; no production score or INP result is claimed here.
