import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, List, ListItem, ListItemText, ListItemSecondaryAction,
  IconButton, TextField, Button, Box, Paper, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Breadcrumbs, Link, Chip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PersonIcon from '@mui/icons-material/Person';
import { getOrgMembers, inviteOrgMember, removeOrgMember, updateOrg, deleteOrg } from '../api/orgs';
import { useAuth } from '../context/AuthContext';

export default function OrgSettingsPage() {
  const { currentOrg, user, refreshOrgs } = useAuth();
  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [removeDialog, setRemoveDialog] = useState({ open: false, member: null });
  const [editName, setEditName] = useState('');
  const [editing, setEditing] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const navigate = useNavigate();
  const isCreator = currentOrg?.created_by === user?.id;

  const loadMembers = async () => {
    if (!currentOrg) return;
    try {
      const data = await getOrgMembers(currentOrg.id);
      setMembers(data);
    } catch {
      setError('Failed to load organization members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMembers(); }, [currentOrg]);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !currentOrg) return;
    setError('');
    setSuccess('');
    try {
      await inviteOrgMember(currentOrg.id, inviteEmail.trim());
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
      await removeOrgMember(currentOrg.id, removeDialog.member.id);
      setRemoveDialog({ open: false, member: null });
      if (removeDialog.member.id === user.id) {
        await refreshOrgs();
        navigate('/orgs');
      } else {
        loadMembers();
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to remove member';
      setError(msg);
      setRemoveDialog({ open: false, member: null });
    }
  };

  const handleRename = async (e) => {
    e.preventDefault();
    if (!editName.trim() || !currentOrg) return;
    setError('');
    try {
      await updateOrg(currentOrg.id, editName.trim());
      await refreshOrgs();
      setEditing(false);
      setSuccess('Organization renamed');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to rename organization');
    }
  };

  const handleDelete = async () => {
    if (!currentOrg) return;
    try {
      await deleteOrg(currentOrg.id);
      await refreshOrgs();
      navigate('/orgs');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete organization');
      setDeleteDialog(false);
    }
  };

  if (!currentOrg) {
    return <Typography color="text.secondary">No organization selected.</Typography>;
  }

  if (loading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 4 }} />;

  return (
    <>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate('/orgs')}>
          Organizations
        </Link>
        <Typography color="text.primary">Organization Settings</Typography>
      </Breadcrumbs>

      {editing ? (
        <Paper sx={{ p: 2, mb: 2 }}>
          <form onSubmit={handleRename}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <TextField
                label="Organization name"
                size="small"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                sx={{ flex: 1 }}
                autoFocus
              />
              <Button type="submit" variant="contained">Save</Button>
              <Button onClick={() => setEditing(false)}>Cancel</Button>
            </Box>
          </form>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="h4">{currentOrg.name}</Typography>
          {isCreator && (
            <IconButton size="small" onClick={() => { setEditName(currentOrg.name); setEditing(true); }}>
              <EditIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Invite a Member</Typography>
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
            Deleting this organization will permanently remove all its teams, clients, projects, and tasks.
          </Typography>
          <Button color="error" variant="outlined" onClick={() => { setDeleteConfirmName(''); setDeleteDialog(true); }}>
            Delete Organization
          </Button>
        </Paper>
      )}

      <Dialog open={removeDialog.open} onClose={() => setRemoveDialog({ open: false, member: null })}>
        <DialogTitle>
          {removeDialog.member?.id === user?.id ? 'Leave Organization' : 'Remove Member'}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {removeDialog.member?.id === user?.id
              ? `Are you sure you want to leave "${currentOrg.name}"?`
              : `Remove ${removeDialog.member?.email} from the organization?`}
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
        <DialogTitle>Delete Organization</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            This will permanently delete <strong>{currentOrg.name}</strong> and all its teams, clients, projects, and tasks. This cannot be undone.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Type the organization name to confirm:
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
            placeholder={currentOrg.name}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>Cancel</Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={deleteConfirmName !== currentOrg.name}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
