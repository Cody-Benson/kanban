import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { DragDropContext } from '@hello-pangea/dnd';
import KanbanColumn from './KanbanColumn';
import TaskDialog from './TaskDialog';
import { getTasks, createTask, updateTask, deleteTask, reorderTask } from '../api/tasks';
import { getGoogleStatus } from '../api/google';
import { getTeamMembers } from '../api/teams';
import { useAuth } from '../context/AuthContext';

const STATUSES = ['todo', 'in-progress', 'blocked', 'completed'];

export default function KanbanBoard({ projectId, projectName }) {
  const { currentTeam } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [taskDialog, setTaskDialog] = useState({ open: false, task: null });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, task: null });
  const [googleConnected, setGoogleConnected] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [completedCollapsed, setCompletedCollapsed] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getTasks(projectId);
      setTasks(data);
    } catch {
      setError('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getGoogleStatus()
      .then((data) => setGoogleConnected(data.connected))
      .catch(() => {});
    if (currentTeam?.id) {
      getTeamMembers(currentTeam.id)
        .then(setTeamMembers)
        .catch(() => {});
    }
  }, [currentTeam?.id]);

  // Filter + group tasks by status
  const columns = useMemo(() => {
    const filtered = tasks.filter((t) => {
      if (assigneeFilter === 'all') return true;
      if (assigneeFilter === 'unassigned') return !t.assigned_to;
      return String(t.assigned_to) === String(assigneeFilter);
    });
    const cols = {};
    for (const s of STATUSES) {
      cols[s] = filtered.filter((t) => t.status === s).sort((a, b) => a.position - b.position);
    }
    return cols;
  }, [tasks, assigneeFilter]);

  const handleDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const taskId = parseInt(draggableId);
    const newStatus = destination.droppableId;
    const newPosition = destination.index;

    const prevTasks = [...tasks];
    const movedTask = tasks.find((t) => t.id === taskId);
    if (!movedTask) return;

    const sourceCol = columns[source.droppableId].filter((t) => t.id !== taskId);
    const destCol = source.droppableId === destination.droppableId
      ? sourceCol
      : [...columns[destination.droppableId]];

    const updatedTask = { ...movedTask, status: newStatus };
    destCol.splice(newPosition, 0, updatedTask);

    const newTasks = [];
    for (const s of STATUSES) {
      const col = s === newStatus ? destCol
        : s === source.droppableId && source.droppableId !== destination.droppableId ? sourceCol
        : columns[s];
      col.forEach((t, i) => newTasks.push({ ...t, status: s, position: i }));
    }
    setTasks(newTasks);

    try {
      const serverTasks = await reorderTask(taskId, newStatus, newPosition);
      setTasks(serverTasks);
    } catch {
      setTasks(prevTasks);
      setError('Failed to reorder task');
    }
  };

  const handleCreateTask = async (title, description, dueDate, assignedTo) => {
    try {
      await createTask(projectId, title, description, dueDate, assignedTo);
      setTaskDialog({ open: false, task: null });
      load();
    } catch {
      setError('Failed to create task');
    }
  };

  const handleUpdateTask = async (title, description, dueDate, assignedTo) => {
    try {
      await updateTask(taskDialog.task.id, title, description, dueDate, assignedTo);
      setTaskDialog({ open: false, task: null });
      load();
    } catch {
      setError('Failed to update task');
    }
  };

  const handleDeleteTask = async () => {
    try {
      await deleteTask(deleteDialog.task.id);
      setDeleteDialog({ open: false, task: null });
      load();
    } catch {
      setError('Failed to delete task');
    }
  };

  if (loading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 4 }} />;

  return (
    <>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        {projectName && (
          <Typography variant="h5" sx={{ fontWeight: 600, mr: 'auto' }}>
            {projectName}
          </Typography>
        )}
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Assignee</InputLabel>
          <Select
            value={assigneeFilter}
            label="Assignee"
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <MenuItem value="all">All assignees</MenuItem>
            <MenuItem value="unassigned">Unassigned</MenuItem>
            {teamMembers.map((m) => (
              <MenuItem key={m.id} value={m.id}>{m.email}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setTaskDialog({ open: true, task: null })}
        >
          Add Task
        </Button>
      </Box>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0, pb: 2, alignItems: 'stretch' }}>
          {STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={columns[status]}
              onEdit={(task) => setTaskDialog({ open: true, task })}
              onDelete={(task) => setDeleteDialog({ open: true, task })}
              collapsible={status === 'completed'}
              collapsed={status === 'completed' && completedCollapsed}
              onToggleCollapse={status === 'completed' ? () => setCompletedCollapsed((v) => !v) : undefined}
            />
          ))}
        </Box>
      </DragDropContext>

      <TaskDialog
        open={taskDialog.open}
        task={taskDialog.task}
        onClose={() => setTaskDialog({ open: false, task: null })}
        onSave={taskDialog.task ? handleUpdateTask : handleCreateTask}
        googleConnected={googleConnected}
        onTaskLinked={load}
        teamMembers={teamMembers}
      />

      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, task: null })}>
        <DialogTitle>Delete Task</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{deleteDialog.task?.title}"?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, task: null })}>Cancel</Button>
          <Button onClick={handleDeleteTask} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
