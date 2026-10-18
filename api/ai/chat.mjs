import { createRequestHandler } from '../../server/ai-server.mjs';

// Vercel supplies secrets at runtime; nothing is injected into the static site.
export function createVercelHandler({ env = process.env, fetchImpl = fetch } = {}) {
  const handlers = new Map();
  return async (req, res) => {
    const host = req.headers.host;
    if (typeof host !== 'string' || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
      res.statusCode = 400;
      res.end('Invalid host');
      return;
    }
    const origin = env.AI_ALLOWED_ORIGIN || `https://${host}`;
    // Keep per-instance limits across warm invocations. Restrict origins to the
    // current deployment unless an explicit production origin was configured.
    if (!handlers.has(origin)) {
      if (handlers.size >= 10) { res.statusCode = 503; res.end('Unavailable'); return; }
      handlers.set(origin, createRequestHandler({
        env: { ...env, AI_ALLOWED_ORIGIN: origin }, fetchImpl,
        // This is a public assistant, not an authenticated/private API.
        // Enable Vercel Firewall rate limits and provider spending limits.
        requireAccessControl: false
      }));
    }
    // Read the raw body so the shared handler can enforce its byte limit.
    return handlers.get(origin)(req, res);
  };
}

export const config = { api: { bodyParser: false } };
export default createVercelHandler();
