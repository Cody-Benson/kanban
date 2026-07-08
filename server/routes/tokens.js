const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// Token management is human-only: a leaked agent token must not be able to
// mint replacements or revoke others to cover its tracks.
router.use((req, res, next) => {
  if (req.actor.type !== 'human') {
    return res.status(403).json({ error: 'API tokens cannot manage tokens' });
  }
  next();
});

// GET /api/tokens — the user's active tokens (never expose token_hash)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, token_prefix, last_used_at, created_at
       FROM api_tokens
       WHERE user_id = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List tokens error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tokens — create a token; the plaintext is returned exactly once
router.post('/', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (name.length > 100) return res.status(400).json({ error: 'Name must be 100 characters or fewer' });

    const token = 'kbt_' + crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenPrefix = token.slice(0, 12);

    const result = await pool.query(
      `INSERT INTO api_tokens (user_id, name, token_hash, token_prefix)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, token_prefix, created_at`,
      [req.userId, name, tokenHash, tokenPrefix]
    );

    res.status(201).json({ ...result.rows[0], token });
  } catch (err) {
    console.error('Create token error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/tokens/:id — revoke (soft delete so activity_log keeps resolving
// the token's name)
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE api_tokens SET revoked_at = NOW()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING id`,
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Token not found' });
    }
    res.json({ message: 'Token revoked' });
  } catch (err) {
    console.error('Revoke token error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
