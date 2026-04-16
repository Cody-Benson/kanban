import { useState } from 'react';
import { useSearchParams, Link as RouterLink } from 'react-router-dom';
import { Box, TextField, Button, Typography, Paper, Alert, Link } from '@mui/material';
import { resetPassword } from '../api/auth';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const data = await resetPassword(token, password);
      setSuccess(data.message);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Paper sx={{ p: 4, maxWidth: 400, width: '100%' }}>
          <Alert severity="error" sx={{ mb: 2 }}>Invalid reset link. No token provided.</Alert>
          <Typography align="center">
            <Link component={RouterLink} to="/forgot-password">Request a new reset link</Link>
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Paper sx={{ p: 4, maxWidth: 400, width: '100%' }}>
        <Typography variant="h5" gutterBottom align="center">
          Reset Password
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && (
          <>
            <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>
            <Typography align="center">
              <Link component={RouterLink} to="/login">Go to Login</Link>
            </Typography>
          </>
        )}
        {!success && (
          <form onSubmit={handleSubmit}>
            <TextField
              label="New Password"
              type="password"
              fullWidth
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <TextField
              label="Confirm Password"
              type="password"
              fullWidth
              margin="normal"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }} disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </Button>
          </form>
        )}
      </Paper>
    </Box>
  );
}
