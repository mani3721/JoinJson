# Cohere coding assistant

The browser now posts directly to `https://api.cohere.ai/compatibility/v1/chat/completions`, including the model, streaming settings, conversation and Bearer authorization. On first send it prompts for your own replacement API key, kept only in page memory. New chat, Clear data or reload clears the key; a 401 also clears it so you can retry with a replacement. No key is embedded in source or saved to browser storage. Browser scripts can still access a key used by the page. Workspace JSON is never attached automatically.

Static preview on port 5500 can use this mode, but Cohere must allow your origin and authorization headers via CORS. If it does not, use a backend proxy instead; browser code cannot bypass CORS. Server-side `.env` variables cannot be read by a static page. The optional backend below remains available but is no longer called by the chat UI; using it requires changing the browser endpoint back to `/api/ai/chat` and removing browser-side authorization and model settings.

## Local setup

1. Revoke the exposed Cohere key and generate a replacement.
2. Install Node.js 20.6 or newer.
3. Run `cp .env.example .env` in the project root.
4. Edit `.env` and set `COHERE_API_KEY` to the replacement key.
5. Run `npm install`, then `npm start`.
6. Open `http://localhost:3000`, not the static preview on port 5500.

`npm start` loads `.env` using Node's native environment-file support. Existing environment variables take precedence. `.env` and `.env.*` are ignored by Git; only the empty `.env.example` template is tracked. The backend does not serve environment files. Never put secrets in browser scripts, frontend environment variables, or generated bundles.

Requests use `north-mini-code-1-0`, temperature 0.3, streaming, and a 2,048-token output limit. Your account needs access to that model. Responses are plain text and are never executed or applied. JSON merging remains local.

## GitHub push protection

Removing the key from the latest files is not enough: it must also be removed from every commit being pushed. Amending only the latest commit does not remove a secret from an earlier commit. The two unpublished commits have been cleaned so the original key is no longer in the history of `main`; their commit IDs have changed. The browser continues to use a session-only key, while the optional backend reads its key from the ignored `.env` file.

After revoking the exposed key, reviewing the changes, and committing any additional working-tree changes, push normally:

```sh
git push origin main
```

No force push or GitHub protection bypass is needed for this unpublished branch. A local recovery bundle is stored at `.git/secret-cleanup-backup.bundle`. It contains the original sensitive history: keep it private, never upload it, and remove it after confirming the cleaned push succeeds. Old objects may also remain in local Git reflogs; they are not part of a normal push of the cleaned `main` branch.

For an already-shared branch, coordinate history cleanup before rewriting commits; do not force-push blindly. Rotate the key even after cleaning history. Check `git check-ignore .env` before adding files, and never use `git add -f .env`.

## Deployment

Static-only hosting cannot keep a shared API key secret. Deploy the Node backend or an equivalent serverless proxy, and route `/api/ai/chat` to it on the site's origin. Configure the replacement key in your host's secret/environment settings. Use HTTPS and authenticated access at the reverse proxy, plus per-user quotas, to prevent public use of your account's quota. Server IP rate limits alone are not authentication.

For production set `NODE_ENV=production`, `AI_ALLOWED_ORIGIN=https://www.joinjson.com`, and `AI_ACCESS_CONTROLLED=true` only after authentication is actually enforced. The server refuses production requests without those settings. Bind `HOST` appropriately for your hosting platform.

Run `npm test` and `python3 tests/validate.py`. Tests mock Cohere; live access and billing are not tested.
