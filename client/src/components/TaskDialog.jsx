import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Box, Chip, CircularProgress,
} from '@mui/material';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import LinkIcon from '@mui/icons-material/Link';
import { getGoogleAuthUrl, createGoogleTask } from '../api/google';

export default function TaskDialog({ open, task, onClose, onSave, googleConnected, onTaskLinked }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [addingToGoogle, setAddingToGoogle] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setDueDate(task.due_date ? task.due_date.slice(0, 10) : '');
    } else {
      setTitle('');
      setDescription('');
      setDueDate('');
    }
  }, [task, open]);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave(title.trim(), description.trim(), dueDate || null);
  };

  const handleAddToGoogleTasks = async () => {
    if (!googleConnected) {
      // Redirect to Google OAuth
      try {
        const { url } = await getGoogleAuthUrl();
        window.location.href = url;
      } catch (err) {
        console.error('Failed to get Google auth URL:', err);
      }
      return;
    }

    setAddingToGoogle(true);
    try {
      await createGoogleTask(task.id);
      if (onTaskLinked) onTaskLinked();
    } catch (err) {
      console.error('Failed to add to Google Tasks:', err);
    } finally {
      setAddingToGoogle(false);
    }
  };

  const isExistingTask = !!task;
  const isLinkedToGoogle = !!task?.google_task_id;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{task ? 'Edit Task' : 'New Task'}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <TextField
          fullWidth
          margin="dense"
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          multiline
          rows={3}
        />
        <TextField
          fullWidth
          margin="dense"
          label="Due Date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        {isExistingTask && (
          <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            {isLinkedToGoogle ? (
              <Chip
                icon={<LinkIcon />}
                label="Linked to Google Tasks"
                color="success"
                size="small"
                variant="outlined"
              />
            ) : (
              <Button
                size="small"
                startIcon={addingToGoogle ? <CircularProgress size={16} /> : <TaskAltIcon />}
                onClick={handleAddToGoogleTasks}
                disabled={addingToGoogle}
              >
                {googleConnected ? 'Add to Google Tasks' : 'Connect Google & Add to Tasks'}
              </Button>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          {task ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
