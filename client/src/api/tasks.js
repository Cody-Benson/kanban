import api from './axios';

export const getTasks = (projectId) =>
  api.get(`/tasks/by-project/${projectId}`).then((r) => r.data);

export const createTask = (projectId, title, description) =>
  api.post(`/tasks/by-project/${projectId}`, { title, description }).then((r) => r.data);

export const updateTask = (id, title, description) =>
  api.put(`/tasks/${id}`, { title, description }).then((r) => r.data);

export const deleteTask = (id) => api.delete(`/tasks/${id}`).then((r) => r.data);

export const reorderTask = (taskId, newStatus, newPosition) =>
  api.put('/tasks/reorder', { taskId, newStatus, newPosition }).then((r) => r.data);
