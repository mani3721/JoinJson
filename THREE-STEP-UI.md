# Standalone three-step JSON merger

The homepage is now entirely contained in `index.html`: markup, styles, and commented JavaScript, with no external runtime dependencies. Open it directly, use a static preview server, or deploy with the existing `npm run build` / Vercel configuration. URL loading needs browser fetch/CORS support; clipboard access requires a secure context (HTTPS or localhost).

## Workflow

1. Choose Paste, Upload, or From URL independently for First JSON and Second JSON. Only that method is shown. The tabs share the same underlying document, so switching methods does not discard content. Uploaded/imported JSON can be reviewed with **Edit loaded JSON**.
2. When both inputs are valid, select **Merge JSON** or use Ctrl/Cmd+Enter. The second input wins conflicts. Advanced options control nested object merging and array replacement/concatenation.
3. Review the result and changes relative to First JSON. Green marks added keys and amber marks overwritten values. Copy or download the complete JSON. Format uses two spaces.

Use **Try an example**, **Swap A ↔ B**, or **Clear all** to manage inputs. Find, Wrap, Format, and keyboard help are icon controls in each paste editor. Find is literal and case-insensitive. Tab always moves focus out of the editor; no escape sequence is needed.

## Safety and limits

- JSON is never saved by this page or sent to an application server.
- URL requests contact the source directly, omit credentials/referrers, require HTTPS and CORS, time out after 30 seconds, and enforce a 20 MB transfer limit.
- Uploads are limited to one `.json` file per panel, up to 20 MB.
- Failed or cancelled imports preserve the existing input. Changing inputs invalidates stale results.
- Nesting is limited to 120 levels. JSON parsing uses JavaScript numbers: keep large numeric identifiers as strings to preserve precision.
- For large results, preview is limited to 5,000 lines / 250,000 characters; copy and download always contain the complete result.
- Merging runs on the main browser thread. Large or wide documents may pause the UI; this standalone version does not retain the old worker integration.
- All JSON rendering uses text nodes. Null-prototype merge objects protect special keys such as `__proto__`.
- Shared host CSP hashes for this inline script are included in `_headers`. If editing the inline JavaScript, regenerate its SHA-256 hash in both script directives. Hosts that do not consume `_headers` require their own security header configuration.

## Intentional homepage changes

The Quick/Advanced workflow tabs, automatic merging, multiple-source ordering, ID-based joins, compare/conflict tabs, theme switcher, AI markup, and vendor-script hooks are no longer part of the homepage. This implements the requested focused, dependency-free two-input UI. Existing guides, assets, and optional backend are retained; legacy module tests use isolated fixtures. No secrets are included.

## Validation

Use Node.js 20.6+:

```sh
npm test
node tests/three-step-browser.mjs
npm run build
```

The browser check needs Google Chrome at the standard macOS application path and Python 3 for the temporary static server. It checks four viewport widths, all input methods, one visible method per panel, button target sizes, merge keyboard shortcut, focus, and changed-line rendering. Existing old-homepage browser scripts target the legacy UI and should not be used to validate this redesign.
