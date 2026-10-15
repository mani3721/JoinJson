# Import JSON from a URL

Quick mode: open **Load from URL** under either upload control, paste a public HTTPS URL, and select **Load JSON**. A successful response replaces that input and uses the existing format-check and auto-merge flow. Invalid JSON, errors, cancellation, or edits made while downloading leave the existing input unchanged.

Advanced mode: open **Add JSON from URL**, paste the URL, and select **Add JSON**. Each successful download adds a source to the ordered file list, with the same edit/reorder/remove controls as uploaded files.

**Use example URL (5 MB)** fills the URL field but does not download automatically:

https://microsoftedge.github.io/Demos/json-dummy-data/5MB.json

Requests are made directly from the browser. The source must enable CORS; the app does not bypass source access controls or use a proxy. Downloads omit cookies and the page referrer, require HTTPS, have a 20 MiB limit, and time out after 45 seconds. A source sees your request and IP address; avoid URLs containing secrets. JSON is never uploaded or saved by this feature. The deployment CSP permits HTTPS connections for user-selected sources.

Run URL-import validation with Node.js 20.6+:

```sh
node --test tests/json-url.test.mjs
```
