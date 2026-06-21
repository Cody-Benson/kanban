import api from './axios';

export const getProjects = () =>
  api.get('/projects').then((r) => r.data);

export const getProject = (id) =>
  api.get(`/projects/${id}`).then((r) => r.data);

export const getProjectMembers = (id) =>
  api.get(`/projects/${id}/members`).then((r) => r.data);

export const createProject = (name, client) =>
  api.post('/projects', { name, client }).then((r) => r.data);

export const updateProject = (id, updates) =>
  api.put(`/projects/${id}`, updates).then((r) => r.data);

export const deleteProject = (id) =>
  api.delete(`/projects/${id}`).then((r) => r.data);
