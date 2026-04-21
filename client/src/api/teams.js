import api from './axios';

export const getTeams = (orgId) => api.get('/teams', { params: orgId ? { orgId } : {} }).then((r) => r.data);
export const createTeam = (name, orgId) => api.post('/teams', { name, orgId }).then((r) => r.data);
export const getTeam = (teamId) => api.get(`/teams/${teamId}`).then((r) => r.data);
export const getTeamMembers = (teamId) => api.get(`/teams/${teamId}/members`).then((r) => r.data);
export const inviteMember = (teamId, email) => api.post(`/teams/${teamId}/invite`, { email }).then((r) => r.data);
export const getPendingInvites = () => api.get('/teams/invites/pending').then((r) => r.data);
export const acceptInvite = (inviteId) => api.post(`/teams/invites/${inviteId}/accept`).then((r) => r.data);
export const declineInvite = (inviteId) => api.post(`/teams/invites/${inviteId}/decline`).then((r) => r.data);
export const removeMember = (teamId, userId) => api.delete(`/teams/${teamId}/members/${userId}`).then((r) => r.data);
export const deleteTeam = (teamId) => api.delete(`/teams/${teamId}`).then((r) => r.data);
