const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const { sendEmail } = require('../email');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  const client = await pool.connect();
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Every user gets an Inbox project — the default landing spot for
    // quick-captured tasks (e.g. created by an AI agent with no project named).
    await client.query('BEGIN');
    const result = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    );
    const user = result.rows[0];
    const inbox = await client.query(
      "INSERT INTO projects (name, created_by, is_inbox) VALUES ('Inbox', $1, TRUE) RETURNING id",
      [user.id]
    );
    await client.query(
      'INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [inbox.rows[0].id, user.id]
    );
    await client.query('COMMIT');

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Forgot password - send reset link via email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (result.rows.length > 0) {
      const userId = result.rows[0].id;

      // Invalidate existing tokens
      await pool.query(
        'UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false',
        [userId]
      );

      // Generate new token
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query(
        "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')",
        [userId, token]
      );

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
      try {
        await sendEmail({
          to: email,
          subject: 'Password Reset - Kanban Board',
          html: `
            <h2>Password Reset</h2>
            <p>You requested a password reset. Click the link below to set a new password:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>This link expires in 1 hour.</p>
            <p>If you didn't request this, you can safely ignore this email.</p>
          `,
        });
      } catch (emailErr) {
        console.error('Failed to send reset email:', emailErr.message);
        console.log('Password reset link:', resetUrl);
      }
    }

    // Always return success to prevent email enumeration
    res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset password using token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    const result = await pool.query(
      'SELECT * FROM password_reset_tokens WHERE token = $1 AND used = false AND expires_at > NOW()',
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const resetToken = result.rows[0];
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, resetToken.user_id]);
    await pool.query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [resetToken.id]);

    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me — return the authenticated user's basic info.
// AuthContext calls this on token rehydrate so pages can show the user's
// email; the JWT payload alone only carries `userId`.
router.get('/me', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, default_assignee_email FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/default-assignee — set (or clear) the email new tasks are
// auto-assigned to when the creator doesn't pick an assignee. Validates the
// email belongs to a registered user; pass empty/null to clear. Stores the
// canonical (matched) email so casing differences don't break lookups.
router.put('/default-assignee', auth, async (req, res) => {
  try {
    const email = (req.body.email || '').trim();
    if (!email) {
      await pool.query('UPDATE users SET default_assignee_email = NULL WHERE id = $1', [req.userId]);
      return res.json({ default_assignee_email: null });
    }
    const match = await pool.query(
      'SELECT email FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    if (match.rows.length === 0) {
      return res.status(400).json({ error: 'No registered user with that email.' });
    }
    const canonical = match.rows[0].email;
    await pool.query('UPDATE users SET default_assignee_email = $1 WHERE id = $2', [canonical, req.userId]);
    res.json({ default_assignee_email: canonical });
  } catch (err) {
    console.error('Set default assignee error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password (authenticated)
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.userId]);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
