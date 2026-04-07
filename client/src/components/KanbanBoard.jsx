import { useState, useEffect, useCallback } from 'react';
import { Box, Button, Alert, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { DragDropContext } from '@hello-pangea/dnd';
import KanbanColumn from './KanbanColumn';
import TaskDialog from './TaskDialog';
import { getTasks, createTask, updateTask, deleteTask, reorderTask } from '../api/tasks';

const STATUSES = ['todo', 'in-progress', 'completed'];

export default function KanbanBoard({ projectId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [taskDialog, setTaskDialog] = useState({ open: false, task: null });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, task: null });

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

  // Group tasks by status
  const columns = {};
  for (const s of STATUSES) {
    columns[s] = tasks.filter((t) => t.status === s).sort((a, b) => a.position - b.position);
  }

  const handleDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const taskId = parseInt(draggableId);
    const newStatus = destination.droppableId;
    const newPosition = destination.index;

    // Optimistic update
    const prevTasks = [...tasks];
    const movedTask = tasks.find((t) => t.id === taskId);
    if (!movedTask) return;

    // Remove from source column
    const sourceCol = columns[source.droppableId].filter((t) => t.id !== taskId);
    // Insert into destination column
    const destCol = source.droppableId === destination.droppableId
      ? sourceCol
      : [...columns[destination.droppableId]];

    const updatedTask = { ...movedTask, status: newStatus };
    destCol.splice(newPosition, 0, updatedTask);

    // Rebuild tasks with new positions
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

  const handleCreateTask = async (title, description) => {
    try {
      await createTask(projectId, title, description);
      setTaskDialog({ open: false, task: null });
      load();
    } catch {
      setError('Failed to create task');
    }
  };

  const handleUpdateTask = async (title, description) => {
    try {
      await updateTask(taskDialog.task.id, title, description);
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

      <Box sx={{ mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setTaskDialog({ open: true, task: null })}
        >
          Add Task
        </Button>
      </Box>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2 }}>
          {STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={columns[status]}
              onEdit={(task) => setTaskDialog({ open: true, task })}
              onDelete={(task) => setDeleteDialog({ open: true, task })}
            />
          ))}
        </Box>
      </DragDropContext>

      <TaskDialog
        open={taskDialog.open}
        task={taskDialog.task}
        onClose={() => setTaskDialog({ open: false, task: null })}
        onSave={taskDialog.task ? handleUpdateTask : handleCreateTask}
      />

      {/* Delete Confirmation */}
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
