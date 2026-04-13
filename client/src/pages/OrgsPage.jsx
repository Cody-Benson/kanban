import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Box, Paper, Card, CardContent, CardActionArea,
  Grid, TextField, Button, Alert, CircularProgress,
} from '@mui/material';
import CorporateFareIcon from '@mui/icons-material/CorporateFare';
import AddIcon from '@mui/icons-material/Add';
import { getPendingOrgInvites, acceptOrgInvite, declineOrgInvite, createOrg } from '../api/orgs';
import { useAuth } from '../context/AuthContext';

export default function OrgsPage() {
  const { orgs, switchOrg, refreshOrgs, loading } = useAuth();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    getPendingOrgInvites().then(setPendingInvites).catch(() => {});
  }, []);

  const handleSelectOrg = async (org) => {
    await switchOrg(org.id);
    navigate('/teams');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createOrg(newName.trim());
      setNewName('');
      await refreshOrgs();
    } catch {
      setError('Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  const handleAcceptInvite = async (inviteId) => {
    try {
      await acceptOrgInvite(inviteId);
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
      await refreshOrgs();
    } catch {
      setError('Failed to accept invite');
    }
  };

  const handleDeclineInvite = async (inviteId) => {
    try {
      await declineOrgInvite(inviteId);
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch {
      setError('Failed to decline invite');
    }
  };

  if (loading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 4 }} />;

  return (
    <>
      {pendingInvites.length > 0 && (
        <Paper sx={{ p: 2, mb: 3, backgroundColor: '#e3f2fd' }}>
          <Typography variant="subtitle2" gutterBottom>Pending Organization Invites</Typography>
          {pendingInvites.map((invite) => (
            <Box key={invite.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="body2" sx={{ flex: 1 }}>
                You've been invited to join <strong>{invite.org_name}</strong>
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

      <Typography variant="h4" gutterBottom>Your Organizations</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <form onSubmit={handleCreate}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="New organization name"
              size="small"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button type="submit" variant="contained" startIcon={<AddIcon />} disabled={creating}>
              Create Organization
            </Button>
          </Box>
        </form>
      </Paper>

      {orgs.length === 0 ? (
        <Typography color="text.secondary">No organizations yet. Create one above.</Typography>
      ) : (
        <Grid container spacing={2}>
          {orgs.map((org) => (
            <Grid item xs={12} sm={6} md={4} key={org.id}>
              <Card>
                <CardActionArea onClick={() => handleSelectOrg(org)}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <CorporateFareIcon color="primary" sx={{ fontSize: 40 }} />
                    <Box>
                      <Typography variant="h6">{org.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {org.member_count} {Number(org.member_count) === 1 ? 'member' : 'members'}
                      </Typography>
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </>
  );
}
