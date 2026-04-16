import api from './axios';

export const getOrgs = () => api.get('/orgs').then((r) => r.data);
export const createOrg = (name) => api.post('/orgs', { name }).then((r) => r.data);
export const getOrg = (orgId) => api.get(`/orgs/${orgId}`).then((r) => r.data);
export const getOrgMembers = (orgId) => api.get(`/orgs/${orgId}/members`).then((r) => r.data);
export const inviteOrgMember = (orgId, email) => api.post(`/orgs/${orgId}/invite`, { email }).then((r) => r.data);
export const getPendingOrgInvites = () => api.get('/orgs/invites/pending').then((r) => r.data);
export const acceptOrgInvite = (inviteId) => api.post(`/orgs/invites/${inviteId}/accept`).then((r) => r.data);
export const declineOrgInvite = (inviteId) => api.post(`/orgs/invites/${inviteId}/decline`).then((r) => r.data);
export const removeOrgMember = (orgId, userId) => api.delete(`/orgs/${orgId}/members/${userId}`).then((r) => r.data);
export const updateOrg = (orgId, name) => api.put(`/orgs/${orgId}`, { name }).then((r) => r.data);
export const deleteOrg = (orgId) => api.delete(`/orgs/${orgId}`).then((r) => r.data);
