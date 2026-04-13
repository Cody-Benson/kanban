import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CssBaseline } from '@mui/material';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ClientDetailPage from './pages/ClientDetailPage';
import ProjectBoardPage from './pages/ProjectBoardPage';
import TeamSettingsPage from './pages/TeamSettingsPage';
import TeamsPage from './pages/TeamsPage';
import OrgsPage from './pages/OrgsPage';
import OrgSettingsPage from './pages/OrgSettingsPage';

export default function App() {
  return (
    <>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout><DashboardPage /></Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/clients/:clientId"
              element={
                <ProtectedRoute>
                  <Layout><ClientDetailPage /></Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId"
              element={
                <ProtectedRoute>
                  <Layout><ProjectBoardPage /></Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/orgs"
              element={
                <ProtectedRoute>
                  <Layout><OrgsPage /></Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/org-settings"
              element={
                <ProtectedRoute>
                  <Layout><OrgSettingsPage /></Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/teams"
              element={
                <ProtectedRoute>
                  <Layout><TeamsPage /></Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/team-settings"
              element={
                <ProtectedRoute>
                  <Layout><TeamSettingsPage /></Layout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </>
  );
}
