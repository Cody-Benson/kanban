import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, List, ListItem, ListItemText, ListItemSecondaryAction,
  IconButton, TextField, Button, Box, Paper, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Breadcrumbs, Link, Chip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonIcon from '@mui/icons-material/Person';
import { getTeamMembers, inviteMember, removeMember, deleteTeam } from '../api/teams';
import { useAuth } from '../context/AuthContext';

export default function TeamSettingsPage() {
  const { currentTeam, user, refreshTeams } = useAuth();
  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [removeDialog, setRemoveDialog] = useState({ open: false, member: null });
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const navigate = useNavigate();
  const isCreator = currentTeam?.created_by === user?.id;

  const loadMembers = async () => {
    if (!currentTeam) return;
    try {
      const data = await getTeamMembers(currentTeam.id);
      setMembers(data);
    } catch {
      setError('Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMembers(); }, [currentTeam]);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !currentTeam) return;
    setError('');
    setSuccess('');
    try {
      await inviteMember(currentTeam.id, inviteEmail.trim());
      setSuccess(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to send invite';
      setError(msg);
    }
  };

  const handleRemove = async () => {
    if (!removeDialog.member) return;
    try {
      await removeMember(currentTeam.id, removeDialog.member.id);
      setRemoveDialog({ open: false, member: null });
      if (removeDialog.member.id === user.id) {
        await refreshTeams();
        navigate('/');
      } else {
        loadMembers();
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to remove member';
      setError(msg);
      setRemoveDialog({ open: false, member: null });
    }
  };

  const handleDelete = async () => {
    if (!currentTeam) return;
    try {
      await deleteTeam(currentTeam.id);
      await refreshTeams();
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete team');
      setDeleteDialog(false);
    }
  };

  if (!currentTeam) {
    return <Typography color="text.secondary">No team selected.</Typography>;
  }

  if (loading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 4 }} />;

  return (
    <>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate('/clients')}>
          Clients
        </Link>
        <Typography color="text.primary">Team Settings</Typography>
      </Breadcrumbs>

      <Typography variant="h4" gutterBottom>{currentTeam.name}</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {/* Invite Section */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Invite a Team Member</Typography>
        <form onSubmit={handleInvite}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Email address"
              size="small"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button type="submit" variant="contained">Invite</Button>
          </Box>
        </form>
      </Paper>

      {/* Members List */}
      <Typography variant="h6" gutterBottom>
        Members ({members.length})
      </Typography>
      <List>
        {members.map((member) => (
          <Paper key={member.id} sx={{ mb: 1 }}>
            <ListItem>
              <PersonIcon sx={{ mr: 1.5, color: 'text.secondary' }} />
              <ListItemText
                primary={member.email}
                secondary={member.id === user?.id ? 'You' : null}
              />
              <ListItemSecondaryAction>
                {member.id === user?.id ? (
                  <Chip
                    label="Leave"
                    size="small"
                    variant="outlined"
                    onClick={() => setRemoveDialog({ open: true, member })}
                    sx={{ cursor: 'pointer' }}
                  />
                ) : (
                  <IconButton onClick={() => setRemoveDialog({ open: true, member })}>
                    <DeleteIcon />
                  </IconButton>
                )}
              </ListItemSecondaryAction>
            </ListItem>
          </Paper>
        ))}
      </List>

      {isCreator && (
        <Paper sx={{ p: 2, mt: 4, border: '1px solid', borderColor: 'error.main' }}>
          <Typography variant="subtitle1" color="error" gutterBottom>Danger Zone</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Deleting this team will permanently remove all its clients, projects, and tasks.
          </Typography>
          <Button color="error" variant="outlined" onClick={() => { setDeleteConfirmName(''); setDeleteDialog(true); }}>
            Delete Team
          </Button>
        </Paper>
      )}

      {/* Remove/Leave Confirmation */}
      <Dialog open={removeDialog.open} onClose={() => setRemoveDialog({ open: false, member: null })}>
        <DialogTitle>
          {removeDialog.member?.id === user?.id ? 'Leave Team' : 'Remove Member'}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {removeDialog.member?.id === user?.id
              ? `Are you sure you want to leave "${currentTeam.name}"?`
              : `Remove ${removeDialog.member?.email} from the team?`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveDialog({ open: false, member: null })}>Cancel</Button>
          <Button onClick={handleRemove} color="error" variant="contained">
            {removeDialog.member?.id === user?.id ? 'Leave' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle>Delete Team</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            This will permanently delete <strong>{currentTeam.name}</strong> and all its clients, projects, and tasks. This cannot be undone.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Type the team name to confirm:
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
            placeholder={currentTeam.name}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>Cancel</Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={deleteConfirmName !== currentTeam.name}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
