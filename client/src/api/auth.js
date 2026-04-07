import api from './axios';

export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then((r) => r.data);

export const register = (email, password) =>
  api.post('/auth/register', { email, password }).then((r) => r.data);
