# Refactor Plan: Flatten hierarchy to `users → projects → tasks`

**Status:** Approved, not yet started.
**Goal:** Collapse the over-engineered `orgs → teams → clients → projects → tasks`
hierarchy into a flat, Google-Docs-style model: you create a **project** and invite
people directly to it, with **roles & permissions**. Built to be simple for small
teams (a few people per project), Google-integrated, and AI-friendly.

## Target data model

```
users
  └─ projects        (created_by = owner, client VARCHAR label, no client_id)
       ├─ project_members   (access + role_id)
       ├─ project_invites   (pending, by email + role_id — no email send yet)
       ├─ roles             (system + custom; role_permissions = capabilities)
       └─ tasks
```

Removed entirely: `organizations`, `org_members`, `org_invites`, `teams`,
`team_members`, `team_invites`, `clients`. The old "client" becomes an optional
`projects.client` text label.

---

## Roles & permissions

### Roles (Phase 1 = fixed; custom roles = Phase 1b)
| Role | Capabilities |
|------|--------------|
| **Owner** | Everything, incl. owner-reserved actions. One per project (transferable). |
| **Editor** | View board; create/edit/move/assign/delete tasks; rename project. Default for invitees. |
| **Viewer** | View board only. |

### Owner-reserved permissions (never delegable, not even to custom roles)
`project.delete`, `member.invite`, `member.remove`, `role.manage`, `ownership.transfer`

### Delegable permissions (the building blocks for built-in + custom roles)
`task.view`, `task.create`, `task.update`, `task.delete`, `project.update`
(future: `comment.create`, …)

Default mappings: Owner = all · Editor = all `task.*` + `project.update` · Viewer = `task.view`.

**Why data-driven now:** modeling permissions as a capability set per role means the
Phase 1b custom-role builder is almost entirely UI — it writes a new role row with a
chosen capability set; the permission-check code never changes.

---

## Rollout: two deploys (live data, Railway auto-applies on push to main)

- **Deploy A — additive + switch.** Add new columns/tables, backfill, switch all code
  to the new model. Old tables (clients/teams/orgs) stay untouched → effectively
  reversible; old data remains to debug against.
- **Deploy B — drop.** After verifying in prod, a second migration drops the unused
  `clients`, `teams`, `team_*`, `org*` tables.

---

## Phase 1 — Deploy A

### Step 1 — Schema migration (guarded, in `runMigrations()`, server/index.js)
1. `projects` += `created_by INTEGER REFERENCES users(id)`, `client VARCHAR(255)`.
2. New tables (copy team versions @ index.js:81 / :89, s/team/project/):
   - `project_members` (+ `role_id INTEGER NOT NULL REFERENCES roles(id)`)
   - `project_invites` (+ `role_id INTEGER REFERENCES roles(id)`)
   - `roles` (id, project_id NULL=system, name, is_system, created_by, created_at)
   - `role_permissions` (role_id, permission, UNIQUE(role_id, permission))
3. Seed system roles (Owner/Editor/Viewer, is_system=true, project_id NULL) + their
   capability rows.
4. Indexes: `project_members(user_id)`, `project_members(project_id)`,
   `project_invites(email)`, `role_permissions(role_id)`.

### Step 2 — Backfill (guarded, runs once)
For each existing project, derive from the old chain:
- **owner** → `projects.client_id → clients.team_id → teams.created_by`
  (fallback to earliest `team_member` if `teams.created_by` is NULL); assign **Owner** role.
- **members** → same chain to `team_members`; insert one `project_members` row each,
  assign **Editor** role (preserves their current full access; UNIQUE dedupes).
- **client label** → copy `clients.name` into `projects.client`.
- Ensure the owner always also has a `project_members` row.

**Verify before trusting:** log counts of `projects without created_by` and
`projects with zero members`. Nothing is dropped in Deploy A regardless.

### Step 3 — Server routes
- `requirePermission(perm)` helper: resolve caller's `project_members.role_id` for the
  target project; owner-bypass for owner-reserved perms; else check `role_permissions`; 403 if missing.
- **projects.js** → top-level. One-hop `project_members` ownership. New endpoints ported
  from teams.js: `GET /api/projects`, `POST /api/projects` (create + self as Owner),
  `GET/PUT/DELETE /:id`, `GET /:id/members`, `POST /:id/invite` (owner-only, with role),
  `DELETE /:id/members/:userId` (owner-only), `PUT /:id/members/:userId/role` (owner-only),
  `GET /invites/pending`, `POST /invites/:id/accept|decline`.
- **tasks.js** → swap four-hop joins in `verifyTaskOwnership`, `assigned_to` validation,
  and `/mine` for the `project_members` check; gate mutations via `requirePermission`.
- **google.js** → repoint the 3 access joins (google.js:199, :497, :566) to
  `project_members`. **Targeting stays per-user — no behavior change** (fan-out = Phase 2).
- **Delete** clients.js, teams.js, orgs.js; remove their 3 mounts in index.js.

### Step 4 — Client
- **API:** delete orgs.js, clients.js; rewrite projects.js (drop clientId); add project
  member/invite/role calls; tasks/auth/google unchanged.
- **AuthContext:** remove org/team state, switchOrg/Team, refreshOrgs/Teams, and the
  `currentOrgId`/`currentTeamId` localStorage keys.
- **Pages:** delete OrgsPage, OrgSettingsPage, TeamsPage, TeamSettingsPage,
  ClientDetailPage. DashboardPage → project list (home) with project-invite pending UI.
  ProjectBoardPage → simplified breadcrumb + **Share panel** (member list + roles;
  owner-only invite/remove/role-change; read-only roster for non-owners).
- **Components:** KanbanBoard + MyTasksSection drop currentTeam/team_name/org_name,
  fetch assignees via project members; TaskDialog prop `teamMembers` → `projectMembers`.
  Capability-gate UI (e.g. Viewer: no add-task, drag disabled) — backend still enforces.
- **Routing (App.jsx):** remove `/orgs`, `/org-settings`, `/teams`, `/team-settings`,
  `/clients/:clientId`; `/` → project list; keep `/projects/:id` + archive route.

## Phase 1 — Deploy B
After Deploy A is verified in prod: migration to `DROP TABLE` the unused
`clients`, `teams`, `team_members`, `team_invites`, `organizations`, `org_members`,
`org_invites` (and drop `projects.client_id`).

## Phase 1b — Custom role builder (deferred)
UI listing delegable capabilities as checkboxes → save a custom `roles` row
(`project_id` set, is_system=false) + `role_permissions`, then assignable in the role
pickers. Cheap: the capability model already supports it; no schema rework.

---

## Later phases (out of scope for now)
- **Phase 2 — Google:** member-aware Tasks fan-out (sync shared tasks into each member's
  own accounts), real invite emails (wire up the unused server/email.js), Calendar for due dates.
- **Phase 3 — AI:** per-user API tokens + MCP server over the REST API (pluggable Claude/OpenAI/Gemini), optional activity log.
- **Phase 4 — Billing:** per-account (owner pays, collaborators free). Deferred until usage testing informs what's free vs paid.

## Notes / known trade-offs (accepted)
- No "company"/workspace object — billing later attaches to the project owner (user).
- Offboarding is per-project (remove from each project separately).
- Invites currently do NOT email; claimed by matching the invitee's account email.
