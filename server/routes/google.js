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

const SCOPES = [
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/userinfo.email',
];

// GET /api/google/auth — Generate OAuth URL. Used both for the first connect
// and for connecting additional accounts; the account chooser + forced consent
// ensures Google returns a refresh token for whichever account is picked.
router.get('/auth', auth, (req, res) => {
  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent select_account',
    scope: SCOPES,
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
    oauth2Client.setCredentials(tokens);

    // Identify which Google account this is so multiple accounts don't
    // overwrite each other.
    const userinfo = await google
      .oauth2({ version: 'v2', auth: oauth2Client })
      .userinfo.get();
    const googleEmail = userinfo.data.email;

    if (tokens.refresh_token && googleEmail) {
      await pool.query(
        `INSERT INTO google_accounts (user_id, google_email, refresh_token)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, google_email)
         DO UPDATE SET refresh_token = EXCLUDED.refresh_token`,
        [decoded.userId, googleEmail, tokens.refresh_token]
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

// GET /api/google/status — connected flag + list of connected accounts
router.get('/status', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, google_email FROM google_accounts WHERE user_id = $1 ORDER BY created_at',
      [req.userId]
    );
    const accounts = result.rows.map((r) => ({ id: r.id, email: r.google_email }));
    res.json({ connected: accounts.length > 0, accounts });
  } catch (err) {
    console.error('Google status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/google/accounts — list connected Google accounts
router.get('/accounts', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, google_email FROM google_accounts WHERE user_id = $1 ORDER BY created_at',
      [req.userId]
    );
    res.json(result.rows.map((r) => ({ id: r.id, email: r.google_email })));
  } catch (err) {
    console.error('Google accounts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/google/accounts/:id — disconnect a Google account
router.delete('/accounts/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM google_accounts WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ message: 'Google account disconnected' });
  } catch (err) {
    console.error('Disconnect Google account error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Build an authenticated Tasks API client from a stored refresh token.
function getTasksClientForToken(refreshToken) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.tasks({ version: 'v1', auth: oauth2Client });
}

// List a user's connected Google accounts with their refresh tokens.
async function listGoogleAccounts(userId) {
  const result = await pool.query(
    'SELECT id, google_email, refresh_token FROM google_accounts WHERE user_id = $1 ORDER BY created_at',
    [userId]
  );
  return result.rows;
}

// All Google links for a task, joined with the owning account's token.
async function getTaskLinks(taskId) {
  const result = await pool.query(
    `SELECT tgl.google_task_id, ga.id AS account_id, ga.refresh_token
     FROM task_google_links tgl
     JOIN google_accounts ga ON ga.id = tgl.google_account_id
     WHERE tgl.task_id = $1`,
    [taskId]
  );
  return result.rows;
}

// POST /api/google/tasks — link an existing kanban task to one or more accounts
router.post('/tasks', auth, async (req, res) => {
  try {
    const { taskId, googleAccountIds } = req.body;
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
    const accounts = await listGoogleAccounts(req.userId);
    if (accounts.length === 0) {
      return res.status(400).json({ error: 'Google account not connected' });
    }
    const targets =
      Array.isArray(googleAccountIds) && googleAccountIds.length > 0
        ? accounts.filter((a) => googleAccountIds.includes(a.id))
        : accounts;

    const googleTask = {
      title: task.title,
      notes: task.description || undefined,
      status: task.status === 'completed' ? 'completed' : 'needsAction',
    };
    if (task.due_date) {
      googleTask.due = new Date(task.due_date).toISOString();
    }

    const linked = [];
    for (const acc of targets) {
      try {
        const tasksClient = getTasksClientForToken(acc.refresh_token);
        const response = await tasksClient.tasks.insert({
          tasklist: '@default',
          requestBody: googleTask,
        });
        await pool.query(
          `INSERT INTO task_google_links (task_id, google_account_id, google_task_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (task_id, google_account_id)
           DO UPDATE SET google_task_id = EXCLUDED.google_task_id`,
          [taskId, acc.id, response.data.id]
        );
        linked.push(acc.id);
      } catch (accErr) {
        console.error(`Link to account ${acc.id} failed (non-fatal):`, accErr.message);
      }
    }

    res.json({ linked });
  } catch (err) {
    console.error('Create Google Task error:', err);
    res.status(500).json({ error: 'Failed to create Google Task' });
  }
});

// DELETE /api/google/tasks/:taskId — unlink a task from all Google accounts
router.delete('/tasks/:taskId', auth, async (req, res) => {
  try {
    const { taskId } = req.params;

    const taskResult = await pool.query(
      `SELECT t.id FROM tasks t
       JOIN projects p ON t.project_id = p.id
       JOIN clients c ON p.client_id = c.id
       JOIN team_members tm ON c.team_id = tm.team_id
       WHERE t.id = $1 AND tm.user_id = $2`,
      [taskId, req.userId]
    );
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const links = await getTaskLinks(taskId);
    await pool.query('DELETE FROM task_google_links WHERE task_id = $1', [taskId]);

    await Promise.all(
      links.map((l) =>
        getTasksClientForToken(l.refresh_token)
          .tasks.delete({ tasklist: '@default', task: l.google_task_id })
          .catch((err) =>
            console.error(`Google Tasks delete failed for ${l.google_task_id} (non-fatal):`, err.message)
          )
      )
    );

    res.json({ message: 'Google Task links removed' });
  } catch (err) {
    console.error('Remove Google Task link error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Best-effort bulk delete of Google Tasks for a user, used by cascading
// deletes (org/team/client/project). `links` is an array of
// { google_account_id, google_task_id }. Failures per-task are non-fatal.
async function deleteGoogleTasksForUser(userId, links) {
  const valid = (links || []).filter(
    (l) => l && l.google_task_id && l.google_account_id
  );
  if (valid.length === 0) return;

  const accountIds = [...new Set(valid.map((l) => l.google_account_id))];
  const accRes = await pool.query(
    'SELECT id, refresh_token FROM google_accounts WHERE user_id = $1 AND id = ANY($2)',
    [userId, accountIds]
  );
  const tokenById = new Map(accRes.rows.map((r) => [r.id, r.refresh_token]));

  await Promise.all(
    valid.map((l) => {
      const token = tokenById.get(l.google_account_id);
      if (!token) return Promise.resolve();
      return getTasksClientForToken(token)
        .tasks.delete({ tasklist: '@default', task: l.google_task_id })
        .catch((err) => {
          console.error(`Google Tasks delete failed for ${l.google_task_id} (non-fatal):`, err.message);
        });
    })
  );
}

// Export helpers for use in other routes
router.getTasksClientForToken = getTasksClientForToken;
router.listGoogleAccounts = listGoogleAccounts;
router.getTaskLinks = getTaskLinks;
router.deleteGoogleTasksForUser = deleteGoogleTasksForUser;

module.exports = router;
