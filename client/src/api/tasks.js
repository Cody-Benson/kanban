import api from './axios';

export const getTasks = (projectId) =>
  api.get(`/tasks/by-project/${projectId}`).then((r) => r.data);

function todayLocalISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const createTask = (projectId, title, description, due_date, assigned_to, add_to_google = true) =>
  api.post(`/tasks/by-project/${projectId}`, {
    title,
    description,
    due_date: due_date || null,
    assigned_to: assigned_to || null,
    add_to_google,
    google_due_date: due_date || todayLocalISODate(),
  }).then((r) => r.data);

export const updateTask = (id, title, description, due_date, assigned_to) =>
  api.put(`/tasks/${id}`, { title, description, due_date: due_date || null, assigned_to: assigned_to || null }).then((r) => r.data);

export const deleteTask = (id) => api.delete(`/tasks/${id}`).then((r) => r.data);

export const reorderTask = (taskId, newStatus, newPosition) =>
  api.put('/tasks/reorder', { taskId, newStatus, newPosition }).then((r) => r.data);

export const getMyTasks = ({ scope = 'mine', includeCompleted = false } = {}) =>
  api.get('/tasks/mine', { params: { scope, includeCompleted } }).then((r) => r.data);
