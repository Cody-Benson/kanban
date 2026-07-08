const { rateLimit } = require('express-rate-limit');

// Per-token rate limiting for agent (API-token) requests. Humans on the web
// UI are unthrottled for now (auth-endpoint limits are a Phase 4 item).
// Must run AFTER the auth middleware so req.actor is populated.
const agentRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `token:${req.actor.tokenId}`,
  skip: (req) => req.actor?.type !== 'agent',
  message: { error: 'Rate limit exceeded: 120 requests per minute per token' },
});

module.exports = { agentRateLimiter };
