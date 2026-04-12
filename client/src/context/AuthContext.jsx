import { createContext, useContext, useState, useEffect } from 'react';
import * as authApi from '../api/auth';
import * as teamsApi from '../api/teams';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [currentTeam, setCurrentTeam] = useState(null);
  const [teamsLoading, setTeamsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({ id: payload.userId });
        // Load teams for returning users (page refresh)
        teamsApi.getTeams().then((teamList) => {
          setTeams(teamList);
          const savedTeamId = localStorage.getItem('currentTeamId');
          const saved = teamList.find((t) => String(t.id) === savedTeamId);
          setCurrentTeam(saved || teamList[0] || null);
        }).catch(() => {
          // Token may be expired
        }).finally(() => setTeamsLoading(false));
      } catch {
        setToken(null);
        localStorage.removeItem('token');
        setTeamsLoading(false);
      }
    } else {
      setTeamsLoading(false);
    }
  }, [token]);

  const handleTeams = (teamList) => {
    setTeams(teamList);
    const first = teamList[0] || null;
    setCurrentTeam(first);
    if (first) localStorage.setItem('currentTeamId', String(first.id));
  };

  const login = async (email, password) => {
    const data = await authApi.login(email, password);
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    handleTeams(data.teams || []);
    setTeamsLoading(false);
  };

  const register = async (email, password) => {
    const data = await authApi.register(email, password);
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    handleTeams(data.teams || []);
    setTeamsLoading(false);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('currentTeamId');
    setToken(null);
    setUser(null);
    setTeams([]);
    setCurrentTeam(null);
  };

  const switchTeam = (teamId) => {
    const team = teams.find((t) => t.id === teamId);
    if (team) {
      setCurrentTeam(team);
      localStorage.setItem('currentTeamId', String(team.id));
    }
  };

  const refreshTeams = async () => {
    const teamList = await teamsApi.getTeams();
    setTeams(teamList);
    if (currentTeam && !teamList.find((t) => t.id === currentTeam.id)) {
      setCurrentTeam(teamList[0] || null);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, token, login, register, logout,
      teams, currentTeam, switchTeam, refreshTeams, teamsLoading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
