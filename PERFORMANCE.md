# Homepage rendering performance

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
