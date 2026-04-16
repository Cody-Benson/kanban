import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, TextField, Button, Box, Paper, Alert, Breadcrumbs, Link } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { changePassword } from '../api/auth';

export default function AccountSettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
