import api from './axios';

export const getGoogleAuthUrl = () =>
  api.get('/google/auth').then((r) => r.data);

export const getGoogleStatus = () =>
  api.get('/google/status').then((r) => r.data);

export const createGoogleTask = (taskId) =>
  api.post('/google/tasks', { taskId }).then((r) => r.data);
