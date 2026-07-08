const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');

// Accepts either a session JWT (web app) or a personal API token (AI agents,
// prefix "kbt_"). Both resolve to req.userId; req.actor records who is acting
// so the activity log can distinguish humans from agent tokens.
async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.split(' ')[1];

  if (token.startsWith('kbt_')) {
    try {
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const result = await pool.query(
        'SELECT id, user_id, name FROM api_tokens WHERE token_hash = $1 AND revoked_at IS NULL',
        [hash]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid or revoked token' });
      }
      const row = result.rows[0];
      req.userId = row.user_id;
      req.actor = { type: 'agent', tokenId: row.id, tokenName: row.name };

      // Throttled usage stamp: at most one write per token per minute, never
      // awaited and never fatal.
      pool
        .query(
          `UPDATE api_tokens SET last_used_at = NOW()
           WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL '60 seconds')`,
          [row.id]
        )
        .catch(() => {});

      return next();
    } catch (err) {
      console.error('API token auth error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.actor = { type: 'human' };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = auth;
