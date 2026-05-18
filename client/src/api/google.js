import api from './axios';

export const getGoogleAuthUrl = () =>
  api.get('/google/auth').then((r) => r.data);

export const getGoogleStatus = () =>
  api.get('/google/status').then((r) => r.data);

export const getGoogleAccounts = () =>
  api.get('/google/accounts').then((r) => r.data);

export const disconnectGoogleAccount = (id) =>
  api.delete(`/google/accounts/${id}`).then((r) => r.data);

export const createGoogleTask = (taskId, googleAccountIds) =>
  api.post('/google/tasks', { taskId, googleAccountIds }).then((r) => r.data);

export const syncAllTasks = (accountId) =>
  api.post(`/google/accounts/${accountId}/sync-all`).then((r) => r.data);
