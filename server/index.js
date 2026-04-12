require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const googleRoutes = require('./routes/google');
const teamRoutes = require('./routes/teams');

const app = express();

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/teams', teamRoutes);

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
