const express = require('express');
const { google } = require('googleapis');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.SERVER_URL || 'http://localhost:3001'}/api/google/callback`
  );
}

// GET /api/google/auth — Generate OAuth URL
router.get('/auth', auth, (req, res) => {
  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/tasks'],
    state: req.headers.authorization.split(' ')[1], // pass JWT as state
  });
  res.json({ url });
});

// GET /api/google/callback — OAuth callback (browser redirect)
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).send('Missing code or state');
    }

    // Verify the JWT from state to get userId
    const jwt = require('jsonwebtoken');
    let decoded;
    try {
      decoded = jwt.verify(state, process.env.JWT_SECRET);
    } catch {
      return res.status(401).send('Invalid state token');
    }

    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (tokens.refresh_token) {
      await pool.query(
        'UPDATE users SET google_refresh_token = $1 WHERE id = $2',
        [tokens.refresh_token, decoded.userId]
      );
    }

    // Redirect back to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}?google=connected`);
  } catch (err) {
    console.error('Google callback error:', err);
    res.status(500).send('Failed to complete Google authentication');
  }
});

// GET /api/google/status — Check if Google is connected
router.get('/status', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT google_refresh_token FROM users WHERE id = $1',
      [req.userId]
    );
    const connected = !!(result.rows[0]?.google_refresh_token);
    res.json({ connected });
  } catch (err) {
    console.error('Google status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper: get authenticated Tasks API client for a user
async function getTasksClient(userId) {
  const result = await pool.query(
    'SELECT google_refresh_token FROM users WHERE id = $1',
    [userId]
  );
  const refreshToken = result.rows[0]?.google_refresh_token;
  if (!refreshToken) return null;

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.tasks({ version: 'v1', auth: oauth2Client });
}

// POST /api/google/tasks — Create a Google Task linked to a kanban task
router.post('/tasks', auth, async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ error: 'taskId is required' });

    // Verify task ownership via team membership
    const taskResult = await pool.query(
      `SELECT t.* FROM tasks t
       JOIN projects p ON t.project_id = p.id
       JOIN clients c ON p.client_id = c.id
       JOIN team_members tm ON c.team_id = tm.team_id
       WHERE t.id = $1 AND tm.user_id = $2`,
      [taskId, req.userId]
    );
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];
    const tasksClient = await getTasksClient(req.userId);
    if (!tasksClient) {
      return res.status(400).json({ error: 'Google account not connected' });
    }

    // Build Google Task object
    const googleTask = {
      title: task.title,
      notes: task.description || undefined,
      status: task.status === 'completed' ? 'completed' : 'needsAction',
    };
    if (task.due_date) {
      googleTask.due = new Date(task.due_date).toISOString();
    }

    // Create in default task list (@default)
    const response = await tasksClient.tasks.insert({
      tasklist: '@default',
      requestBody: googleTask,
    });

    // Store the Google Task ID
    await pool.query(
      'UPDATE tasks SET google_task_id = $1 WHERE id = $2',
      [response.data.id, taskId]
    );

    res.json({ google_task_id: response.data.id });
  } catch (err) {
    console.error('Create Google Task error:', err);
    res.status(500).json({ error: 'Failed to create Google Task' });
  }
});

// DELETE /api/google/tasks/:taskId — Remove Google Task link
router.delete('/tasks/:taskId', auth, async (req, res) => {
  try {
    const { taskId } = req.params;

    // Verify ownership
    const taskResult = await pool.query(
      `SELECT t.* FROM tasks t
       JOIN projects p ON t.project_id = p.id
       JOIN clients c ON p.client_id = c.id
       WHERE t.id = $1 AND c.user_id = $2`,
      [taskId, req.userId]
    );
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await pool.query(
      'UPDATE tasks SET google_task_id = NULL WHERE id = $1',
      [taskId]
    );

    res.json({ message: 'Google Task link removed' });
  } catch (err) {
    console.error('Remove Google Task link error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Export helper for use in tasks.js reorder hook
router.getTasksClient = getTasksClient;

module.exports = router;
