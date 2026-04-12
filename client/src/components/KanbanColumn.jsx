import { Paper, Typography, Box, Badge } from '@mui/material';
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

export default function KanbanColumn({ status, tasks, onEdit, onDelete }) {
  return (
    <Paper
      sx={{
        flex: 1,
        minWidth: 280,
        maxWidth: 400,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f5f5f5',
      }}
    >
      <Box
        sx={{
          p: 2,
          borderBottom: `3px solid ${STATUS_COLORS[status]}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {STATUS_LABELS[status]}
        </Typography>
        <Badge badgeContent={tasks.length} color="primary" sx={{ ml: 1 }} />
      </Box>

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <Box
            ref={provided.innerRef}
            {...provided.droppableProps}
            sx={{
              p: 1,
              flex: 1,
              minHeight: 200,
              overflowY: 'auto',
              backgroundColor: snapshot.isDraggingOver ? '#e8eaf6' : 'transparent',
              transition: 'background-color 0.2s',
            }}
          >
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
            {provided.placeholder}
          </Box>
        )}
      </Droppable>
    </Paper>
  );
}
