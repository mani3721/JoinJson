# Cohere AI Help

AI Help uses `COHERE_API_KEY` without asking visitors for a key. The key stays private and is never added to HTML, JavaScript bundles, or browser storage.

## Vercel deployment (no separate backend required)

1. In Vercel Project Settings → Environment Variables, set `COHERE_API_KEY` for the deployment environment (Production and/or Preview).
2. Optionally set `COHERE_MODEL` to a model your account supports. The default is `north-mini-code-1-0`.
3. Redeploy after changing environment variables. Existing deployments do not receive updated values automatically.
4. Configure Vercel Firewall rate limits and Cohere account spending limits before exposing AI Help publicly.

Vercel automatically deploys `api/ai/chat.mjs` as a serverless function alongside the static site. No separately hosted server is necessary. Keep the repository root as the Vercel project root, the existing build command, and the `public` output directory.

The request flow is:

```text
Browser → /api/ai/chat (Vercel function)
        → https://api.cohere.ai/compatibility/v1/chat/completions
```

The function attaches the private environment key as Bearer authorization and streams Cohere's response. A static browser page cannot read `.env` or Vercel's private environment variables. Calling Cohere directly from the browser with a shared key would expose it to every visitor; do not use public/frontend environment variables for this key.

The function accepts same-origin JSON requests, validates and limits conversation size, and enforces per-instance request/concurrency limits. These limits are not distributed or authentication: public clients can forge Origin headers, and limits reset across cold starts/instances. Use Vercel Firewall and provider spending controls for production abuse protection. Optionally set `AI_ALLOWED_ORIGIN=https://www.joinjson.com` to pin the allowed origin; omit it for automatic per-deployment origin handling, including previews.

A missing key returns 503. Invalid/provider-denied credentials or an unsupported model return a generic provider error without revealing secrets. Requests use temperature 0.3, streaming, and a 2,048-token output limit. Workspace JSON is never attached automatically.

## Local development

Use Node.js 20.6 or newer. Copy `.env.example` to `.env`, set `COHERE_API_KEY`, install dependencies, and run `npm start`. Open `http://localhost:3000`, not a static-only preview server. Alternatively, use `vercel dev` with the matching Vercel environment configuration.

`.env` and `.env.*` are ignored by Git except the empty `.env.example` template. Never commit keys. Rotate any key previously exposed in source or Git history.

The standalone Node server retains its production access-control guard: configure `AI_ALLOWED_ORIGIN` and set `AI_ACCESS_CONTROLLED=true` only after authentication is enforced at your reverse proxy. The Vercel public-assistant function does not require this flag and relies on your deployment-level abuse controls.

Run `npm run test:ai` for mocked provider and Vercel-function coverage. Tests do not call the live provider or incur billing.
