import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, List, ListItem, ListItemText, ListItemSecondaryAction,
  IconButton, TextField, Button, Box, Paper, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { getClients, createClient, updateClient, deleteClient } from '../api/clients';
import { getPendingInvites, acceptInvite, declineInvite } from '../api/teams';
import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
  const { currentTeam, teamsLoading, refreshTeams } = useAuth();
  const [clients, setClients] = useState([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editDialog, setEditDialog] = useState({ open: false, id: null, name: '' });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, name: '' });
  const [pendingInvites, setPendingInvites] = useState([]);
  const navigate = useNavigate();

  const load = async () => {
    if (!currentTeam) {
      setLoading(false);
      return;
    }
    try {
      const data = await getClients(currentTeam.id);
      setClients(data);
    } catch {
      setError('Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!teamsLoading) load();
  }, [currentTeam, teamsLoading]);

  useEffect(() => {
    getPendingInvites().then(setPendingInvites).catch(() => {});
  }, []);

  const handleAcceptInvite = async (inviteId) => {
    try {
      await acceptInvite(inviteId);
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
      await refreshTeams();
    } catch {
      setError('Failed to accept invite');
    }
  };

  const handleDeclineInvite = async (inviteId) => {
    try {
      await declineInvite(inviteId);
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch {
      setError('Failed to decline invite');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !currentTeam) return;
    try {
      await createClient(newName.trim(), currentTeam.id);
      setNewName('');
      load();
    } catch {
      setError('Failed to create client');
    }
  };

  const handleUpdate = async () => {
    if (!editDialog.name.trim()) return;
    try {
      await updateClient(editDialog.id, editDialog.name.trim());
      setEditDialog({ open: false, id: null, name: '' });
      load();
    } catch {
      setError('Failed to update client');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteClient(deleteDialog.id);
      setDeleteDialog({ open: false, id: null, name: '' });
      load();
    } catch {
      setError('Failed to delete client');
    }
  };

  if (teamsLoading || loading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 4 }} />;

  return (
    <>
      {pendingInvites.length > 0 && (
        <Paper sx={{ p: 2, mb: 3, backgroundColor: '#e3f2fd' }}>
          <Typography variant="subtitle2" gutterBottom>Pending Team Invites</Typography>
          {pendingInvites.map((invite) => (
            <Box key={invite.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="body2" sx={{ flex: 1 }}>
                You've been invited to join <strong>{invite.team_name}</strong>
              </Typography>
              <Button size="small" variant="contained" onClick={() => handleAcceptInvite(invite.id)}>
                Accept
              </Button>
              <Button size="small" onClick={() => handleDeclineInvite(invite.id)}>
                Decline
              </Button>
            </Box>
          ))}
        </Paper>
      )}

      <Typography variant="h4" gutterBottom>Clients</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {!currentTeam ? (
        <Typography color="text.secondary">No team found. Create one in Team Settings.</Typography>
      ) : (
        <>
          <Paper sx={{ p: 2, mb: 3 }}>
            <form onSubmit={handleCreate}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="New client name"
                  size="small"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  sx={{ flex: 1 }}
                />
                <Button type="submit" variant="contained">Add Client</Button>
              </Box>
            </form>
          </Paper>

          {clients.length === 0 ? (
            <Typography color="text.secondary">No clients yet. Create one above.</Typography>
          ) : (
            <List>
              {clients.map((client) => (
                <Paper key={client.id} sx={{ mb: 1 }}>
                  <ListItem
                    button
                    onClick={() => navigate(`/clients/${client.id}`)}
                  >
                    <ListItemText primary={client.name} />
                    <ListItemSecondaryAction>
                      <IconButton onClick={() => setEditDialog({ open: true, id: client.id, name: client.name })}>
                        <EditIcon />
                      </IconButton>
                      <IconButton onClick={() => setDeleteDialog({ open: true, id: client.id, name: client.name })}>
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                </Paper>
              ))}
            </List>
          )}
        </>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onClose={() => setEditDialog({ open: false, id: null, name: '' })}>
        <DialogTitle>Edit Client</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Client name"
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
        <DialogTitle>Delete Client</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{deleteDialog.name}"? This will also delete all projects and tasks under this client.
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
