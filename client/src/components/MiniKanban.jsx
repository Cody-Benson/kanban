import { Box, Paper, Typography, Tooltip, Avatar } from '@mui/material';

const STATUS_LABELS = {
  'todo': 'To Do',
  'in-progress': 'In Progress',
  'blocked': 'Blocked',
  'completed': 'Completed',
};

const STATUS_COLORS = {
  'todo': '#1976d2',
  'in-progress': '#ed6c02',
  'blocked': '#d32f2f',
  'completed': '#2e7d32',
};

const STATUS_TINTS = {
  'todo': 'rgba(25, 118, 210, 0.06)',
  'in-progress': 'rgba(237, 108, 2, 0.06)',
  'blocked': 'rgba(211, 47, 47, 0.06)',
  'completed': 'rgba(46, 125, 50, 0.06)',
};

function dueDateInfo(due) {
  if (!due) return null;
  const d = new Date(due);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dUTC = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffDays = Math.round((dUTC - today) / 86400000);
  const label = dUTC.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  let color = 'text.secondary';
  let bg = 'rgba(0,0,0,0.04)';
  if (diffDays < 0) { color = '#b71c1c'; bg = 'rgba(211,47,47,0.1)'; }
  else if (diffDays === 0) { color = '#b26a00'; bg = 'rgba(237,108,2,0.12)'; }
  return { label, color, bg };
}

function MiniTaskRow({ task, onClick, showAssignee }) {
  const due = dueDateInfo(task.due_date);
  return (
    <Box
      onClick={() => onClick(task)}
      sx={{
        px: 1,
        py: 0.75,
        mb: 0.5,
        backgroundColor: 'white',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 1,
        cursor: 'pointer',
        '&:hover': { backgroundColor: '#f5f9ff', borderColor: 'rgba(25,118,210,0.4)' },
      }}
    >
      <Typography
        variant="body2"
        sx={{
          fontSize: 13,
          lineHeight: 1.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {task.title}
      </Typography>
      {(due || (showAssignee && task.assigned_email)) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
          {due && (
            <Box sx={{
              fontSize: 11,
              px: 0.75,
              py: 0.125,
              borderRadius: 0.5,
              backgroundColor: due.bg,
              color: due.color,
              fontWeight: 500,
            }}>
              {due.label}
            </Box>
          )}
          {showAssignee && task.assigned_email && (
            <Tooltip title={task.assigned_email} arrow>
              <Avatar sx={{ width: 18, height: 18, fontSize: 10, bgcolor: '#1976d2', ml: 'auto' }}>
                {task.assigned_email[0].toUpperCase()}
              </Avatar>
            </Tooltip>
          )}
        </Box>
      )}
    </Box>
  );
}

export default function MiniKanban({ tasksByStatus, statuses, onTaskClick, showAssignee }) {
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      {statuses.map((status) => {
        const tasks = tasksByStatus[status] || [];
        return (
          <Paper
            key={status}
            elevation={0}
            sx={{
              flex: 1,
              minWidth: 0,
              backgroundColor: STATUS_TINTS[status],
              border: '1px solid rgba(0,0,0,0.08)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box sx={{ px: 1, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: STATUS_COLORS[status] }} />
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {STATUS_LABELS[status]}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                · {tasks.length}
              </Typography>
            </Box>
            <Box sx={{ p: 0.75, pt: 0, flex: 1, minHeight: 60 }}>
              {tasks.length === 0 ? (
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 48,
                  border: '1px dashed rgba(0,0,0,0.12)',
                  borderRadius: 1,
                }}>
                  <Typography variant="caption" color="text.disabled">—</Typography>
                </Box>
              ) : (
                tasks.map((t) => (
                  <MiniTaskRow key={t.id} task={t} onClick={onTaskClick} showAssignee={showAssignee} />
                ))
              )}
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
