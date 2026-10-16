# JoinJson

**Merge JSON files into one—directly in your browser.**

[Website](https://www.joinjson.com/) · [URL import guide](URL-IMPORT.md) · [Optional AI setup](AI-SETUP.md)

JoinJson is a browser-based JSON merger built with HTML, CSS, and JavaScript. Paste JSON, upload files, or import a public HTTPS URL, then join records by ID, combine lists, or deep-merge objects. Core JSON processing happens locally; no backend is required for merging.

## Features

- **Quick mode:** two inputs with automatic merging when both contain valid JSON.
- **Advanced mode:** multiple sources with editing, reordering, and configurable merge rules.
- **Join by key:** supports nested IDs such as `user.id` and record paths such as `data.items`.
- **Conflict handling:** choose earlier or later values and review conflicts with their source files.
- **List handling:** concatenate, deduplicate, or replace lists using the winner rule.
- **JSON editors:** syntax highlighting, validation, and Find controls powered by CodeMirror, with a fallback editor.
- **Export:** copy or download the merged JSON and export conflict reports as CSV.
- **URL import:** load JSON directly from public HTTPS sources with validation and cancellation.
- **Appearance:** system, light, and dark themes, responsive layouts, and reduced-motion support.
- **Optional AI:** streaming chat and Markdown rendering; the floating AI Help button is currently hidden.

## JSON to TypeScript

All available tools use clean URLs: `/` for JSON Merger, `/json-to-zod` for JSON to Zod Schema, and `/json-to-typescript` for JSON to TypeScript. Legacy `/?tool=json-to-zod`, `/?tool=json-to-typescript`, and `/?tool=merge` links automatically update to their clean paths without reloading, preserving other query parameters and fragments. Menu navigation and cross-tool actions use the same routes. Vercel serves direct visits and reloads for both converter paths; other static hosts should rewrite those paths to `index.html`.

Choose **Tool → Converters / Generators → JSON to TypeScript**, or open `/json-to-typescript`.

The converter reuses the Zod converter's two-pane CodeMirror layout and theme. Choose interface or type mode, make all properties optional (including nested properties), enable exports, and set a valid root name (default `Root`). Nested objects stay inline; mixed arrays use unions, empty arrays use `Array<unknown>`, and primitive/array roots use type aliases even in interface mode. Inference describes only the supplied sample, not unseen fields or runtime validation. Input is limited to 1 MB and 100 nested levels.

Copy or download the generated `.ts` file, or select **Convert to Zod Schema** to transfer the current JSON. The merger's **Convert Output to TypeScript** action transfers the complete merged result, not its potentially truncated preview. Conversion and transfers stay in memory in the current tab: no payloads in URLs, network calls, or browser storage. Switching tools preserves each workspace until cleared or the page is closed/reloaded.

Run `npm run test:typescript` for inference, options, validation, exports, routing, cross-tool transfers, menu, and CodeMirror integration tests.

## JSON to Python

Open `/json-to-python` or choose **🐍 JSON to Python (Pydantic)** in the tool menu. The shared two-pane editor generates Pydantic `BaseModel` classes or standard Python dataclasses, with optional nullable fields defaulting to `None`. Nested objects generate separate classes; mixed arrays use unions and empty arrays use `Any`. Python 3.9+ is required; Pydantic mode also requires the `pydantic` package. Dataclasses provide type hints, not runtime validation or automatic nested JSON deserialization.

Invalid or reserved field names are renamed safely: Pydantic uses `Field(alias=...)` and dataclasses store the source key in `field(metadata={"json_key": ...})`. Array and primitive roots use a `Root` class with a `value` field. Input is limited to 1 MB and 100 nested levels. Copy or download `models.py`, or use **Convert Output to Python** under the merger to transfer its complete result in memory, never via URL or storage.

Clean routes, trailing slashes, legacy `/?tool=json-to-python` links, history navigation, and direct visits work like the other converters. Vercel rewrites `/json-to-python` to the SPA; configure the equivalent fallback on other hosts. Run `npm run test:python` for conversion, Python syntax/runtime checks, UI actions, merger transfer, routes, and editor integration.

## JSON ⇄ YAML

Open `/json-to-yaml` or select **⚙️ JSON ⇄ YAML Converter** from the existing tool panel. The shared two-pane CodeMirror layout supports JSON ➔ YAML and YAML ➔ JSON, 2- or 4-space indentation, inline line/column errors, copy, and direction-aware `.yaml`/`.json` downloads. **Convert Output to YAML** transfers the complete merger output in tab memory and selects JSON ➔ YAML. Direct visits, trailing slashes, history navigation, and legacy `/?tool=json-to-yaml` links use the clean route; Vercel rewrites it to the SPA. Other static hosts need the same fallback.

Conversion uses `js-yaml` 4.3.2, pinned on jsDelivr with subresource integrity and an exact CSP script allowance. The CDN downloads only library code, never the JSON/YAML payload. A blocked/unavailable CDN produces inline feedback and disables exports. No payloads are uploaded, stored, or placed in URLs. The JSON-compatible YAML schema preserves date-like strings and rejects custom tags and multiple documents. Comments and formatting are not preserved. Cyclic aliases, non-finite numbers, input over 1 MB, depth over 100, and expansion over 100,000 values are rejected. YAML mode uses the shared editor without JSON-only lint/format controls.

Run `npm run test:yaml` for conversion, validation, actions, transfers, clean routes, menu, and editor regression coverage. The pinned development dependency lets these tests run without CDN requests.

## JSON Diff & Compare

Open `/json-diff` or select **🔍 JSON Diff & Compare** from the tool panel. The shared editable JSON panes support validation, Find, formatting, Swap Left/Right, and Clear Both (including editor undo history). Select **Compare JSON** to view additions (green), deletions (red), and modifications (yellow), with text labels, JSON pointer paths, and original/modified values. Object key order is ignored; arrays compare by position, not identity. Large reports display the first 500 changes with total counts.

**Compare Merged JSON** transfers the full merged result into the left editor without overwriting the right editor. Workspaces persist in tab memory while switching tools. Inputs are never uploaded, saved, or placed in URLs. The patched `jsondiffpatch` 0.7.6 library loads on demand from a version-pinned jsDelivr ES module allowed by the CSP; blocked loading produces a retryable inline message. Custom text-only rendering reuses site theme tokens instead of third-party colors and safely displays HTML-like keys. Each input is limited to 1 MB, 100 nested levels, and 100,000 values. Vercel rewrites direct visits to the SPA; other hosts need the equivalent fallback. Legacy `/?tool=json-diff` links update to the clean path.

Run `npm run test:diff` for semantic comparison, validation, safe rendering, UI controls, merger transfers, routing, and CodeMirror regression checks.

## Requirements

- **Node.js 20.6 or newer** and npm for builds, tests, and the optional Node server.
- A modern browser with JavaScript enabled.
- Python 3 for the optional local static server and page-validation script.

## Getting started

```sh
git clone https://github.com/mani3721/JoinJson.git
cd JoinJson
npm ci
npm run build
```

The homepage header and footer are the shared layout source for every page. After editing them, run `node scripts/shared-layout.mjs` to synchronize source pages. The build also synchronizes the deployed pages automatically. Shared navigation and footer styles live in `assets/site-layout.css`; the Guides dropdown works without JavaScript. Run `python3 tests/shared-layout.py` to check layout consistency.

The build bundles the CodeMirror editor and copies the deployable website into `public/` using an explicit file allowlist. Server code, dependencies, tests, Git history, and environment files are not copied.

After editing inline JavaScript or JSON-LD, run `npm run audit:headers` and commit both `_headers` and `vercel.json` before deployment. This refreshes the CSP hashes for readable and production-minified scripts without enabling unsafe inline JavaScript. The build also refreshes these files, but Vercel can read its routing configuration before the build starts, so deploy the updated `vercel.json` together with the page changes. Run `node --test tests/security.test.mjs` to detect stale hashes.

Serve the generated site locally:

```sh
python3 -m http.server 5500 --directory public
```

Open **http://localhost:5500**. Use an HTTP server rather than opening `index.html` as a local file.

## Usage

### Quick merge

1. Paste or upload JSON into **First JSON** and **Second JSON**.
2. Valid inputs merge automatically; the second input wins conflicts.
3. Review the result, then copy or download it.

Objects merge deeply. Lists of records join by a likely ID when detected; otherwise lists combine. Use Advanced mode for explicit rules.

### Join records by ID

For example, these two inputs:

```json
[{"id": 1, "name": "Ada"}]
```

```json
[{"id": 1, "role": "Developer"}]
```

produce this result when joined by `id`:

```json
[{"id": 1, "name": "Ada", "role": "Developer"}]
```

In **Advanced** mode, add your sources, select **Join records by key**, and set the ID key. Source order determines which value wins under the selected conflict rule.

For wrapped arrays, set a records path such as `data.items`. Joining returns the merged array, not the original wrapper. Numeric and string IDs are distinct, and literal dots in property names are not supported by dot paths. Store large numeric IDs as strings to avoid JavaScript precision loss.

### Import from a URL

Open **Load from URL** beneath either Quick input, or **Add JSON from URL** in Advanced mode. Paste a public HTTPS URL and select the load button.

Example:

```text
https://microsoftedge.github.io/Demos/json-dummy-data/5MB.json
```

The source must allow cross-origin browser requests (CORS). URL downloads have a **20 MiB limit** and a **45-second timeout**. Failed or cancelled downloads do not replace existing inputs. See [URL-IMPORT.md](URL-IMPORT.md) for details.

## Privacy and security

- Pasted and uploaded JSON is processed locally, not uploaded for merging.
- URL imports contact the selected source host, which can see your IP address. Requests omit cookies and the page referrer; avoid URLs containing secrets.
- Optional AI requests send chat content to Cohere. Workspace JSON is not attached automatically.
- Never commit API keys or embed shared credentials in browser scripts or frontend environment variables.
- `.env` and `.env.*` are Git-ignored, except for the safe `.env.example` template. Rotate any exposed key and remove it from affected Git history before pushing.

### Optional AI server

The current chat code calls Cohere directly and requests a session-only key when used. A static page cannot read a server-side `.env`; direct access also depends on Cohere allowing CORS. The AI launcher is currently hidden.

An optional Node server is included:

```sh
cp .env.example .env
# Edit .env locally to configure your own replacement COHERE_API_KEY.
npm start
```

Open **http://localhost:3000**. The server serves the site and provides `/api/ai/chat`, but the current chat UI does **not** use that proxy automatically. Switching to a shared server-side key requires updating the client request and enforcing production authentication and quotas. See [AI-SETUP.md](AI-SETUP.md) before enabling AI publicly.

## Deployment on Vercel

Import the GitHub repository into Vercel. The included `vercel.json` configures:

| Setting | Value |
| --- | --- |
| Framework preset | Other |
| Build command | `npm run build` |
| Output directory | `public` |

Use Node.js 20.6+ in the build environment. The build creates `public/`; do not commit that generated directory. Connect `joinjson.com` through your hosting provider's domain settings if you control the domain.

This configuration deploys the **static site only**. It does not deploy `server/ai-server.mjs` as a serverless function. Security-header configuration is host-specific: do not assume Vercel applies the included `_headers` file automatically.

## Development and validation

```sh
npm run build        # Bundle editors and create public/
npm test             # Editor, AI, and URL-import automated tests
npm run test:editors # Editor tests only
npm run test:ai      # AI tests only; no live Cohere calls
npm run test:urls    # URL-import tests only
```

Additional page checks are available with `python3 tests/validate.py`. That script currently scans every HTML file under the repository and expects only source pages, so generated `public/` pages can affect its results. It also checks CSP hashes; investigate validation failures rather than assuming a successful build covers them.

Browser-check scripts and additional merge, comparison, formatting, and worker tests are available in `tests/`; not every script is included in `npm test`.

### Project layout

| Path | Purpose |
| --- | --- |
| `index.html` | Main JSON merge interface |
| `assets/` | Browser scripts, styles, and generated editor bundle |
| `src/` | CodeMirror editor source |
| `scripts/` | Editor bundling and static-site packaging |
| `server/` | Optional local server and Cohere proxy |
| `tests/` | Automated tests, browser checks, and page audits |
| `public/` | Generated static deployment output, ignored by Git |
| Guide and legal directories | Supporting pages, privacy, and terms |

## Troubleshooting

- **Vercel cannot find `public`:** use `npm run build` and set the output directory to `public`.
- **Node reports unsupported options:** upgrade to Node.js 20.6+; `npm start` uses native `--env-file` support.
- **URL import fails:** check HTTPS, CORS permissions, JSON validity, size, and source availability. The app does not bypass CORS.
- **AI cannot connect:** verify the key, model access, and Cohere CORS support. A static server cannot handle `/api/ai/chat`.
- **GitHub blocks a secret:** revoke the key and remove it from every commit being pushed, not just the latest file. Do not bypass protection for a real credential.

## Contributing

Open an issue or submit a pull request with a focused description of the change. Preserve local-only merge processing, accessibility, theme support, and existing merge semantics. Add regression tests where relevant, run the build and tests, and never include credentials or private JSON samples.

## License

No project-wide license file is currently included. Do not assume permission to redistribute the project without checking with the owner. Third-party CodeMirror license notices are included in `assets/codemirror-LICENSE.txt`.
