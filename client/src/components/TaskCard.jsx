import { Card, CardContent, Typography, IconButton, Box, Divider } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import { Tooltip, Avatar } from '@mui/material';
import { Draggable } from '@hello-pangea/dnd';

export default function TaskCard({ task, index, onEdit, onDelete, accentColor = '#1976d2' }) {
  const formattedDate = task.due_date
    ? new Date(task.due_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
    : null;

  const hasMeta = formattedDate || task.google_task_id || task.assigned_email;

  return (
    <Draggable draggableId={String(task.id)} index={index}>
      {(provided, snapshot) => (
        <Card
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          sx={{
            mb: 1,
            backgroundColor: snapshot.isDragging ? '#e3f2fd' : 'white',
            boxShadow: snapshot.isDragging ? 4 : 1,
            borderLeft: `3px solid ${accentColor}`,
            '&:hover .task-actions': { opacity: 1 },
          }}
        >
          <CardContent sx={{ py: 1.25, px: 1.5, '&:last-child': { pb: 1.25 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 0.5 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ lineHeight: 1.3 }}>{task.title}</Typography>
                {task.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.4 }}>
                    {task.description}
                  </Typography>
                )}
              </Box>
              <Box
                className="task-actions"
                sx={{
                  display: 'flex',
                  flexShrink: 0,
                  opacity: 0,
                  transition: 'opacity 0.15s',
                }}
              >
                <IconButton size="small" onClick={() => onEdit(task)} sx={{ p: 0.5 }}>
                  <EditIcon sx={{ fontSize: 16 }} />
                </IconButton>
                <IconButton size="small" onClick={() => onDelete(task)} sx={{ p: 0.5 }}>
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            </Box>
            {hasMeta && (
              <>
                <Divider sx={{ mt: 1, mb: 0.75 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {formattedDate && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <CalendarMonthIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                      <Typography variant="caption" color="text.secondary">
                        {formattedDate}
                      </Typography>
                    </Box>
                  )}
                  {task.google_task_id && (
                    <Tooltip title="Linked to Google Tasks" arrow>
                      <TaskAltIcon sx={{ fontSize: 14, color: '#4285f4' }} />
                    </Tooltip>
                  )}
                  {task.assigned_email && (
                    <Tooltip title={task.assigned_email} arrow>
                      <Avatar sx={{ width: 20, height: 20, fontSize: 11, bgcolor: '#1976d2', ml: 'auto' }}>
                        {task.assigned_email[0].toUpperCase()}
                      </Avatar>
                    </Tooltip>
                  )}
                </Box>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </Draggable>
  );
}
