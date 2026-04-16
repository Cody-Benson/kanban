const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

async function verifyOrgMembership(orgId, userId) {
  const result = await pool.query(
    'SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2',
    [orgId, userId]
  );
  return result.rows.length > 0;
}

// GET /api/orgs — list orgs the current user belongs to
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, (SELECT COUNT(*) FROM org_members WHERE org_id = o.id) AS member_count
       FROM organizations o
       JOIN org_members om ON o.id = om.org_id
       WHERE om.user_id = $1
       ORDER BY o.created_at`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get orgs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/orgs — create a new org
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orgResult = await client.query(
        'INSERT INTO organizations (name, created_by) VALUES ($1, $2) RETURNING *',
        [name, req.userId]
      );
      const org = orgResult.rows[0];

      await client.query(
        'INSERT INTO org_members (org_id, user_id) VALUES ($1, $2)',
        [org.id, req.userId]
      );

      await client.query('COMMIT');
      res.status(201).json(org);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Create org error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/orgs/invites/pending — get pending invites for current user
router.get('/invites/pending', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT oi.*, o.name as org_name
       FROM org_invites oi
       JOIN organizations o ON oi.org_id = o.id
       WHERE oi.email = (SELECT email FROM users WHERE id = $1)
       ORDER BY oi.created_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get pending org invites error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/orgs/invites/:inviteId/accept — accept an invite
router.post('/invites/:inviteId/accept', async (req, res) => {
  try {
    const inviteResult = await pool.query(
      `SELECT oi.*, o.name as org_name
       FROM org_invites oi
       JOIN organizations o ON oi.org_id = o.id
       WHERE oi.id = $1 AND oi.email = (SELECT email FROM users WHERE id = $2)`,
      [req.params.inviteId, req.userId]
    );
    if (inviteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    const invite = inviteResult.rows[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'INSERT INTO org_members (org_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [invite.org_id, req.userId]
      );

      await client.query('DELETE FROM org_invites WHERE id = $1', [invite.id]);

      await client.query('COMMIT');

      const orgResult = await pool.query('SELECT * FROM organizations WHERE id = $1', [invite.org_id]);
      res.json(orgResult.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Accept org invite error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/orgs/invites/:inviteId/decline — decline an invite
router.post('/invites/:inviteId/decline', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM org_invites
       WHERE id = $1 AND email = (SELECT email FROM users WHERE id = $2)
       RETURNING id`,
      [req.params.inviteId, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    res.json({ message: 'Invite declined' });
  } catch (err) {
    console.error('Decline org invite error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/orgs/:orgId — update org (creator only)
router.put('/:orgId', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await pool.query(
      'UPDATE organizations SET name = $1 WHERE id = $2 AND created_by = $3 RETURNING *',
      [name, req.params.orgId, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found or not authorized' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update org error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/orgs/:orgId — delete org (creator only)
router.delete('/:orgId', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM organizations WHERE id = $1 AND created_by = $2 RETURNING id',
      [req.params.orgId, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found or not authorized' });
    }
    res.json({ message: 'Organization deleted' });
  } catch (err) {
    console.error('Delete org error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/orgs/:orgId — get org details
router.get('/:orgId', async (req, res) => {
  try {
    if (!(await verifyOrgMembership(req.params.orgId, req.userId))) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    const result = await pool.query('SELECT * FROM organizations WHERE id = $1', [req.params.orgId]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get org error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/orgs/:orgId/members — list org members
router.get('/:orgId/members', async (req, res) => {
  try {
    if (!(await verifyOrgMembership(req.params.orgId, req.userId))) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    const result = await pool.query(
      `SELECT u.id, u.email, om.created_at as joined_at
       FROM org_members om
       JOIN users u ON om.user_id = u.id
       WHERE om.org_id = $1
       ORDER BY om.created_at`,
      [req.params.orgId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get org members error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/orgs/:orgId/invite — invite a user by email
router.post('/:orgId/invite', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    if (!(await verifyOrgMembership(req.params.orgId, req.userId))) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const existingMember = await pool.query(
      `SELECT om.id FROM org_members om
       JOIN users u ON om.user_id = u.id
       WHERE om.org_id = $1 AND u.email = $2`,
      [req.params.orgId, email]
    );
    if (existingMember.rows.length > 0) {
      return res.status(409).json({ error: 'User is already an org member' });
    }

    const result = await pool.query(
      'INSERT INTO org_invites (org_id, email, invited_by) VALUES ($1, $2, $3) RETURNING *',
      [req.params.orgId, email, req.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Invite already sent to this email' });
    }
    console.error('Invite org member error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/orgs/:orgId/members/:userId — remove a member or leave org
router.delete('/:orgId/members/:userId', async (req, res) => {
  try {
    if (!(await verifyOrgMembership(req.params.orgId, req.userId))) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM org_members WHERE org_id = $1',
      [req.params.orgId]
    );
    if (parseInt(countResult.rows[0].count) <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last org member' });
    }

    const result = await pool.query(
      'DELETE FROM org_members WHERE org_id = $1 AND user_id = $2 RETURNING id',
      [req.params.orgId, req.params.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    res.json({ message: 'Member removed' });
  } catch (err) {
    console.error('Remove org member error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
