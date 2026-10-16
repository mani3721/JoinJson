# cURL to Fetch / Axios

The standalone `curl-to-js.html` page is served at `/curl-to-js` by the Vercel rewrite. The build includes the page, synchronizes the homepage header/footer, and generates `assets/converter-page.css` from the homepage stylesheet so both use the same design tokens and editor cards.

- `assets/curl-to-js.js`: dependency-free, literal shell tokenizer, cURL request parser, and JavaScript generators. Commands are never executed.
- `assets/curl-to-js-ui.js`: live conversion, target selection, copy/download actions, and explicit JSON-body transfer.
- `assets/curl-merger-import.js`: reads and immediately removes the one-time payload on the merger page. Invalid payloads and transfers older than two minutes are discarded.

Supported options include request method, URL, headers, data/raw/binary bodies, ASCII Basic Auth, GET query data, and common non-content flags. Unsupported flags, shell expressions, local file references and multiple URLs are rejected. Fetch rejects GET/HEAD bodies. Axios keeps raw string bodies unchanged. Browser CORS and forbidden-header restrictions still apply. Generated snippets deliberately do not call the request function automatically.

Inputs and credentials are never sent anywhere by this tool. Only clicking **Extract JSON to Merger** writes the JSON body to localStorage; it is removed as soon as the merger reads it. If the merger is never opened, the stored value can remain until a later merger visit, which discards expired transfers. No request headers or Basic Auth credentials are transferred.

Validation: `npm run test:curl` and `npm run build` (Node 20.6+). The tool-menu suite also exercises existing tools and may expose unrelated missing tool markup in the current workspace.
