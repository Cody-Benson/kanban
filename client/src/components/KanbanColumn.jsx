import { Paper, Typography, Box, IconButton, Collapse } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Droppable } from '@hello-pangea/dnd';
import TaskCard from './TaskCard';

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

export default function KanbanColumn({ status, tasks, onEdit, onDelete, collapsible = false, collapsed = false, onToggleCollapse }) {
  const color = STATUS_COLORS[status];

  return (
    <Paper
      elevation={0}
      sx={{
        flex: collapsed ? '0 0 auto' : 1,
        minWidth: collapsed ? 'auto' : 260,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: STATUS_TINTS[status],
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: collapsible ? 'pointer' : 'default',
        }}
        onClick={collapsible ? onToggleCollapse : undefined}
      >
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
          {STATUS_LABELS[status]}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          · {tasks.length}
        </Typography>
        {collapsible && (
          <IconButton size="small" sx={{ ml: 'auto', p: 0.25 }}>
            {collapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        )}
      </Box>

      {!collapsed && (
        <Droppable droppableId={status}>
          {(provided, snapshot) => (
            <Box
              ref={provided.innerRef}
              {...provided.droppableProps}
              sx={{
                p: 1,
                flex: 1,
                minHeight: 120,
                overflowY: 'auto',
                backgroundColor: snapshot.isDraggingOver ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                transition: 'background-color 0.2s',
                borderTop: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              {tasks.length === 0 && !snapshot.isDraggingOver && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 100,
                    border: '1px dashed rgba(0,0,0,0.15)',
                    borderRadius: 1,
                    color: 'text.disabled',
                  }}
                >
                  <Typography variant="caption">No tasks</Typography>
                </Box>
              )}
              {tasks.map((task, index) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  index={index}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  accentColor={color}
                />
              ))}
              {provided.placeholder}
            </Box>
          )}
        </Droppable>
      )}
    </Paper>
  );
}
