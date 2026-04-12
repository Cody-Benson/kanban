const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// Verify a client belongs to a team the user is a member of
async function verifyClientOwnership(clientId, userId) {
  const result = await pool.query(
    `SELECT c.id FROM clients c
     JOIN team_members tm ON c.team_id = tm.team_id
     WHERE c.id = $1 AND tm.user_id = $2`,
    [clientId, userId]
  );
  return result.rows.length > 0;
}

// Verify a project belongs to a team the user is a member of
async function verifyProjectOwnership(projectId, userId) {
  const result = await pool.query(
    `SELECT p.id FROM projects p
     JOIN clients c ON p.client_id = c.id
     JOIN team_members tm ON c.team_id = tm.team_id
     WHERE p.id = $1 AND tm.user_id = $2`,
    [projectId, userId]
  );
  return result.rows.length > 0;
}

// GET /api/projects/by-client/:clientId — list projects for a client
router.get('/by-client/:clientId', async (req, res) => {
  try {
    if (!(await verifyClientOwnership(req.params.clientId, req.userId))) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const result = await pool.query(
      'SELECT * FROM projects WHERE client_id = $1 ORDER BY created_at DESC',
      [req.params.clientId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/projects/by-client/:clientId — create project under a client
router.post('/by-client/:clientId', async (req, res) => {
  try {
    if (!(await verifyClientOwnership(req.params.clientId, req.userId))) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await pool.query(
      'INSERT INTO projects (client_id, name) VALUES ($1, $2) RETURNING *',
      [req.params.clientId, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.id, req.userId))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const result = await pool.query(
      'SELECT p.*, c.name AS client_name FROM projects p JOIN clients c ON p.client_id = c.id WHERE p.id = $1',
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.id, req.userId))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await pool.query(
      'UPDATE projects SET name = $1 WHERE id = $2 RETURNING *',
      [name, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.id, req.userId))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
