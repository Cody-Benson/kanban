import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, CircularProgress, Alert, Chip, Button,
  ToggleButton, ToggleButtonGroup,
  Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MiniKanban from './MiniKanban';
import TaskDialog from './TaskDialog';
import { getMyTasks, updateTask } from '../api/tasks';
import { getTeamMembers } from '../api/teams';

const STATUSES = ['todo', 'in-progress', 'blocked', 'completed'];

const EXPANDED_KEY = 'myTasks:expanded';

function isOverdue(due) {
  if (!due) return false;
  const d = new Date(due);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dUTC = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return dUTC < today;
}

function isDueToday(due) {
  if (!due) return false;
  const d = new Date(due);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dUTC = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return dUTC.getTime() === today.getTime();
}

function isDueThisWeek(due) {
  if (!due) return false;
  const d = new Date(due);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dUTC = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const weekOut = new Date(today);
  weekOut.setDate(weekOut.getDate() + 7);
  return dUTC >= today && dUTC <= weekOut;
}

export default function MyTasksSection() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scope, setScope] = useState('mine');
  const [expanded, setExpanded] = useState(() => {
    try { return JSON.parse(localStorage.getItem(EXPANDED_KEY)) || {}; }
    catch { return {}; }
  });
  const [taskDialog, setTaskDialog] = useState({ open: false, task: null, teamMembers: [] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMyTasks({ scope, includeCompleted: true });
      setTasks(data);
    } catch {
      setError('Failed to load your tasks');
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded));
  }, [expanded]);

  // Group tasks by project_id
  const boards = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      if (!map.has(t.project_id)) {
        map.set(t.project_id, {
          project_id: t.project_id,
          project_name: t.project_name,
          client_name: t.client_name,
          team_id: t.team_id,
          team_name: t.team_name,
          org_name: t.org_name,
          tasks: [],
        });
      }
      map.get(t.project_id).tasks.push(t);
    }
    // Group tasks by status inside each board and sort by position
    const arr = Array.from(map.values()).map((b) => {
      const tasksByStatus = {};
      for (const s of STATUSES) {
        tasksByStatus[s] = b.tasks
          .filter((t) => t.status === s)
          .sort((a, c) => a.position - c.position);
      }
      return { ...b, tasksByStatus };
    });
    // Sort boards by org > team > client > project
    arr.sort((a, b) => {
      const ka = `${a.org_name}/${a.team_name}/${a.client_name}/${a.project_name}`;
      const kb = `${b.org_name}/${b.team_name}/${b.client_name}/${b.project_name}`;
      return ka.localeCompare(kb);
    });
    return arr;
  }, [tasks]);

  const summary = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'completed');
    return {
      overdue: open.filter((t) => isOverdue(t.due_date)).length,
      today: open.filter((t) => isDueToday(t.due_date)).length,
      week: open.filter((t) => isDueThisWeek(t.due_date)).length,
    };
  }, [tasks]);

  const handleToggleBoard = (projectId) => {
    setExpanded((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const handleExpandAll = () => {
    const next = {};
    for (const b of boards) next[b.project_id] = true;
    setExpanded(next);
  };

  const handleCollapseAll = () => setExpanded({});

  const handleTaskClick = async (task) => {
    let teamMembers = [];
    try {
      teamMembers = await getTeamMembers(task.team_id);
    } catch {
      // non-fatal
    }
    setTaskDialog({ open: true, task, teamMembers });
  };

  const handleSaveTask = async (title, description, dueDate, assignedTo) => {
    try {
      await updateTask(taskDialog.task.id, title, description, dueDate, assignedTo);
      setTaskDialog({ open: false, task: null, teamMembers: [] });
      load();
    } catch {
      setError('Failed to update task');
    }
  };

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Typography variant="h4">My Tasks</Typography>
        <Box sx={{ flex: 1 }} />
        <Chip label={`${summary.overdue} overdue`} color={summary.overdue > 0 ? 'error' : 'default'} variant={summary.overdue > 0 ? 'filled' : 'outlined'} size="small" />
        <Chip label={`${summary.today} due today`} color={summary.today > 0 ? 'warning' : 'default'} variant={summary.today > 0 ? 'filled' : 'outlined'} size="small" />
        <Chip label={`${summary.week} due this week`} variant="outlined" size="small" />
      </Box>

      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          value={scope}
          exclusive
          size="small"
          onChange={(_, v) => v && setScope(v)}
        >
          <ToggleButton value="mine">Only my tasks</ToggleButton>
          <ToggleButton value="all">All team tasks</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={handleExpandAll} disabled={boards.length === 0}>Expand all</Button>
        <Button size="small" onClick={handleCollapseAll} disabled={boards.length === 0}>Collapse all</Button>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <CircularProgress sx={{ display: 'block', mx: 'auto', my: 3 }} />
      ) : boards.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {scope === 'mine'
              ? "You have no assigned tasks. Toggle 'All team tasks' to see what your team is working on."
              : 'No tasks found.'}
          </Typography>
        </Paper>
      ) : (
        boards.map((b) => {
          const [todo, inProg, blocked, completed] = STATUSES.map((s) => b.tasksByStatus[s]?.length || 0);
          return (
            <Accordion
              key={b.project_id}
              expanded={!!expanded[b.project_id]}
              onChange={() => handleToggleBoard(b.project_id)}
              sx={{ mb: 1 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', flexWrap: 'wrap' }}>
                  <Typography
                    variant="subtitle1"
                    role="link"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); navigate(`/projects/${b.project_id}`); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(`/projects/${b.project_id}`);
                      }
                    }}
                    sx={{
                      fontWeight: 600,
                      color: 'primary.main',
                      cursor: 'pointer',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    {b.project_name}
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  <Typography variant="caption" color="text.secondary">
                    {todo} · {inProg} · {blocked} · {completed}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <MiniKanban
                  tasksByStatus={b.tasksByStatus}
                  statuses={STATUSES}
                  onTaskClick={handleTaskClick}
                  showAssignee={scope === 'all'}
                />
              </AccordionDetails>
            </Accordion>
          );
        })
      )}

      <TaskDialog
        open={taskDialog.open}
        task={taskDialog.task}
        onClose={() => setTaskDialog({ open: false, task: null, teamMembers: [] })}
        onSave={handleSaveTask}
        googleConnected={false}
        teamMembers={taskDialog.teamMembers}
      />
    </Box>
  );
}
