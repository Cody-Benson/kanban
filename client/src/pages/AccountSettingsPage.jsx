import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, TextField, Button, Box, Paper, Alert, Breadcrumbs, Link,
  List, ListItem, ListItemText, IconButton, CircularProgress,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAuth } from '../context/AuthContext';
import { changePassword } from '../api/auth';
import {
  getGoogleAccounts, disconnectGoogleAccount, getGoogleAuthUrl, syncAllTasks,
} from '../api/google';

export default function AccountSettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [googleAccounts, setGoogleAccounts] = useState([]);
  const [syncingId, setSyncingId] = useState(null);
  const [syncResult, setSyncResult] = useState({});

  const loadGoogleAccounts = () => {
    getGoogleAccounts()
      .then(setGoogleAccounts)
      .catch(() => {});
  };

  useEffect(() => {
    loadGoogleAccounts();
  }, []);

  const handleConnectGoogle = async () => {
    try {
      const { url } = await getGoogleAuthUrl();
      window.location.href = url;
    } catch {
      setError('Failed to start Google connection');
    }
  };

  const handleDisconnectGoogle = async (id) => {
    try {
      await disconnectGoogleAccount(id);
      loadGoogleAccounts();
    } catch {
      setError('Failed to disconnect Google account');
    }
  };

  const handleSyncAll = async (id) => {
    setSyncingId(id);
    setSyncResult((prev) => ({ ...prev, [id]: null }));
    try {
      const { synced, failed } = await syncAllTasks(id);
      let msg = `Synced ${synced} task${synced === 1 ? '' : 's'}.`;
      if (failed > 0) msg += ` ${failed} failed.`;
      if (synced === 0 && failed === 0) msg = 'All tasks were already synced.';
      setSyncResult((prev) => ({ ...prev, [id]: { ok: failed === 0, msg } }));
    } catch (err) {
      setSyncResult((prev) => ({
        ...prev,
        [id]: { ok: false, msg: err.response?.data?.error || 'Failed to sync tasks' },
      }));
    } finally {
      setSyncingId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    try {
      const data = await changePassword(currentPassword, newPassword);
      setSuccess(data.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
    }
  };

  return (
    <>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          Dashboard
        </Link>
        <Typography color="text.primary">Account Settings</Typography>
      </Breadcrumbs>

      <Typography variant="h4" sx={{ mb: 3 }}>Account Settings</Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Email</Typography>
        <Typography color="text.secondary">{user?.email}</Typography>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Connected Google Accounts</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          New tasks are added to Google Tasks for every connected account
          (these show up under "Tasks" in Google Calendar). Use "Sync all
          tasks" to backfill every existing task into a newly connected
          account.
        </Typography>
        {googleAccounts.length === 0 ? (
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            No Google accounts connected.
          </Typography>
        ) : (
          <List dense>
            {googleAccounts.map((a) => {
              const result = syncResult[a.id];
              return (
                <ListItem
                  key={a.id}
                  alignItems="flex-start"
                  secondaryAction={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={syncingId === a.id || a.hasTasksScope === false}
                        onClick={() => handleSyncAll(a.id)}
                        startIcon={
                          syncingId === a.id ? <CircularProgress size={14} /> : null
                        }
                      >
                        {syncingId === a.id ? 'Syncing…' : 'Sync all tasks'}
                      </Button>
                      <IconButton edge="end" aria-label="disconnect" onClick={() => handleDisconnectGoogle(a.id)}>
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={a.email}
                    secondary={
                      a.hasTasksScope === false
                        ? 'Missing Google Tasks permission — reconnect this account and check the Tasks box on the Google consent screen.'
                        : result
                        ? result.msg
                        : null
                    }
                    secondaryTypographyProps={{
                      color:
                        a.hasTasksScope === false || (result && !result.ok)
                          ? 'warning.main'
                          : 'success.main',
                    }}
                  />
                </ListItem>
              );
            })}
          </List>
        )}
        <Button variant="outlined" sx={{ mt: 1 }} onClick={handleConnectGoogle}>
          Connect another Google account
        </Button>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Change Password</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
        <form onSubmit={handleSubmit}>
          <TextField
            label="Current Password"
            type="password"
            fullWidth
            margin="normal"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <TextField
            label="New Password"
            type="password"
            fullWidth
            margin="normal"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <TextField
            label="Confirm New Password"
            type="password"
            fullWidth
            margin="normal"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <Button type="submit" variant="contained" sx={{ mt: 2 }}>
            Change Password
          </Button>
        </form>
      </Paper>
    </>
  );
}
