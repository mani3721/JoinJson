# Optional Cohere coding assistant

The popup sends POST requests directly to `https://api.cohere.ai/compatibility/v1/chat/completions`, not `/api/ai/chat`. It works from a static host only if Cohere permits browser requests through CORS. The CSP allows connections to `https://api.cohere.ai`.

The popup uses the key configured in `assets/ai-assistant.js` and does not ask visitors for a key. This key is embedded in public JavaScript: anyone can inspect and reuse it, potentially consuming the account's quota. Direct browser calls cannot keep credentials secret. Do not deploy this shared-key configuration publicly; use a server-side secret for production and rotate exposed keys.

Requests use `north-mini-code-1-0`, temperature `0.3`, streaming, and a 2,048-token output limit. Your account needs access to that model. Sending requires explicit consent. JSON context is off by default. Each question is independent; responses are plain text and never executed or applied. Local JSON merging remains offline.

Open the floating AI Help button, enter a question, and approve sending. Closing preserves the draft and response. Stop cancels a request; Clear (or Clear JSON inputs and results) removes AI text and resets consent and context, but does not remove the configured key. No AI history is saved.

Serve the project using your static preview server, or use Node 20+ and `npm start` at `http://localhost:3000`. The included server retains its optional `/api/ai/chat` proxy for compatibility, but the popup does not use it or its environment key. A CORS failure cannot be fixed with `no-cors`; use a server proxy if Cohere does not support your browser origin.

Run `npm test` and `python3 tests/validate.py`. Tests mock Cohere: live model access, browser CORS, and billing are not tested.
