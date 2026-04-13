const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');

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

module.exports = router;
