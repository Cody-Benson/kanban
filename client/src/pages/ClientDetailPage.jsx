import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, List, ListItem, ListItemText, ListItemSecondaryAction,
  IconButton, TextField, Button, Box, Paper, CircularProgress, Alert,
  Breadcrumbs, Link, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { getClient } from '../api/clients';
import { getProjects, createProject, updateProject, deleteProject } from '../api/projects';

export default function ClientDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [projects, setProjects] = useState([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editDialog, setEditDialog] = useState({ open: false, id: null, name: '' });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, name: '' });

  const load = async () => {
    try {
      const [c, p] = await Promise.all([getClient(clientId), getProjects(clientId)]);
      setClient(c);
      setProjects(p);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [clientId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createProject(clientId, newName.trim());
      setNewName('');
      load();
    } catch {
      setError('Failed to create project');
    }
  };

  const handleUpdate = async () => {
    if (!editDialog.name.trim()) return;
    try {
      await updateProject(editDialog.id, editDialog.name.trim());
      setEditDialog({ open: false, id: null, name: '' });
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
    } catch {
      setError('Failed to delete project');
    }
  };

  if (loading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 4 }} />;

  return (
    <>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate('/clients')}>
          Clients
        </Link>
        <Typography color="text.primary">{client?.name}</Typography>
      </Breadcrumbs>

      <Typography variant="h4" gutterBottom>Projects for {client?.name}</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <form onSubmit={handleCreate}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="New project name"
              size="small"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              sx={{ flex: 1 }}
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
              <ListItem
                button
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <ListItemText primary={project.name} />
                <ListItemSecondaryAction>
                  <IconButton onClick={() => setEditDialog({ open: true, id: project.id, name: project.name })}>
                    <EditIcon />
                  </IconButton>
                  <IconButton onClick={() => setDeleteDialog({ open: true, id: project.id, name: project.name })}>
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            </Paper>
          ))}
        </List>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onClose={() => setEditDialog({ open: false, id: null, name: '' })}>
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ open: false, id: null, name: '' })}>Cancel</Button>
          <Button onClick={handleUpdate} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, id: null, name: '' })}>
        <DialogTitle>Delete Project</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{deleteDialog.name}"? This will also delete all tasks in this project.
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
