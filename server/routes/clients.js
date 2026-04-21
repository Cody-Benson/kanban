const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { teamId } = req.query;
    let result;
    if (teamId) {
      result = await pool.query(
        `SELECT c.* FROM clients c
         JOIN team_members tm ON c.team_id = tm.team_id
         WHERE c.team_id = $1 AND tm.user_id = $2
         ORDER BY c.created_at DESC`,
        [teamId, req.userId]
      );
    } else {
      result = await pool.query(
        `SELECT c.* FROM clients c
         JOIN team_members tm ON c.team_id = tm.team_id
         WHERE tm.user_id = $1
         ORDER BY c.created_at DESC`,
        [req.userId]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error('Get clients error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, teamId } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!teamId) return res.status(400).json({ error: 'teamId is required' });

    // Verify user is a member of the team
    const membership = await pool.query(
      'SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, req.userId]
    );
    if (membership.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const result = await pool.query(
      'INSERT INTO clients (user_id, team_id, name) VALUES ($1, $2, $3) RETURNING *',
      [req.userId, teamId, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.* FROM clients c
       JOIN team_members tm ON c.team_id = tm.team_id
       WHERE c.id = $1 AND tm.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await pool.query(
      `UPDATE clients SET name = $1
       WHERE id = $2 AND team_id IN (SELECT team_id FROM team_members WHERE user_id = $3)
       RETURNING *`,
      [name, req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ownershipCheck = await pool.query(
      `SELECT c.id FROM clients c
       JOIN team_members tm ON c.team_id = tm.team_id
       WHERE c.id = $1 AND tm.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (ownershipCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const taskRows = await pool.query(
      `SELECT t.google_task_id FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE p.client_id = $1 AND t.google_task_id IS NOT NULL`,
      [req.params.id]
    );

    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);

    const { deleteGoogleTasksForUser } = require('./google');
    deleteGoogleTasksForUser(req.userId, taskRows.rows.map((r) => r.google_task_id))
      .catch((err) => console.error('Bulk Google Tasks delete error (non-fatal):', err.message));

    res.json({ message: 'Client deleted' });
  } catch (err) {
    console.error('Delete client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
