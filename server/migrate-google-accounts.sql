\c kanban

-- Multiple Google accounts per user, and a task fanned out to many accounts.

CREATE TABLE IF NOT EXISTS google_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_email VARCHAR(255) NOT NULL,
  refresh_token TEXT NOT NULL,
  has_tasks_scope BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, google_email)
);

ALTER TABLE google_accounts
  ADD COLUMN IF NOT EXISTS has_tasks_scope BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS task_google_links (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  google_account_id INTEGER NOT NULL REFERENCES google_accounts(id) ON DELETE CASCADE,
  google_task_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (task_id, google_account_id)
);

CREATE INDEX IF NOT EXISTS idx_google_accounts_user_id ON google_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_task_google_links_task_id ON task_google_links(task_id);

-- Migrate existing single-token users. The real email is unknown until the
-- next OAuth connect, so use a placeholder; reconnecting the same account
-- creates the properly-labelled row and this legacy one can be ignored.
INSERT INTO google_accounts (user_id, google_email, refresh_token)
SELECT id, 'legacy-' || id || '@unknown', google_refresh_token
FROM users
WHERE google_refresh_token IS NOT NULL
ON CONFLICT (user_id, google_email) DO NOTHING;

-- Migrate existing per-task links onto the legacy account row.
INSERT INTO task_google_links (task_id, google_account_id, google_task_id)
SELECT t.id, ga.id, t.google_task_id
FROM tasks t
JOIN projects p ON t.project_id = p.id
JOIN clients c ON p.client_id = c.id
JOIN team_members tm ON c.team_id = tm.team_id
JOIN google_accounts ga ON ga.user_id = tm.user_id
WHERE t.google_task_id IS NOT NULL
ON CONFLICT (task_id, google_account_id) DO NOTHING;
