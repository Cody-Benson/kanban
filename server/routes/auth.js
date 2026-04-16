const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const { sendEmail } = require('../email');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
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
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Auto-accept any pending org invites for this email
    const pendingOrgInvites = await pool.query(
      'SELECT * FROM org_invites WHERE email = $1',
      [email]
    );
    for (const invite of pendingOrgInvites.rows) {
      await pool.query(
        'INSERT INTO org_members (org_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [invite.org_id, user.id]
      );
      await pool.query('DELETE FROM org_invites WHERE id = $1', [invite.id]);
    }

    // Auto-accept any pending team invites for this email
    const pendingInvites = await pool.query(
      'SELECT * FROM team_invites WHERE email = $1',
      [email]
    );
    for (const invite of pendingInvites.rows) {
      await pool.query(
        'INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [invite.team_id, user.id]
      );
      await pool.query('DELETE FROM team_invites WHERE id = $1', [invite.id]);
    }

    // If user has no orgs, create a default org with a default team
    const orgCheck = await pool.query(
      'SELECT org_id FROM org_members WHERE user_id = $1',
      [user.id]
    );
    if (orgCheck.rows.length === 0) {
      const orgResult = await pool.query(
        "INSERT INTO organizations (name, created_by) VALUES ($1, $2) RETURNING *",
        [user.email + "'s Org", user.id]
      );
      await pool.query(
        'INSERT INTO org_members (org_id, user_id) VALUES ($1, $2)',
        [orgResult.rows[0].id, user.id]
      );

      const teamResult = await pool.query(
        "INSERT INTO teams (name, created_by, org_id) VALUES ($1, $2, $3) RETURNING *",
        [user.email + "'s Team", user.id, orgResult.rows[0].id]
      );
      await pool.query(
        'INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)',
        [teamResult.rows[0].id, user.id]
      );
    }

    // Return orgs and teams with the response
    const orgs = await pool.query(
      `SELECT o.* FROM organizations o
       JOIN org_members om ON o.id = om.org_id
       WHERE om.user_id = $1 ORDER BY o.created_at`,
      [user.id]
    );

    const teams = await pool.query(
      `SELECT t.* FROM teams t
       JOIN team_members tm ON t.id = tm.team_id
       WHERE tm.user_id = $1 ORDER BY t.created_at`,
      [user.id]
    );

    res.status(201).json({ token, user: { id: user.id, email: user.email }, orgs: orgs.rows, teams: teams.rows });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
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

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Return orgs, teams, and pending invite count
    const orgs = await pool.query(
      `SELECT o.* FROM organizations o
       JOIN org_members om ON o.id = om.org_id
       WHERE om.user_id = $1 ORDER BY o.created_at`,
      [user.id]
    );

    const teams = await pool.query(
      `SELECT t.* FROM teams t
       JOIN team_members tm ON t.id = tm.team_id
       WHERE tm.user_id = $1 ORDER BY t.created_at`,
      [user.id]
    );

    const pendingInvites = await pool.query(
      'SELECT COUNT(*) as count FROM team_invites WHERE email = $1',
      [user.email]
    );

    res.json({
      token,
      user: { id: user.id, email: user.email },
      orgs: orgs.rows,
      teams: teams.rows,
      pendingInviteCount: parseInt(pendingInvites.rows[0].count),
    });
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
