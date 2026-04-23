import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography,
  Breadcrumbs,
  Link,
  CircularProgress,
  Box,
  Paper,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tooltip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Divider,
} from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import DeleteIcon from '@mui/icons-material/Delete';
import { getProject } from '../api/projects';
import { getArchivedTasks, restoreTask, deleteTask } from '../api/tasks';

export default function ArchivedTasksPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialog, setDeleteDialog] = useState({ open: false, task: null });

  const load = useCallback(async () => {
    try {
      const [proj, archived] = await Promise.all([
        getProject(projectId),
        getArchivedTasks(projectId),
      ]);
      setProject(proj);
      setTasks(archived);
    } catch {
      setError('Failed to load archived tasks');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleRestore = async (task) => {
    try {
      await restoreTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch {
      setError('Failed to restore task');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTask(deleteDialog.task.id);
      setTasks((prev) => prev.filter((t) => t.id !== deleteDialog.task.id));
      setDeleteDialog({ open: false, task: null });
    } catch {
      setError('Failed to delete task');
    }
  };

  if (loading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 4 }} />;

  return (
    <>
      <Breadcrumbs sx={{ mb: 1 }}>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate('/clients')}>
          Clients
        </Link>
        {project && (
          <Link
            underline="hover"
            color="inherit"
            sx={{ cursor: 'pointer' }}
            onClick={() => navigate(`/clients/${project.client_id}`)}
          >
            {project.client_name}
          </Link>
        )}
        <Link
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer' }}
          onClick={() => navigate(`/projects/${projectId}`)}
        >
          {project?.name}
        </Link>
        <Typography color="text.primary">Archive</Typography>
      </Breadcrumbs>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Archived Tasks
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Completed more than 1 day ago
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {tasks.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
          <Typography>No archived tasks yet.</Typography>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {tasks.map((task, i) => (
              <Box key={task.id}>
                {i > 0 && <Divider component="li" />}
                <ListItem
                  secondaryAction={
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Restore to board">
                        <IconButton edge="end" onClick={() => handleRestore(task)}>
                          <RestoreIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete permanently">
                        <IconButton edge="end" onClick={() => setDeleteDialog({ open: true, task })}>
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={task.title}
                    secondary={
                      <Box component="span" sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        <span>
                          Completed {new Date(task.completed_at).toLocaleDateString(undefined, {
                            year: 'numeric', month: 'short', day: 'numeric',
                          })}
                        </span>
                        {task.assigned_email && <span>Assigned: {task.assigned_email}</span>}
                      </Box>
                    }
                  />
                </ListItem>
              </Box>
            ))}
          </List>
        </Paper>
      )}

      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, task: null })}>
        <DialogTitle>Delete Task</DialogTitle>
        <DialogContent>
          <Typography>
            Permanently delete "{deleteDialog.task?.title}"? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, task: null })}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
