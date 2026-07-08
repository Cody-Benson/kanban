import { useState, useEffect } from 'react';
import {
  Typography, TextField, Button, Box, Paper, List, ListItem, ListItemText,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Alert,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { listTokens, createToken, revokeToken } from '../api/tokens';
import { useToast } from '../context/ToastContext';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : null);

export default function ApiTokensSection() {
  const { show: showToast } = useToast();
  const [tokens, setTokens] = useState([]);
  const [error, setError] = useState('');
  // Create flow: dialog collects a name, then switches to a copy-once view
  // holding the plaintext token (never retrievable again).
  const [createDialog, setCreateDialog] = useState({ open: false, name: '', created: null });
  const [creating, setCreating] = useState(false);
  const [revokeDialog, setRevokeDialog] = useState({ open: false, id: null, name: '' });

  const load = () => {
    listTokens()
      .then(setTokens)
      .catch(() => setError('Failed to load API tokens'));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!createDialog.name.trim()) return;
    setCreating(true);
    try {
      const created = await createToken(createDialog.name.trim());
      setCreateDialog((prev) => ({ ...prev, created }));
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create token');
      setCreateDialog({ open: false, name: '', created: null });
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(createDialog.created.token);
      showToast('Token copied to clipboard', 'success');
    } catch {
      showToast('Copy failed — select the token text and copy it manually', 'error');
    }
  };

  const handleRevoke = async () => {
    try {
      await revokeToken(revokeDialog.id);
      showToast(`Token "${revokeDialog.name}" revoked`, 'success');
      setRevokeDialog({ open: false, id: null, name: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to revoke token');
      setRevokeDialog({ open: false, id: null, name: '' });
    }
  };

  const closeCreateDialog = () => setCreateDialog({ open: false, name: '', created: null });

  const mcpUrl = `${window.location.origin}/mcp`;

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="subtitle1" gutterBottom>API Tokens (AI agents)</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Connect your own AI assistant (Claude, ChatGPT, Gemini) to manage tasks
        on your behalf. Generate a token, then add this app as an MCP server in
        your assistant's settings. Anything an agent changes is recorded in each
        task's activity history under the token's name.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {tokens.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 1 }}>No API tokens yet.</Typography>
      ) : (
        <List dense>
          {tokens.map((t) => (
            <ListItem
              key={t.id}
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label="revoke"
                  onClick={() => setRevokeDialog({ open: true, id: t.id, name: t.name })}
                >
                  <DeleteIcon />
                </IconButton>
              }
            >
              <ListItemText
                primary={t.name}
                secondary={`${t.token_prefix}… · created ${formatDate(t.created_at)} · last used ${formatDate(t.last_used_at) || 'never'}`}
              />
            </ListItem>
          ))}
        </List>
      )}

      <Button variant="outlined" sx={{ mt: 1 }} onClick={() => setCreateDialog({ open: true, name: '', created: null })}>
        Generate token
      </Button>

      {/* Create dialog: name entry, then copy-once view */}
      <Dialog open={createDialog.open} onClose={closeCreateDialog} maxWidth="sm" fullWidth>
        {!createDialog.created ? (
          <>
            <DialogTitle>Generate API Token</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Name the token after the agent that will use it, e.g. "Claude".
              </Typography>
              <TextField
                autoFocus
                fullWidth
                margin="dense"
                label="Token name"
                value={createDialog.name}
                onChange={(e) => setCreateDialog((prev) => ({ ...prev, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={closeCreateDialog}>Cancel</Button>
              <Button onClick={handleCreate} variant="contained" disabled={creating || !createDialog.name.trim()}>
                {creating ? 'Generating…' : 'Generate'}
              </Button>
            </DialogActions>
          </>
        ) : (
          <>
            <DialogTitle>Token created</DialogTitle>
            <DialogContent>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Copy this token now — you won't be able to see it again.
              </Alert>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  fullWidth
                  size="small"
                  value={createDialog.created.token}
                  slotProps={{ input: { readOnly: true, sx: { fontFamily: 'monospace', fontSize: 13 } } }}
                />
                <IconButton aria-label="copy token" onClick={handleCopy}>
                  <ContentCopyIcon />
                </IconButton>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                To connect Claude Code, run:
              </Typography>
              <Box
                component="pre"
                sx={{
                  p: 1.5, mt: 1, borderRadius: 1, bgcolor: 'action.hover',
                  fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}
              >
                {`claude mcp add --transport http kanban ${mcpUrl} --header "Authorization: Bearer ${createDialog.created.token}"`}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeCreateDialog} variant="contained">Done</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Revoke confirmation */}
      <Dialog open={revokeDialog.open} onClose={() => setRevokeDialog({ open: false, id: null, name: '' })}>
        <DialogTitle>Revoke Token</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to revoke "{revokeDialog.name}"? Any agent using it
            will immediately lose access. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevokeDialog({ open: false, id: null, name: '' })}>Cancel</Button>
          <Button onClick={handleRevoke} color="error" variant="contained">Revoke</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
