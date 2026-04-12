import api from './axios';

export const getClients = (teamId) => api.get('/clients', { params: teamId ? { teamId } : {} }).then((r) => r.data);
export const getClient = (id) => api.get(`/clients/${id}`).then((r) => r.data);
export const createClient = (name, teamId) => api.post('/clients', { name, teamId }).then((r) => r.data);
export const updateClient = (id, name) => api.put(`/clients/${id}`, { name }).then((r) => r.data);
export const deleteClient = (id) => api.delete(`/clients/${id}`).then((r) => r.data);
