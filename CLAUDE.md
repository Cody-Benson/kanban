# Kanban Board

A task management app organized as **Clients > Projects > Tasks**. Each user manages their own clients, creates projects under them, and tracks tasks on a Kanban board with drag-and-drop.

## Tech Stack

- **Frontend:** React (Vite) + Material UI + @hello-pangea/dnd
- **Backend:** Express.js + Node
- **Database:** PostgreSQL
- **Auth:** JWT (bcrypt password hashing)

## Project Structure

```
kanban-board/
  package.json              # npm workspaces root
  client/                   # React frontend (Vite, port 5173)
    src/
      api/                  # axios instance + API modules (auth, clients, projects, tasks)
      context/              # AuthContext (JWT token + user state)
      components/           # Layout, ProtectedRoute, KanbanBoard, KanbanColumn, TaskCard, TaskDialog
      pages/                # LoginPage, RegisterPage, DashboardPage, ClientDetailPage, ProjectBoardPage
  server/                   # Express backend (port 3001)
    index.js                # App entry point
    db.js                   # pg Pool connection
    init.sql                # Database schema
    .env                    # DB credentials + JWT secret (not committed)
    middleware/
      auth.js               # JWT verification middleware
    routes/
      auth.js               # POST /api/auth/register, /api/auth/login
      clients.js            # CRUD /api/clients
      projects.js           # CRUD /api/projects (nested under clients)
      tasks.js              # CRUD /api/tasks + PUT /api/tasks/reorder
```

## Data Model

`users → clients → projects → tasks` with cascading deletes.

- **tasks** have a `status` (todo, in-progress, completed) and `position` (integer for column ordering)
- All data is scoped to the authenticated user via ownership verification joins

## Running

```bash
npm install        # install all dependencies (workspaces)
npm run dev        # starts both client (5173) and server (3001) via concurrently
```

Requires a PostgreSQL database named `kanban`. Run `server/init.sql` to create the schema. Configure `server/.env` with your DB credentials.

## API Routes

All routes except auth require a `Bearer` token in the Authorization header.

- `POST /api/auth/register` / `POST /api/auth/login`
- `GET|POST /api/clients`, `GET|PUT|DELETE /api/clients/:id`
- `GET|POST /api/projects/by-client/:clientId`, `GET|PUT|DELETE /api/projects/:id`
- `GET|POST /api/tasks/by-project/:projectId`, `GET|PUT|DELETE /api/tasks/:id`
- `PUT /api/tasks/reorder` — drag-and-drop reorder/status change (transactional)

## Key Patterns

- **Ownership verification:** Every endpoint joins through the chain back to `users.id`
- **Optimistic updates:** Kanban board updates UI immediately on drag, reverts on API failure
- **Position management:** Integer positions rewritten in a transaction on every reorder
- **Auth state:** React Context for token/user, axios interceptor for auto-attaching JWT
