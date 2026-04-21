const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

async function verifyTeamMembership(teamId, userId) {
  const result = await pool.query(
    'SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );
  return result.rows.length > 0;
}

// GET /api/teams — list teams the current user belongs to (optionally filtered by orgId)
router.get('/', async (req, res) => {
  try {
    const { orgId } = req.query;
    let query = `SELECT t.*, (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS member_count
       FROM teams t
       JOIN team_members tm ON t.id = tm.team_id
       WHERE tm.user_id = $1`;
    const params = [req.userId];

    if (orgId) {
      params.push(orgId);
      query += ` AND t.org_id = $${params.length}`;
    }

    query += ' ORDER BY t.created_at';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get teams error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/teams — create a new team
router.post('/', async (req, res) => {
  try {
    const { name, orgId } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!orgId) return res.status(400).json({ error: 'orgId is required' });

    // Verify user is a member of the org
    const orgCheck = await pool.query(
      'SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2',
      [orgId, req.userId]
    );
    if (orgCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const teamResult = await client.query(
        'INSERT INTO teams (name, created_by, org_id) VALUES ($1, $2, $3) RETURNING *',
        [name, req.userId, orgId]
      );
      const team = teamResult.rows[0];

      await client.query(
        'INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)',
        [team.id, req.userId]
      );

      await client.query('COMMIT');
      res.status(201).json(team);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Create team error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/teams/invites/pending — get pending invites for current user
// NOTE: must be before /:teamId routes so "invites" isn't matched as a teamId
router.get('/invites/pending', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ti.*, t.name as team_name
       FROM team_invites ti
       JOIN teams t ON ti.team_id = t.id
       WHERE ti.email = (SELECT email FROM users WHERE id = $1)
       ORDER BY ti.created_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get pending invites error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/teams/invites/:inviteId/accept — accept an invite
router.post('/invites/:inviteId/accept', async (req, res) => {
  try {
    // Verify invite belongs to current user's email
    const inviteResult = await pool.query(
      `SELECT ti.*, t.name as team_name
       FROM team_invites ti
       JOIN teams t ON ti.team_id = t.id
       WHERE ti.id = $1 AND ti.email = (SELECT email FROM users WHERE id = $2)`,
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
        'INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [invite.team_id, req.userId]
      );

      await client.query('DELETE FROM team_invites WHERE id = $1', [invite.id]);

      await client.query('COMMIT');

      const teamResult = await pool.query('SELECT * FROM teams WHERE id = $1', [invite.team_id]);
      res.json(teamResult.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Accept invite error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/teams/invites/:inviteId/decline — decline an invite
router.post('/invites/:inviteId/decline', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM team_invites
       WHERE id = $1 AND email = (SELECT email FROM users WHERE id = $2)
       RETURNING id`,
      [req.params.inviteId, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    res.json({ message: 'Invite declined' });
  } catch (err) {
    console.error('Decline invite error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/teams/:teamId — get team details
router.get('/:teamId', async (req, res) => {
  try {
    if (!(await verifyTeamMembership(req.params.teamId, req.userId))) {
      return res.status(404).json({ error: 'Team not found' });
    }
    const result = await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.teamId]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get team error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/teams/:teamId/members — list team members
router.get('/:teamId/members', async (req, res) => {
  try {
    if (!(await verifyTeamMembership(req.params.teamId, req.userId))) {
      return res.status(404).json({ error: 'Team not found' });
    }
    const result = await pool.query(
      `SELECT u.id, u.email, tm.created_at as joined_at
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = $1
       ORDER BY tm.created_at`,
      [req.params.teamId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get team members error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/teams/:teamId/invite — invite a user by email
router.post('/:teamId/invite', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    if (!(await verifyTeamMembership(req.params.teamId, req.userId))) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Check if already a member
    const existingMember = await pool.query(
      `SELECT tm.id FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = $1 AND u.email = $2`,
      [req.params.teamId, email]
    );
    if (existingMember.rows.length > 0) {
      return res.status(409).json({ error: 'User is already a team member' });
    }

    const result = await pool.query(
      'INSERT INTO team_invites (team_id, email, invited_by) VALUES ($1, $2, $3) RETURNING *',
      [req.params.teamId, email, req.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Invite already sent to this email' });
    }
    console.error('Invite member error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/teams/:teamId — delete team (creator only)
router.delete('/:teamId', async (req, res) => {
  try {
    const creatorCheck = await pool.query(
      'SELECT id FROM teams WHERE id = $1 AND created_by = $2',
      [req.params.teamId, req.userId]
    );
    if (creatorCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found or not authorized' });
    }

    const taskRows = await pool.query(
      `SELECT t.google_task_id FROM tasks t
       JOIN projects p ON t.project_id = p.id
       JOIN clients c ON p.client_id = c.id
       WHERE c.team_id = $1 AND t.google_task_id IS NOT NULL`,
      [req.params.teamId]
    );

    await pool.query('DELETE FROM teams WHERE id = $1', [req.params.teamId]);

    const { deleteGoogleTasksForUser } = require('./google');
    deleteGoogleTasksForUser(req.userId, taskRows.rows.map((r) => r.google_task_id))
      .catch((err) => console.error('Bulk Google Tasks delete error (non-fatal):', err.message));

    res.json({ message: 'Team deleted' });
  } catch (err) {
    console.error('Delete team error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/teams/:teamId/members/:userId — remove a member or leave team
router.delete('/:teamId/members/:userId', async (req, res) => {
  try {
    if (!(await verifyTeamMembership(req.params.teamId, req.userId))) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Prevent removing the last member
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM team_members WHERE team_id = $1',
      [req.params.teamId]
    );
    if (parseInt(countResult.rows[0].count) <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last team member' });
    }

    const result = await pool.query(
      'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 RETURNING id',
      [req.params.teamId, req.params.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    res.json({ message: 'Member removed' });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
