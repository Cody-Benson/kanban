const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

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

// Verify a task belongs to a team the user is a member of
async function verifyTaskOwnership(taskId, userId) {
  const result = await pool.query(
    `SELECT t.id FROM tasks t
     JOIN projects p ON t.project_id = p.id
     JOIN clients c ON p.client_id = c.id
     JOIN team_members tm ON c.team_id = tm.team_id
     WHERE t.id = $1 AND tm.user_id = $2`,
    [taskId, userId]
  );
  return result.rows.length > 0;
}

// GET /api/tasks/by-project/:projectId
router.get('/by-project/:projectId', async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.projectId, req.userId))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const result = await pool.query(
      `SELECT t.*, u.email AS assigned_email
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.project_id = $1
       ORDER BY t.position`,
      [req.params.projectId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tasks/by-project/:projectId
router.post('/by-project/:projectId', async (req, res) => {
  try {
    if (!(await verifyProjectOwnership(req.params.projectId, req.userId))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const { title, description, due_date, assigned_to } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    // Validate assigned_to is a team member if provided
    if (assigned_to) {
      const memberCheck = await pool.query(
        `SELECT tm.id FROM team_members tm
         JOIN clients c ON c.team_id = tm.team_id
         JOIN projects p ON p.client_id = c.id
         WHERE p.id = $1 AND tm.user_id = $2`,
        [req.params.projectId, assigned_to]
      );
      if (memberCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Assigned user is not a team member' });
      }
    }

    // Get the next position for 'todo' column
    const posResult = await pool.query(
      "SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM tasks WHERE project_id = $1 AND status = 'todo'",
      [req.params.projectId]
    );

    const result = await pool.query(
      'INSERT INTO tasks (project_id, title, description, status, position, due_date, assigned_to) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.params.projectId, title, description || '', 'todo', posResult.rows[0].next_pos, due_date || null, assigned_to || null]
    );
    const newTask = result.rows[0];

    // Auto-create Google Task for today when no due date is assigned
    if (!due_date) {
      try {
        const googleRoutes = require('./google');
        const tasksClient = await googleRoutes.getTasksClient(req.userId);
        if (tasksClient) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const googleTask = await tasksClient.tasks.insert({
            tasklist: '@default',
            requestBody: {
              title: newTask.title,
              notes: newTask.description || '',
              status: 'needsAction',
              due: today.toISOString(),
            },
          });
          const updateResult = await pool.query(
            'UPDATE tasks SET google_task_id = $1 WHERE id = $2 RETURNING *',
            [googleTask.data.id, newTask.id]
          );
          res.status(201).json(updateResult.rows[0]);
          return;
        }
      } catch (googleErr) {
        console.error('Auto Google Task creation error (non-fatal):', googleErr.message);
      }
    }

    res.status(201).json(newTask);
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/tasks/reorder — drag-and-drop reorder/status change
// NOTE: Must be before /:id routes so "reorder" isn't matched as an id
router.put('/reorder', async (req, res) => {
  const client = await pool.connect();
  try {
    const { taskId, newStatus, newPosition } = req.body;
    if (!taskId || !newStatus || newPosition == null) {
      return res.status(400).json({ error: 'taskId, newStatus, and newPosition are required' });
    }

    if (!['todo', 'in-progress', 'blocked', 'completed'].includes(newStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Verify ownership
    if (!(await verifyTaskOwnership(taskId, req.userId))) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Get current task info
    const taskResult = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    const task = taskResult.rows[0];
    const oldStatus = task.status;
    const projectId = task.project_id;

    await client.query('BEGIN');

    // Update the task's status
    await client.query(
      'UPDATE tasks SET status = $1 WHERE id = $2',
      [newStatus, taskId]
    );

    // Get all tasks in the destination column (excluding the moved task), ordered by position
    const destTasks = await client.query(
      'SELECT id FROM tasks WHERE project_id = $1 AND status = $2 AND id != $3 ORDER BY position',
      [projectId, newStatus, taskId]
    );

    // Build new order: splice the moved task into the desired position
    const destIds = destTasks.rows.map(r => r.id);
    destIds.splice(newPosition, 0, taskId);

    // Rewrite positions for the destination column
    for (let i = 0; i < destIds.length; i++) {
      await client.query('UPDATE tasks SET position = $1 WHERE id = $2', [i, destIds[i]]);
    }

    // If the task moved from a different column, renumber the source column too
    if (oldStatus !== newStatus) {
      const srcTasks = await client.query(
        'SELECT id FROM tasks WHERE project_id = $1 AND status = $2 ORDER BY position',
        [projectId, oldStatus]
      );
      for (let i = 0; i < srcTasks.rows.length; i++) {
        await client.query('UPDATE tasks SET position = $1 WHERE id = $2', [i, srcTasks.rows[i].id]);
      }
    }

    await client.query('COMMIT');

    // Google Tasks sync: update linked Google Task status on column change
    if (oldStatus !== newStatus && task.google_task_id) {
      try {
        const googleRoutes = require('./google');
        const tasksClient = await googleRoutes.getTasksClient(req.userId);
        if (tasksClient) {
          const googleStatus = newStatus === 'completed' ? 'completed' : 'needsAction';
          await tasksClient.tasks.patch({
            tasklist: '@default',
            task: task.google_task_id,
            requestBody: { status: googleStatus },
          });
        }
      } catch (googleErr) {
        console.error('Google Tasks sync error (non-fatal):', googleErr.message);
      }
    }

    // Return all tasks for the project so the frontend can sync
    const allTasks = await client.query(
      `SELECT t.*, u.email AS assigned_email
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.project_id = $1
       ORDER BY t.position`,
      [projectId]
    );
    res.json(allTasks.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reorder error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// GET /api/tasks/:id
router.get('/:id', async (req, res) => {
  try {
    if (!(await verifyTaskOwnership(req.params.id, req.userId))) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/tasks/:id
router.put('/:id', async (req, res) => {
  try {
    if (!(await verifyTaskOwnership(req.params.id, req.userId))) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const { title, description, due_date, assigned_to } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const result = await pool.query(
      'UPDATE tasks SET title = $1, description = $2, due_date = $3, assigned_to = $4 WHERE id = $5 RETURNING *',
      [title, description || '', due_date || null, assigned_to || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!(await verifyTaskOwnership(req.params.id, req.userId))) {
      return res.status(404).json({ error: 'Task not found' });
    }
    await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
