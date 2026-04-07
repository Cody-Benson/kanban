import api from './axios';

export const getProjects = (clientId) =>
  api.get(`/projects/by-client/${clientId}`).then((r) => r.data);

export const getProject = (id) => api.get(`/projects/${id}`).then((r) => r.data);

export const createProject = (clientId, name) =>
  api.post(`/projects/by-client/${clientId}`, { name }).then((r) => r.data);

export const updateProject = (id, name) =>
  api.put(`/projects/${id}`, { name }).then((r) => r.data);

export const deleteProject = (id) => api.delete(`/projects/${id}`).then((r) => r.data);
