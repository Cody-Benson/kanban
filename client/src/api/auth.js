import api from './axios';

export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then((r) => r.data);

export const register = (email, password) =>
  api.post('/auth/register', { email, password }).then((r) => r.data);

export const forgotPassword = (email) =>
  api.post('/auth/forgot-password', { email }).then((r) => r.data);

export const resetPassword = (token, password) =>
  api.post('/auth/reset-password', { token, password }).then((r) => r.data);

export const changePassword = (currentPassword, newPassword) =>
  api.put('/auth/change-password', { currentPassword, newPassword }).then((r) => r.data);
