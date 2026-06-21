const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// A user can access a project iff they are a member of it.
async function verifyProjectMembership(projectId, userId) {
  const result = await pool.query(
    'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, userId]
  );
  return result.rows.length > 0;
}

// GET /api/projects — projects the current user is a member of
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.client, p.created_by, p.created_at
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = $1
       ORDER BY p.created_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/projects — create a project owned by the current user
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, client: clientLabel } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO projects (name, client, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, name, client, created_by, created_at`,
      [name, clientLabel || null, req.userId]
    );
    const project = result.rows[0];
    await client.query(
      'INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [project.id, req.userId]
    );
    await client.query('COMMIT');
    res.status(201).json(project);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  try {
    if (!(await verifyProjectMembership(req.params.id, req.userId))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const result = await pool.query(
      'SELECT id, name, client, created_by, created_at FROM projects WHERE id = $1',
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/projects/:id/members — members of a project (for the assignee picker)
router.get('/:id/members', async (req, res) => {
  try {
    if (!(await verifyProjectMembership(req.params.id, req.userId))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const result = await pool.query(
      `SELECT u.id, u.email
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1
       ORDER BY u.email`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get project members error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/projects/:id — rename / set client label (any member)
router.put('/:id', async (req, res) => {
  try {
    if (!(await verifyProjectMembership(req.params.id, req.userId))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const { name, client: clientLabel } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await pool.query(
      `UPDATE projects SET name = $1, client = $2 WHERE id = $3
       RETURNING id, name, client, created_by, created_at`,
      [name, clientLabel || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/projects/:id — owner only
router.delete('/:id', async (req, res) => {
  try {
    const owns = await pool.query(
      `SELECT p.created_by FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       WHERE p.id = $1 AND pm.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (owns.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (owns.rows[0].created_by !== req.userId) {
      return res.status(403).json({ error: 'Only the project owner can delete it' });
    }

    const taskRows = await pool.query(
      `SELECT tgl.google_account_id, tgl.google_task_id FROM task_google_links tgl
       JOIN tasks t ON tgl.task_id = t.id
       WHERE t.project_id = $1`,
      [req.params.id]
    );

    await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);

    const { deleteGoogleTasksForUser } = require('./google');
    deleteGoogleTasksForUser(req.userId, taskRows.rows)
      .catch((err) => console.error('Bulk Google Tasks delete error (non-fatal):', err.message));

    res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
