require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const googleRoutes = require('./routes/google');
const tokenRoutes = require('./routes/tokens');
const mcpRoutes = require('./mcp');

const app = express();

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/tokens', tokenRoutes);
// MCP endpoint for BYO-AI agents. Must stay above the SPA catch-all.
app.use('/mcp', mcpRoutes);

// Serve static frontend in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const pool = require('./db');

async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      google_refresh_token TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS default_assignee_email VARCHAR(255);
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in-progress', 'completed')),
      position INTEGER NOT NULL DEFAULT 0,
      due_date DATE,
      google_task_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
    CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id_status ON tasks(project_id, status);

    -- Teams tables
    CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(team_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS team_invites (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      invited_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(team_id, email)
    );

    CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
    CREATE INDEX IF NOT EXISTS idx_team_invites_email ON team_invites(email);

    -- Organizations tables
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS org_members (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(org_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS org_invites (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      invited_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(org_id, email)
    );

    CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON org_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON org_members(org_id);
    CREATE INDEX IF NOT EXISTS idx_org_invites_email ON org_invites(email);
  `);

  // Add team_id to clients (if not already present)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'team_id'
      ) THEN
        ALTER TABLE clients ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_clients_team_id ON clients(team_id);
  `);

  // Add assigned_to to tasks (if not already present)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'assigned_to'
      ) THEN
        ALTER TABLE tasks ADD COLUMN assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  // Add completed_at to tasks (timestamp when task entered 'completed'; drives auto-archive after 1 day)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'completed_at'
      ) THEN
        ALTER TABLE tasks ADD COLUMN completed_at TIMESTAMP;
        -- Backfill existing completed tasks: treat them as just-completed so they
        -- show up on the board for a day and don't all vanish on first deploy.
        UPDATE tasks SET completed_at = NOW() WHERE status = 'completed';
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at);
  `);

  // Update tasks.status CHECK constraint to include 'blocked'
  await pool.query(`
    ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
    ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
      CHECK (status IN ('todo', 'in-progress', 'blocked', 'completed'));
  `);

  // Multiple Google accounts per user; a task fanned out to many accounts.
  await pool.query(`
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
    ALTER TABLE google_accounts
      ADD COLUMN IF NOT EXISTS needs_reauth BOOLEAN NOT NULL DEFAULT FALSE;
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
  `);

  // --- Flatten refactor (Deploy A): projects own themselves (created_by) and
  // carry an optional "client" text label; project_members replaces the old
  // team→client access chain. Old tables are kept until Deploy B. ---
  await pool.query(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS client VARCHAR(255);
    ALTER TABLE projects ALTER COLUMN client_id DROP NOT NULL;
    CREATE TABLE IF NOT EXISTS project_members (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(project_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
  `);

  // One-time backfill from the old hierarchy. Idempotent (guarded UPDATEs +
  // ON CONFLICT DO NOTHING), so it's safe to re-run on every boot until Deploy B.
  await pool.query(`
    -- Owner = the old team's creator; fall back to the earliest team member.
    UPDATE projects p SET created_by = COALESCE(
      (SELECT t.created_by FROM clients c JOIN teams t ON c.team_id = t.id WHERE c.id = p.client_id),
      (SELECT tm.user_id FROM clients c JOIN team_members tm ON c.team_id = tm.team_id
        WHERE c.id = p.client_id ORDER BY tm.created_at, tm.id LIMIT 1)
    )
    WHERE p.created_by IS NULL AND p.client_id IS NOT NULL;

    -- Carry the old client name across as the project's text label.
    UPDATE projects p SET client = (SELECT c.name FROM clients c WHERE c.id = p.client_id)
    WHERE p.client IS NULL AND p.client_id IS NOT NULL;

    -- Members = everyone on the project's old team (so nobody loses access).
    INSERT INTO project_members (project_id, user_id)
    SELECT DISTINCT p.id, tm.user_id
    FROM projects p
    JOIN clients c ON p.client_id = c.id
    JOIN team_members tm ON c.team_id = tm.team_id
    ON CONFLICT (project_id, user_id) DO NOTHING;

    -- Ensure the owner is always a member.
    INSERT INTO project_members (project_id, user_id)
    SELECT p.id, p.created_by FROM projects p WHERE p.created_by IS NOT NULL
    ON CONFLICT (project_id, user_id) DO NOTHING;
  `);

  // Migrate legacy single-token data into the new multi-account tables.
  //
  // Two guards make this idempotent against manual cleanup:
  //
  //  1. The legacy placeholder is created ONLY if the user has no existing
  //     google_accounts row. Once a real account is connected (or the user
  //     has manually deleted a stuck placeholder), the migration stops
  //     resurrecting `legacy-<id>@unknown` on every deploy.
  //
  //  2. The task_google_links backfill links ONLY to the legacy placeholder
  //     row. Without this filter, the join `ga.user_id = tm.user_id` matched
  //     every account the user has and inserted links using the OLD
  //     tasks.google_task_id — a dead pointer in any real account's Tasks
  //     list, which then breaks future patches for those tasks.
  await pool.query(`
    INSERT INTO google_accounts (user_id, google_email, refresh_token)
    SELECT id, 'legacy-' || id || '@unknown', google_refresh_token
    FROM users u
    WHERE google_refresh_token IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM google_accounts ga WHERE ga.user_id = u.id
      )
    ON CONFLICT (user_id, google_email) DO NOTHING;

    INSERT INTO task_google_links (task_id, google_account_id, google_task_id)
    SELECT t.id, ga.id, t.google_task_id
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    JOIN clients c ON p.client_id = c.id
    JOIN team_members tm ON c.team_id = tm.team_id
    JOIN google_accounts ga
      ON ga.user_id = tm.user_id
     AND ga.google_email LIKE 'legacy-%@unknown'
    WHERE t.google_task_id IS NOT NULL
    ON CONFLICT (task_id, google_account_id) DO NOTHING;
  `);

  // Data migration: create default team for each user with un-migrated clients
  await pool.query(`
    DO $$
    DECLARE
      r RECORD;
      new_team_id INTEGER;
    BEGIN
      FOR r IN SELECT id, email FROM users
        WHERE id IN (SELECT DISTINCT user_id FROM clients WHERE team_id IS NULL)
      LOOP
        INSERT INTO teams (name, created_by) VALUES (r.email || '''s Team', r.id)
        RETURNING id INTO new_team_id;

        INSERT INTO team_members (team_id, user_id) VALUES (new_team_id, r.id)
        ON CONFLICT DO NOTHING;

        UPDATE clients SET team_id = new_team_id
        WHERE user_id = r.id AND team_id IS NULL;
      END LOOP;
    END $$;
  `);

  // Make team_id NOT NULL once all rows are migrated
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM clients WHERE team_id IS NULL) THEN
        BEGIN
          ALTER TABLE clients ALTER COLUMN team_id SET NOT NULL;
        EXCEPTION WHEN others THEN
          NULL; -- already NOT NULL
        END;
      END IF;
    END $$;
  `);

  // Add org_id to teams (if not already present)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'teams' AND column_name = 'org_id'
      ) THEN
        ALTER TABLE teams ADD COLUMN org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_teams_org_id ON teams(org_id);
  `);

  // Data migration: create default org for each user with teams not yet assigned to an org
  await pool.query(`
    DO $$
    DECLARE
      r RECORD;
      new_org_id INTEGER;
    BEGIN
      FOR r IN SELECT DISTINCT u.id, u.email FROM users u
        JOIN team_members tm ON u.id = tm.user_id
        JOIN teams t ON tm.team_id = t.id
        WHERE t.org_id IS NULL
      LOOP
        INSERT INTO organizations (name, created_by) VALUES (r.email || '''s Org', r.id)
        RETURNING id INTO new_org_id;

        INSERT INTO org_members (org_id, user_id) VALUES (new_org_id, r.id)
        ON CONFLICT DO NOTHING;

        UPDATE teams SET org_id = new_org_id
        WHERE id IN (SELECT team_id FROM team_members WHERE user_id = r.id)
        AND org_id IS NULL;
      END LOOP;
    END $$;
  `);

  // Make org_id NOT NULL once all rows are migrated
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM teams WHERE org_id IS NULL) THEN
        BEGIN
          ALTER TABLE teams ALTER COLUMN org_id SET NOT NULL;
        EXCEPTION WHEN others THEN
          NULL; -- already NOT NULL
        END;
      END IF;
    END $$;
  `);

  // Password reset tokens table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(64) UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
  `);

  // --- Phase 3 (BYO-AI): per-user API tokens, per-user Inbox project, and
  // the activity log that records who (human vs. agent token) changed what. ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      token_hash VARCHAR(64) UNIQUE NOT NULL,
      token_prefix VARCHAR(12) NOT NULL,
      last_used_at TIMESTAMP,
      revoked_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id);

    ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_inbox BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_one_inbox_per_user
      ON projects(created_by) WHERE is_inbox;

    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_type VARCHAR(10) NOT NULL CHECK (actor_type IN ('human', 'agent')),
      token_id INTEGER REFERENCES api_tokens(id) ON DELETE SET NULL,
      action VARCHAR(50) NOT NULL,
      details JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_activity_log_task_id ON activity_log(task_id);
    CREATE INDEX IF NOT EXISTS idx_activity_log_project ON activity_log(project_id, created_at DESC);
  `);

  // Backfill: every existing user gets an Inbox project (quick-capture target
  // for agent-created tasks with no project specified).
  await pool.query(`
    DO $$
    DECLARE
      r RECORD;
      new_project_id INTEGER;
    BEGIN
      FOR r IN SELECT u.id FROM users u
        WHERE NOT EXISTS (
          SELECT 1 FROM projects p WHERE p.created_by = u.id AND p.is_inbox
        )
      LOOP
        INSERT INTO projects (name, created_by, is_inbox) VALUES ('Inbox', r.id, TRUE)
        RETURNING id INTO new_project_id;

        INSERT INTO project_members (project_id, user_id) VALUES (new_project_id, r.id)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END $$;
  `);

  // Collapse legacy-<id>@unknown placeholder accounts onto the real Google
  // account once their true email can be resolved, so one physical account
  // maps to exactly one row (prevents duplicate task fan-out).
  try {
    const legacyUsers = await pool.query(
      "SELECT DISTINCT user_id FROM google_accounts WHERE google_email LIKE 'legacy-%@unknown'"
    );
    for (const row of legacyUsers.rows) {
      await googleRoutes.reconcileLegacyAccounts(row.user_id);
    }
  } catch (err) {
    console.error('Legacy account reconciliation failed (non-fatal):', err.message);
  }

  console.log('Database migrations completed.');
}

const PORT = process.env.PORT || 3001;
runMigrations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
