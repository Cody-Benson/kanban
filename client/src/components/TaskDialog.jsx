import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Box, Chip, CircularProgress, Autocomplete,
  FormControlLabel, Checkbox, Typography, FormGroup,
} from '@mui/material';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import { getGoogleAuthUrl, createGoogleTask } from '../api/google';
import { useToast } from '../context/ToastContext';
import { googleSyncWarning } from '../utils/googleSync';

// Stable default so an absent prop doesn't change identity each render
// (which would retrigger the account-selection effect infinitely).
const EMPTY_ACCOUNTS = [];

export default function TaskDialog({
  open, task, onClose, onSave, googleAccounts = EMPTY_ACCOUNTS, onTaskLinked,
  teamMembers = [], defaultAssignedTo = null,
}) {
  const { show: showToast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState(null);
  const [addingToGoogle, setAddingToGoogle] = useState(false);
  // Map of account id -> boolean (which accounts a new task fans out to)
  const [selectedAccounts, setSelectedAccounts] = useState({});

  const hasGoogle = googleAccounts.length > 0;
  const accountKey = googleAccounts.map((a) => a.id).join(',');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setDueDate(task.due_date ? task.due_date.slice(0, 10) : '');
      setAssignedTo(task.assigned_to || null);
    } else {
      setTitle('');
      setDescription('');
      setDueDate('');
      setAssignedTo(defaultAssignedTo);
    }
    // Default: select every account that can actually receive tasks. Accounts
    // missing the Tasks permission would just fail, so leave them unchecked.
    setSelectedAccounts(
      Object.fromEntries(
        googleAccounts.map((a) => [a.id, a.hasTasksScope !== false])
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, open, defaultAssignedTo, accountKey]);

  const selectedIds = Object.entries(selectedAccounts)
    .filter(([, v]) => v)
    .map(([k]) => Number(k));

  const handleSave = () => {
    if (!title.trim()) return;
    // add_to_google true only if at least one account is picked; pass the
    // explicit id list so the server fans out to exactly those accounts.
    const addToGoogle = hasGoogle && selectedIds.length > 0;
    onSave(
      title.trim(),
      description.trim(),
      dueDate || null,
      assignedTo,
      addToGoogle,
      addToGoogle ? selectedIds : null
    );
  };

  const connectGoogle = async () => {
    try {
      const { url } = await getGoogleAuthUrl();
      window.location.href = url;
    } catch (err) {
      console.error('Failed to get Google auth URL:', err);
    }
  };

  const handleAddExistingToGoogle = async () => {
    if (!hasGoogle) {
      connectGoogle();
      return;
    }
    setAddingToGoogle(true);
    try {
      const res = await createGoogleTask(task.id, selectedIds);
      if (onTaskLinked) onTaskLinked();
      const warn = googleSyncWarning(res, 'link');
      if (warn) showToast(warn, 'warning');
    } catch (err) {
      console.error('Failed to add to Google Tasks:', err);
      showToast('Failed to add to Google Tasks', 'error');
    } finally {
      setAddingToGoogle(false);
    }
  };

  const isExistingTask = !!task;

  const accountCheckboxes = (
    <FormGroup>
      {googleAccounts.map((a) => (
        <FormControlLabel
          key={a.id}
          control={
            <Checkbox
              checked={!!selectedAccounts[a.id]}
              onChange={(e) =>
                setSelectedAccounts((prev) => ({ ...prev, [a.id]: e.target.checked }))
              }
            />
          }
          label={
            a.hasTasksScope === false ? (
              <Typography variant="body2" color="warning.main">
                {a.email} — missing Tasks permission, reconnect in Account Settings
              </Typography>
            ) : (
              a.email
            )
          }
        />
      ))}
    </FormGroup>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{task ? 'Edit Task' : 'New Task'}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <TextField
          fullWidth
          margin="dense"
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          multiline
          rows={3}
        />
        <TextField
          fullWidth
          margin="dense"
          label="Due Date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        {teamMembers.length > 0 && (
          <Autocomplete
            options={teamMembers}
            getOptionLabel={(o) => o.email}
            value={teamMembers.find((m) => m.id === assignedTo) || null}
            onChange={(_, v) => setAssignedTo(v?.id || null)}
            renderInput={(params) => (
              <TextField {...params} label="Assign to" margin="dense" fullWidth />
            )}
          />
        )}

        {!isExistingTask && (
          <Box sx={{ mt: 1.5 }}>
            {hasGoogle ? (
              <>
                <Typography variant="subtitle2" color="text.secondary">
                  Add to Google Tasks
                </Typography>
                {accountCheckboxes}
              </>
            ) : (
              <Button size="small" startIcon={<TaskAltIcon />} onClick={connectGoogle}>
                Connect a Google account
              </Button>
            )}
          </Box>
        )}

        {isExistingTask && (
          <Box sx={{ mt: 1.5 }}>
            {hasGoogle ? (
              <>
                <Typography variant="subtitle2" color="text.secondary">
                  Add to Google Tasks
                </Typography>
                {accountCheckboxes}
                <Button
                  size="small"
                  sx={{ mt: 0.5 }}
                  startIcon={addingToGoogle ? <CircularProgress size={16} /> : <TaskAltIcon />}
                  onClick={handleAddExistingToGoogle}
                  disabled={addingToGoogle || selectedIds.length === 0}
                >
                  Sync to selected accounts
                </Button>
              </>
            ) : (
              <Chip
                icon={<TaskAltIcon />}
                label="Connect a Google account"
                onClick={connectGoogle}
                variant="outlined"
                size="small"
              />
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          {task ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
