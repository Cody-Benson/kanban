import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Box, Paper, Card, CardContent, CardActionArea,
  Grid, TextField, Button, Alert, CircularProgress,
} from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import AddIcon from '@mui/icons-material/Add';
import { createTeam, getPendingInvites, acceptInvite, declineInvite } from '../api/teams';
import { useAuth } from '../context/AuthContext';

export default function TeamsPage() {
  const { teams, switchTeam, refreshTeams, teamsLoading } = useAuth();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    getPendingInvites().then(setPendingInvites).catch(() => {});
  }, []);

  const handleSelectTeam = (team) => {
    switchTeam(team.id);
    navigate('/');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createTeam(newName.trim());
      setNewName('');
      await refreshTeams();
    } catch {
      setError('Failed to create team');
    } finally {
      setCreating(false);
    }
  };

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

  if (teamsLoading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 4 }} />;

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

      <Typography variant="h4" gutterBottom>Your Teams</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <form onSubmit={handleCreate}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="New team name"
              size="small"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button type="submit" variant="contained" startIcon={<AddIcon />} disabled={creating}>
              Create Team
            </Button>
          </Box>
        </form>
      </Paper>

      {teams.length === 0 ? (
        <Typography color="text.secondary">No teams yet. Create one above.</Typography>
      ) : (
        <Grid container spacing={2}>
          {teams.map((team) => (
            <Grid item xs={12} sm={6} md={4} key={team.id}>
              <Card>
                <CardActionArea onClick={() => handleSelectTeam(team)}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <GroupIcon color="primary" sx={{ fontSize: 40 }} />
                    <Box>
                      <Typography variant="h6">{team.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {team.member_count} {Number(team.member_count) === 1 ? 'member' : 'members'}
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
