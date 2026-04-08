import { Card, CardContent, Typography, IconButton, Box } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import { Tooltip } from '@mui/material';
import { Draggable } from '@hello-pangea/dnd';

export default function TaskCard({ task, index, onEdit, onDelete }) {
  const formattedDate = task.due_date
    ? new Date(task.due_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
    : null;

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
          }}
        >
          <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box sx={{ flex: 1, mr: 1 }}>
                <Typography variant="subtitle2">{task.title}</Typography>
                {task.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {task.description}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
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
                </Box>
              </Box>
              <Box sx={{ display: 'flex', flexShrink: 0 }}>
                <IconButton size="small" onClick={() => onEdit(task)}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => onDelete(task)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}
    </Draggable>
  );
}
