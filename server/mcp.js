const express = require('express');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const auth = require('./middleware/auth');
const { agentRateLimiter } = require('./middleware/rateLimit');

// Remote MCP endpoint for BYO-AI agents (Claude/OpenAI/Gemini). Tools are thin
// wrappers over our own REST API: each handler makes a loopback HTTP call
// forwarding the caller's API token, so ownership checks, Google Tasks sync,
// and activity logging behave exactly as they do for the web app.
const BASE_URL = `http://127.0.0.1:${process.env.PORT || 3001}`;

const router = express.Router();
router.use(auth);
router.use((req, res, next) => {
  if (req.actor.type !== 'agent') {
    return res.status(401).json({ error: 'Use an API token (kbt_...) generated in Account Settings' });
  }
  next();
});
router.use(agentRateLimiter);

async function api(authHeader, method, path, body) {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function toolResult(r) {
  return {
    content: [{ type: 'text', text: JSON.stringify(r.data, null, 2) }],
    isError: !r.ok,
  };
}

function toolError(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

// Agents identify people by email; the REST API wants user ids. Resolves the
// email against the project's member list, erroring with that list so the
// agent can self-correct.
async function resolveAssignee(authHeader, projectId, email) {
  const r = await api(authHeader, 'GET', `/api/projects/${projectId}/members`);
  if (!r.ok) throw new Error(JSON.stringify(r.data));
  const match = r.data.find((m) => m.email.toLowerCase() === email.toLowerCase());
  if (!match) {
    throw new Error(
      `No project member with email "${email}". Members: ${r.data.map((m) => m.email).join(', ')}`
    );
  }
  return match.id;
}

async function getInboxProjectId(authHeader) {
  const r = await api(authHeader, 'GET', '/api/projects');
  if (!r.ok) throw new Error(JSON.stringify(r.data));
  const inbox = r.data.find((p) => p.is_inbox);
  if (!inbox) throw new Error('No Inbox project found; specify a project_id.');
  return inbox.id;
}

// Normalize a task row's due_date (ISO timestamp from JSON) to YYYY-MM-DD.
function toDateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function buildMcpServer(authHeader) {
  const server = new McpServer({ name: 'kanban-board', version: '1.0.0' });

  // Wraps a handler so thrown errors become isError results instead of
  // JSON-RPC internal errors the agent can't read.
  const guard = (fn) => async (args) => {
    try {
      return await fn(args);
    } catch (err) {
      return toolError(err.message || String(err));
    }
  };

  server.registerTool(
    'list_projects',
    {
      title: 'List projects',
      description:
        'List all projects the user is a member of. The project with is_inbox=true is the default quick-capture Inbox.',
      inputSchema: {},
    },
    guard(async () => toolResult(await api(authHeader, 'GET', '/api/projects')))
  );

  server.registerTool(
    'list_project_members',
    {
      title: 'List project members',
      description: 'List the members (id + email) of a project. Assignees must be members.',
      inputSchema: { project_id: z.number().int().describe('Project id') },
    },
    guard(async ({ project_id }) =>
      toolResult(await api(authHeader, 'GET', `/api/projects/${project_id}/members`))
    )
  );

  server.registerTool(
    'list_tasks',
    {
      title: 'List tasks',
      description:
        'List tasks on a project board, ordered by column position. Optionally include auto-archived tasks (completed more than a day ago).',
      inputSchema: {
        project_id: z.number().int().describe('Project id'),
        include_archived: z.boolean().optional().describe('Also return archived completed tasks'),
      },
    },
    guard(async ({ project_id, include_archived }) => {
      const board = await api(authHeader, 'GET', `/api/tasks/by-project/${project_id}`);
      if (!board.ok || !include_archived) return toolResult(board);
      const archived = await api(authHeader, 'GET', `/api/tasks/archived/by-project/${project_id}`);
      if (!archived.ok) return toolResult(archived);
      return toolResult({ ok: true, data: { tasks: board.data, archived: archived.data } });
    })
  );

  server.registerTool(
    'create_task',
    {
      title: 'Create task',
      description:
        'Create a task (status "todo"). Defaults to the user\'s Inbox project when project_id is omitted. Syncs to the user\'s connected Google Tasks accounts by default; when syncing and no due_date is given, the due date defaults to today.',
      inputSchema: {
        title: z.string().describe('Task title'),
        project_id: z.number().int().optional().describe('Project id; omit to use the Inbox'),
        description: z.string().optional().describe('Task description'),
        due_date: z.string().optional().describe('Due date, YYYY-MM-DD'),
        assignee_email: z.string().optional().describe('Assign to this project member (email)'),
        sync_to_google: z
          .boolean()
          .optional()
          .describe('Sync to connected Google Tasks accounts (default true)'),
      },
    },
    guard(async ({ title, project_id, description, due_date, assignee_email, sync_to_google }) => {
      const projectId = project_id ?? (await getInboxProjectId(authHeader));
      const assigned_to = assignee_email
        ? await resolveAssignee(authHeader, projectId, assignee_email)
        : undefined;
      return toolResult(
        await api(authHeader, 'POST', `/api/tasks/by-project/${projectId}`, {
          title,
          description,
          due_date,
          assigned_to,
          add_to_google: sync_to_google !== false,
        })
      );
    })
  );

  server.registerTool(
    'update_task',
    {
      title: 'Update task',
      description:
        'Update a task\'s title, description, due date, and/or assignee. Only provided fields change; pass null for due_date or assignee_email to clear them.',
      inputSchema: {
        task_id: z.number().int().describe('Task id'),
        title: z.string().optional(),
        description: z.string().optional(),
        due_date: z.string().nullable().optional().describe('YYYY-MM-DD, or null to clear'),
        assignee_email: z.string().nullable().optional().describe('Member email, or null to unassign'),
      },
    },
    guard(async ({ task_id, title, description, due_date, assignee_email }) => {
      // The REST PUT expects the full task body, so read-merge-write.
      const current = await api(authHeader, 'GET', `/api/tasks/${task_id}`);
      if (!current.ok) return toolResult(current);
      const task = current.data;

      let assigned_to = task.assigned_to;
      if (assignee_email === null) assigned_to = null;
      else if (assignee_email !== undefined) {
        assigned_to = await resolveAssignee(authHeader, task.project_id, assignee_email);
      }

      return toolResult(
        await api(authHeader, 'PUT', `/api/tasks/${task_id}`, {
          title: title !== undefined ? title : task.title,
          description: description !== undefined ? description : task.description,
          due_date: due_date !== undefined ? due_date : toDateOnly(task.due_date),
          assigned_to,
        })
      );
    })
  );

  server.registerTool(
    'move_task',
    {
      title: 'Move task',
      description:
        'Move a task to a board column (status), optionally at a position (0 = top). Completing/uncompleting also syncs status to Google Tasks.',
      inputSchema: {
        task_id: z.number().int().describe('Task id'),
        status: z.enum(['todo', 'in-progress', 'blocked', 'completed']).describe('Destination column'),
        position: z.number().int().optional().describe('Position in the column, 0 = top (default 0)'),
      },
    },
    guard(async ({ task_id, status, position }) =>
      toolResult(
        await api(authHeader, 'PUT', '/api/tasks/reorder', {
          taskId: task_id,
          newStatus: status,
          newPosition: position ?? 0,
        })
      )
    )
  );

  server.registerTool(
    'complete_task',
    {
      title: 'Complete task',
      description: 'Mark a task completed (moves it to the Completed column and syncs to Google Tasks).',
      inputSchema: { task_id: z.number().int().describe('Task id') },
    },
    guard(async ({ task_id }) =>
      toolResult(
        await api(authHeader, 'PUT', '/api/tasks/reorder', {
          taskId: task_id,
          newStatus: 'completed',
          newPosition: 0,
        })
      )
    )
  );

  server.registerTool(
    'delete_task',
    {
      title: 'Delete task',
      description: 'Permanently delete a task (also deletes its linked Google Tasks).',
      inputSchema: { task_id: z.number().int().describe('Task id') },
    },
    guard(async ({ task_id }) => toolResult(await api(authHeader, 'DELETE', `/api/tasks/${task_id}`)))
  );

  server.registerTool(
    'search_tasks',
    {
      title: 'Search tasks',
      description:
        'Search tasks by title/description substring across all projects the user belongs to (or one project).',
      inputSchema: {
        query: z.string().describe('Case-insensitive substring to match in title or description'),
        project_id: z.number().int().optional().describe('Limit to one project'),
        include_completed: z.boolean().optional().describe('Include completed tasks (default false)'),
      },
    },
    guard(async ({ query, project_id, include_completed }) => {
      const r = await api(
        authHeader,
        'GET',
        `/api/tasks/mine?scope=all&includeCompleted=${include_completed === true}`
      );
      if (!r.ok) return toolResult(r);
      const q = query.toLowerCase();
      const matches = r.data.filter(
        (t) =>
          (project_id === undefined || t.project_id === project_id) &&
          (t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q))
      );
      return toolResult({ ok: true, data: matches });
    })
  );

  return server;
}

// Stateless Streamable-HTTP: a fresh server + transport per request, so no
// session bookkeeping and no risk of one user's credentials leaking into
// another's tool calls. The server instance closes with the response.
router.post('/', async (req, res) => {
  try {
    const server = buildMcpServer(req.headers.authorization);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    // express.json() already parsed the body; hand it to the transport.
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP request error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

const methodNotAllowed = (req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed' },
    id: null,
  });
};
router.get('/', methodNotAllowed);
router.delete('/', methodNotAllowed);

module.exports = router;
