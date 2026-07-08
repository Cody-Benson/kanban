import api from './axios';

export const listTokens = () => api.get('/tokens').then((r) => r.data);

export const createToken = (name) => api.post('/tokens', { name }).then((r) => r.data);

export const revokeToken = (id) => api.delete(`/tokens/${id}`).then((r) => r.data);
