import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, List, ListItem, ListItemText, ListItemSecondaryAction,
  IconButton, TextField, Button, Box, Paper, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { getProjects, createProject, updateProject, deleteProject } from '../api/projects';
import { useAuth } from '../context/AuthContext';
import MyTasksSection from '../components/MyTasksSection';

export default function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [newName, setNewName] = useState('');
  const [newClient, setNewClient] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editDialog, setEditDialog] = useState({ open: false, id: null, name: '', client: '' });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, name: '' });
  const navigate = useNavigate();

  const load = async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch {
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createProject(newName.trim(), newClient.trim() || null);
      setNewName('');
      setNewClient('');
      load();
    } catch {
      setError('Failed to create project');
    }
  };

  const handleUpdate = async () => {
    if (!editDialog.name.trim()) return;
    try {
      await updateProject(editDialog.id, {
        name: editDialog.name.trim(),
        client: editDialog.client.trim() || null,
      });
      setEditDialog({ open: false, id: null, name: '', client: '' });
      load();
    } catch {
      setError('Failed to update project');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProject(deleteDialog.id);
      setDeleteDialog({ open: false, id: null, name: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete project');
    }
  };

  if (loading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 4 }} />;

  return (
    <>
      <MyTasksSection />

      <Typography variant="h4" gutterBottom>Projects</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <form onSubmit={handleCreate}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="New project name"
              size="small"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              sx={{ flex: 2, minWidth: 200 }}
            />
            <TextField
              label="Client (optional)"
              size="small"
              value={newClient}
              onChange={(e) => setNewClient(e.target.value)}
              sx={{ flex: 1, minWidth: 160 }}
            />
            <Button type="submit" variant="contained">Add Project</Button>
          </Box>
        </form>
      </Paper>

      {projects.length === 0 ? (
        <Typography color="text.secondary">No projects yet. Create one above.</Typography>
      ) : (
        <List>
          {projects.map((project) => (
            <Paper key={project.id} sx={{ mb: 1 }}>
              <ListItem button onClick={() => navigate(`/projects/${project.id}`)}>
                <ListItemText primary={project.name} secondary={project.client || null} />
                <ListItemSecondaryAction>
                  <IconButton onClick={() => setEditDialog({ open: true, id: project.id, name: project.name, client: project.client || '' })}>
                    <EditIcon />
                  </IconButton>
                  {project.created_by === user?.id && (
                    <IconButton onClick={() => setDeleteDialog({ open: true, id: project.id, name: project.name })}>
                      <DeleteIcon />
                    </IconButton>
                  )}
                </ListItemSecondaryAction>
              </ListItem>
            </Paper>
          ))}
        </List>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onClose={() => setEditDialog({ open: false, id: null, name: '', client: '' })}>
        <DialogTitle>Edit Project</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Project name"
            value={editDialog.name}
            onChange={(e) => setEditDialog({ ...editDialog, name: e.target.value })}
          />
          <TextField
            fullWidth
            margin="dense"
            label="Client (optional)"
            value={editDialog.client}
            onChange={(e) => setEditDialog({ ...editDialog, client: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ open: false, id: null, name: '', client: '' })}>Cancel</Button>
          <Button onClick={handleUpdate} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, id: null, name: '' })}>
        <DialogTitle>Delete Project</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{deleteDialog.name}"? This will also delete all tasks in it.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, id: null, name: '' })}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
