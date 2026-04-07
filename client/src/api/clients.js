import api from './axios';

export const getClients = () => api.get('/clients').then((r) => r.data);
export const getClient = (id) => api.get(`/clients/${id}`).then((r) => r.data);
export const createClient = (name) => api.post('/clients', { name }).then((r) => r.data);
export const updateClient = (id, name) => api.put(`/clients/${id}`, { name }).then((r) => r.data);
export const deleteClient = (id) => api.delete(`/clients/${id}`).then((r) => r.data);
