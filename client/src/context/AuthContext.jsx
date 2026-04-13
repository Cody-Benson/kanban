import { createContext, useContext, useState, useEffect } from 'react';
import * as authApi from '../api/auth';
import * as teamsApi from '../api/teams';
import * as orgsApi from '../api/orgs';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [teams, setTeams] = useState([]);
  const [currentTeam, setCurrentTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({ id: payload.userId });
        // Load orgs and teams for returning users (page refresh)
        orgsApi.getOrgs().then((orgList) => {
          setOrgs(orgList);
          const savedOrgId = localStorage.getItem('currentOrgId');
          const savedOrg = orgList.find((o) => String(o.id) === savedOrgId);
          const org = savedOrg || orgList[0] || null;
          setCurrentOrg(org);

          if (org) {
            return teamsApi.getTeams(org.id).then((teamList) => {
              setTeams(teamList);
              const savedTeamId = localStorage.getItem('currentTeamId');
              const savedTeam = teamList.find((t) => String(t.id) === savedTeamId);
              setCurrentTeam(savedTeam || teamList[0] || null);
            });
          }
        }).catch(() => {
          // Token may be expired
        }).finally(() => setLoading(false));
      } catch {
        setToken(null);
        localStorage.removeItem('token');
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, [token]);

  const handleOrgsAndTeams = (orgList, teamList) => {
    setOrgs(orgList);
    const firstOrg = orgList[0] || null;
    setCurrentOrg(firstOrg);
    if (firstOrg) localStorage.setItem('currentOrgId', String(firstOrg.id));

    // Filter teams to first org
    const orgTeams = firstOrg ? teamList.filter((t) => t.org_id === firstOrg.id) : teamList;
    setTeams(orgTeams);
    const firstTeam = orgTeams[0] || null;
    setCurrentTeam(firstTeam);
    if (firstTeam) localStorage.setItem('currentTeamId', String(firstTeam.id));
  };

  const login = async (email, password) => {
    const data = await authApi.login(email, password);
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    handleOrgsAndTeams(data.orgs || [], data.teams || []);
    setLoading(false);
  };

  const register = async (email, password) => {
    const data = await authApi.register(email, password);
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    handleOrgsAndTeams(data.orgs || [], data.teams || []);
    setLoading(false);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('currentOrgId');
    localStorage.removeItem('currentTeamId');
    setToken(null);
    setUser(null);
    setOrgs([]);
    setCurrentOrg(null);
    setTeams([]);
    setCurrentTeam(null);
  };

  const switchOrg = async (orgId) => {
    const org = orgs.find((o) => o.id === orgId);
    if (org) {
      setCurrentOrg(org);
      localStorage.setItem('currentOrgId', String(org.id));
      // Load teams for the new org
      const teamList = await teamsApi.getTeams(org.id);
      setTeams(teamList);
      setCurrentTeam(null);
      localStorage.removeItem('currentTeamId');
    }
  };

  const switchTeam = (teamId) => {
    const team = teams.find((t) => t.id === teamId);
    if (team) {
      setCurrentTeam(team);
      localStorage.setItem('currentTeamId', String(team.id));
    }
  };

  const refreshOrgs = async () => {
    const orgList = await orgsApi.getOrgs();
    setOrgs(orgList);
    if (currentOrg && !orgList.find((o) => o.id === currentOrg.id)) {
      setCurrentOrg(orgList[0] || null);
    }
  };

  const refreshTeams = async () => {
    if (!currentOrg) return;
    const teamList = await teamsApi.getTeams(currentOrg.id);
    setTeams(teamList);
    if (currentTeam && !teamList.find((t) => t.id === currentTeam.id)) {
      setCurrentTeam(teamList[0] || null);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, token, login, register, logout,
      orgs, currentOrg, switchOrg, refreshOrgs,
      teams, currentTeam, switchTeam, refreshTeams,
      loading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
