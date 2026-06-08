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

    // Google's granular consent screen lets the user approve the email scope
    // but skip the Tasks scope; detect that so we can warn instead of failing
    // silently on every sync.
    const hasTasksScope = (tokens.scope || '')
      .split(' ')
      .includes('https://www.googleapis.com/auth/tasks');

    if (tokens.refresh_token && googleEmail) {
      await pool.query(
        `INSERT INTO google_accounts (user_id, google_email, refresh_token, has_tasks_scope)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, google_email)
         DO UPDATE SET refresh_token = EXCLUDED.refresh_token,
                       has_tasks_scope = EXCLUDED.has_tasks_scope,
                       needs_reauth = FALSE`,
        [decoded.userId, googleEmail, tokens.refresh_token, hasTasksScope]
      );
    }

    // If this account was previously stored as a legacy placeholder, collapse
    // the placeholder onto this real row so tasks aren't double-posted.
    try {
      await reconcileLegacyAccounts(decoded.userId);
    } catch (reconcileErr) {
      console.error('Legacy reconcile after connect failed (non-fatal):', reconcileErr.message);
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
      'SELECT id, google_email, has_tasks_scope, needs_reauth FROM google_accounts WHERE user_id = $1 ORDER BY created_at',
      [req.userId]
    );
    const accounts = result.rows.map((r) => ({
      id: r.id,
      email: r.google_email,
      hasTasksScope: r.has_tasks_scope,
      needsReauth: r.needs_reauth,
    }));
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
      'SELECT id, google_email, has_tasks_scope, needs_reauth FROM google_accounts WHERE user_id = $1 ORDER BY created_at',
      [req.userId]
    );
    res.json(
      result.rows.map((r) => ({
        id: r.id,
        email: r.google_email,
        hasTasksScope: r.has_tasks_scope,
        needsReauth: r.needs_reauth,
      }))
    );
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

// POST /api/google/accounts/:id/sync-all — push every task the user can
// access into this Google account that isn't already linked to it. Lets a
// newly connected account backfill all previously created tasks.
router.post('/accounts/:id/sync-all', auth, async (req, res) => {
  try {
    // Verify ownership before doing anything.
    const ownsAccount = await pool.query(
      'SELECT id FROM google_accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (ownsAccount.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Collapse any legacy placeholder rows into their real account first so
    // dedup by account id is actually correct (a legacy row and a reconnected
    // row are the same physical Google account).
    await reconcileLegacyAccounts(req.userId);

    // Re-fetch: the requested row may have been a legacy placeholder that got
    // merged away during reconciliation.
    const accountResult = await pool.query(
      'SELECT id, google_email, refresh_token, has_tasks_scope, needs_reauth FROM google_accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (accountResult.rows.length === 0) {
      return res.status(409).json({
        error:
          'This account was a duplicate of an already-connected Google account and has been merged. Reload the page and sync from the remaining account.',
      });
    }
    const account = accountResult.rows[0];
    if (account.needs_reauth) {
      return res.status(400).json({
        error:
          'This account needs to be reconnected — its Google access expired. Click Reconnect, then try syncing again.',
      });
    }
    if (account.has_tasks_scope === false) {
      return res.status(400).json({
        error:
          'This account is missing Google Tasks permission. Reconnect it and check the Tasks box on the Google consent screen.',
      });
    }

    // All tasks the user can reach (via team membership) that don't yet have
    // a link to this account — skipping linked ones prevents duplicates on
    // repeat syncs.
    const tasksResult = await pool.query(
      `SELECT t.id, t.title, t.description, t.status, t.due_date
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       JOIN clients c ON p.client_id = c.id
       JOIN team_members tm ON c.team_id = tm.team_id
       WHERE tm.user_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM task_google_links tgl
           WHERE tgl.task_id = t.id AND tgl.google_account_id = $2
         )
       ORDER BY t.id`,
      [req.userId, account.id]
    );

    const tasksClient = getTasksClientForToken(account.refresh_token);

    // Collapse any same-title duplicates already in this account down to one
    // (self-healing), then use the surviving titles to avoid recreating tasks
    // that still exist — works even when a token lacks the email scope.
    let survivingByTitle = new Map();
    let deduped = 0;
    try {
      const r = await dedupeGoogleTasksByTitle(tasksClient, account.id);
      survivingByTitle = r.survivingByTitle;
      deduped = r.deleted;
    } catch (listErr) {
      console.error('Sync-all: dedupe pass failed (non-fatal):', listErr.message);
    }

    let synced = 0;
    let failed = 0;
    let needsReauth = false;
    // `skipped` is retained for response-shape compatibility. With adopt-existing
    // it should stay 0 in practice — every unlinked-but-same-title task now gets
    // a link row instead of being silently passed over.
    const skipped = 0;

    for (const task of tasksResult.rows) {
      const titleKey = (task.title || '').trim();
      const existingId = survivingByTitle.get(titleKey);
      if (existingId) {
        // Same-title Google task already exists — adopt it by writing a link row
        // pointing at it, so future edits in the app patch the right Google task
        // instead of silently no-op'ing (the bug: an orphaned task whose Google
        // twin existed but had no link row, so PUT /api/tasks/:id's `if (links.length > 0)`
        // check skipped Google sync entirely).
        try {
          await pool.query(
            `INSERT INTO task_google_links (task_id, google_account_id, google_task_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (task_id, google_account_id)
             DO UPDATE SET google_task_id = EXCLUDED.google_task_id`,
            [task.id, account.id, existingId]
          );
          synced += 1;
        } catch (adoptErr) {
          failed += 1;
          console.error(
            `Sync-all: adopt existing for task ${task.id} -> account ${account.id} failed (non-fatal):`,
            adoptErr.message
          );
        }
        continue;
      }
      const googleTask = {
        title: task.title,
        notes: task.description || undefined,
        status: task.status === 'completed' ? 'completed' : 'needsAction',
      };
      if (task.due_date) {
        googleTask.due = new Date(task.due_date).toISOString();
      }
      try {
        const response = await tasksClient.tasks.insert({
          tasklist: '@default',
          requestBody: googleTask,
        });
        await pool.query(
          `INSERT INTO task_google_links (task_id, google_account_id, google_task_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (task_id, google_account_id)
           DO UPDATE SET google_task_id = EXCLUDED.google_task_id`,
          [task.id, account.id, response.data.id]
        );
        synced += 1;
      } catch (taskErr) {
        failed += 1;
        console.error(
          `Sync-all: task ${task.id} -> account ${account.id} failed (non-fatal):`,
          taskErr.message
        );
        // A dead token won't recover mid-loop — flag the account and stop so
        // we don't rack up dozens of identical failures.
        if (isInvalidGrant(taskErr)) {
          await markAccountNeedsReauth(account.id);
          needsReauth = true;
          break;
        }
      }
    }

    res.json({ synced, failed, skipped, deduped, needsReauth });
  } catch (err) {
    console.error('Sync-all error:', err);
    res.status(500).json({ error: 'Failed to sync tasks' });
  }
});

// Detect Google's "this refresh token is dead" error (expired in Testing mode,
// revoked, or a client-secret rotation). Once we see it, hammering the same
// token on every action is pointless — flag the account for reconnection.
function isInvalidGrant(err) {
  const code = err?.response?.data?.error;
  return code === 'invalid_grant' || /invalid_grant/i.test(err?.message || '');
}

// Mark a Google account as needing the user to reconnect. Fan-out queries
// (getTaskLinks / listGoogleAccounts) skip flagged accounts, so this both
// stops the repeating warnings and drives the "Reconnect" prompt in the UI.
async function markAccountNeedsReauth(accountId) {
  if (!accountId) return;
  try {
    await pool.query('UPDATE google_accounts SET needs_reauth = TRUE WHERE id = $1', [accountId]);
  } catch (e) {
    console.error('Failed to flag Google account for reauth (non-fatal):', e.message);
  }
}

// Build a .catch() handler that captures a per-link Google API failure
// into an errors array AND logs it server-side. Centralises the old
// "swallow into console.error and pretend it didn't happen" antipattern
// so every route can surface structured failures to the client.
function captureGoogleError(errors, link, contextLabel) {
  return async (err) => {
    const error = err.message || String(err);
    console.error(`${contextLabel} failed for ${link.google_task_id} (non-fatal):`, error);
    const needsReauth = isInvalidGrant(err);
    if (needsReauth) await markAccountNeedsReauth(link.account_id);
    errors.push({
      accountId: link.account_id,
      googleTaskId: link.google_task_id,
      error,
      needsReauth,
    });
  };
}

// Build an authenticated Tasks API client from a stored refresh token.
function getTasksClientForToken(refreshToken) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.tasks({ version: 'v1', auth: oauth2Client });
}

// Resolve the real Google email behind a refresh token. Returns null if the
// token is dead or was never granted the email scope (e.g. old legacy tokens).
async function resolveAccountEmail(refreshToken) {
  try {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const info = await google
      .oauth2({ version: 'v2', auth: oauth2Client })
      .userinfo.get();
    return info.data.email || null;
  } catch (err) {
    console.error('resolveAccountEmail failed (non-fatal):', err.message);
    return null;
  }
}

// The legacy migration (see server/index.js) created placeholder
// `legacy-<userId>@unknown` google_accounts rows for old single-token data.
// When the user later reconnects that same Google account via OAuth, a
// second row exists for the *same physical account*, so tasks get
// double-posted. This collapses each placeholder onto the real account row
// (or promotes it in place if no separate real row exists yet).
async function reconcileLegacyAccounts(userId) {
  const legacyRes = await pool.query(
    "SELECT id, refresh_token FROM google_accounts WHERE user_id = $1 AND google_email LIKE 'legacy-%@unknown'",
    [userId]
  );
  for (const legacy of legacyRes.rows) {
    const realEmail = await resolveAccountEmail(legacy.refresh_token);
    if (!realEmail) continue; // token dead or no email scope — leave as-is

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const realRes = await client.query(
        'SELECT id FROM google_accounts WHERE user_id = $1 AND google_email = $2 AND id <> $3',
        [userId, realEmail, legacy.id]
      );
      if (realRes.rows.length === 0) {
        // No separate real row yet — just promote the placeholder in place.
        await client.query(
          'UPDATE google_accounts SET google_email = $1 WHERE id = $2',
          [realEmail, legacy.id]
        );
      } else {
        const realId = realRes.rows[0].id;
        // Drop legacy links that collide with the real row's existing links
        // (keep the real row's). Physical Google duplicates that already
        // exist are intentionally left alone.
        await client.query(
          `DELETE FROM task_google_links lgl
           WHERE lgl.google_account_id = $1
             AND EXISTS (
               SELECT 1 FROM task_google_links r
               WHERE r.task_id = lgl.task_id AND r.google_account_id = $2
             )`,
          [legacy.id, realId]
        );
        await client.query(
          'UPDATE task_google_links SET google_account_id = $1 WHERE google_account_id = $2',
          [realId, legacy.id]
        );
        await client.query('DELETE FROM google_accounts WHERE id = $1', [legacy.id]);
      }
      // The legacy single-token data now lives in google_accounts. Clear the
      // old column so the startup migration stops recreating the placeholder
      // on every deploy.
      await client.query(
        'UPDATE users SET google_refresh_token = NULL WHERE id = $1',
        [userId]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Legacy reconcile failed for account ${legacy.id} (non-fatal):`, err.message);
    } finally {
      client.release();
    }
  }
}

// Collapse same-title duplicates in an account's default task list: keep one
// task per title (preferring one the app already tracks), delete the rest in
// Google, and repoint any task_google_links for this account that referenced
// a deleted task to the survivor. Returns the set of surviving titles and the
// number deleted. Per-task failures are non-fatal.
async function dedupeGoogleTasksByTitle(tasksClient, accountId) {
  const items = [];
  let pageToken;
  do {
    const resp = await tasksClient.tasks.list({
      tasklist: '@default',
      maxResults: 100,
      showCompleted: true,
      showHidden: true,
      pageToken,
    });
    for (const t of resp.data.items || []) items.push(t);
    pageToken = resp.data.nextPageToken;
  } while (pageToken);

  const linkRes = await pool.query(
    'SELECT google_task_id FROM task_google_links WHERE google_account_id = $1',
    [accountId]
  );
  const trackedIds = new Set(linkRes.rows.map((r) => r.google_task_id));

  const byTitle = new Map();
  for (const t of items) {
    if (!t.id || !t.title) continue;
    const key = t.title.trim();
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(t);
  }

  // Map each title to the Google task that survives this dedupe pass.
  // Single-task groups also populate this map so sync-all can adopt
  // pre-existing, never-linked Google tasks (not just dedupe survivors).
  const survivingByTitle = new Map();
  let deleted = 0;

  for (const [title, group] of byTitle) {
    // Prefer a survivor the app already tracks so existing links stay valid.
    const survivor = group.find((g) => trackedIds.has(g.id)) || group[0];
    survivingByTitle.set(title, survivor.id);

    if (group.length < 2) continue;
    for (const victim of group) {
      if (victim.id === survivor.id) continue;
      try {
        await tasksClient.tasks.delete({ tasklist: '@default', task: victim.id });
        deleted += 1;
      } catch (err) {
        console.error(
          `Sync-all dedupe: delete ${victim.id} failed (non-fatal): ${err.message}`
        );
        continue;
      }
      // Keep the app's links valid by pointing them at the survivor.
      await pool.query(
        'UPDATE task_google_links SET google_task_id = $1 WHERE google_account_id = $2 AND google_task_id = $3',
        [survivor.id, accountId, victim.id]
      );
    }
  }

  return { survivingByTitle, deleted };
}

// List a user's connected Google accounts with their refresh tokens.
async function listGoogleAccounts(userId) {
  const result = await pool.query(
    'SELECT id, google_email, refresh_token FROM google_accounts WHERE user_id = $1 AND needs_reauth = FALSE ORDER BY created_at',
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
     WHERE tgl.task_id = $1 AND ga.needs_reauth = FALSE`,
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
    const googleSyncErrors = [];
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
        const error = accErr.message || String(accErr);
        console.error(`Link to account ${acc.id} failed (non-fatal):`, error);
        const needsReauth = isInvalidGrant(accErr);
        if (needsReauth) await markAccountNeedsReauth(acc.id);
        googleSyncErrors.push({ accountId: acc.id, error, needsReauth });
      }
    }

    res.json({ linked, googleSyncErrors });
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

    const googleSyncErrors = [];
    await Promise.all(
      links.map((l) =>
        getTasksClientForToken(l.refresh_token)
          .tasks.delete({ tasklist: '@default', task: l.google_task_id })
          .catch(captureGoogleError(googleSyncErrors, l, 'Google Tasks delete'))
      )
    );

    res.json({ message: 'Google Task links removed', googleSyncErrors });
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
router.reconcileLegacyAccounts = reconcileLegacyAccounts;
router.captureGoogleError = captureGoogleError;
router.isInvalidGrant = isInvalidGrant;
router.markAccountNeedsReauth = markAccountNeedsReauth;

module.exports = router;
