import api from './axios';

export const getTasks = (projectId) =>
  api.get(`/tasks/by-project/${projectId}`).then((r) => r.data);

export const createTask = (projectId, title, description, due_date) =>
  api.post(`/tasks/by-project/${projectId}`, { title, description, due_date: due_date || null }).then((r) => r.data);

export const updateTask = (id, title, description, due_date) =>
  api.put(`/tasks/${id}`, { title, description, due_date: due_date || null }).then((r) => r.data);

export const deleteTask = (id) => api.delete(`/tasks/${id}`).then((r) => r.data);

export const reorderTask = (taskId, newStatus, newPosition) =>
  api.put('/tasks/reorder', { taskId, newStatus, newPosition }).then((r) => r.data);
