import { AppBar, Toolbar, Typography, Button, Container, Box, IconButton, Chip } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import GroupIcon from '@mui/icons-material/Group';
import CorporateFareIcon from '@mui/icons-material/CorporateFare';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }) {
  const { logout, currentOrg, currentTeam, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isBoardPage = location.pathname.startsWith('/projects/');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography
            variant="h6"
            sx={{ cursor: 'pointer', mr: 2 }}
            onClick={() => navigate('/orgs')}
          >
            Kanban Board
          </Typography>
          {!loading && currentOrg && (
            <Chip
              icon={<CorporateFareIcon />}
              label={currentOrg.name}
              sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', mr: 1 }}
              variant="outlined"
              size="small"
              onClick={() => navigate('/org-settings')}
            />
          )}
          {!loading && currentTeam && (
            <Chip
              icon={<GroupIcon />}
              label={currentTeam.name}
              sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', mr: 1 }}
              variant="outlined"
              size="small"
              onClick={() => navigate('/team-settings')}
            />
          )}
          <Box sx={{ flexGrow: 1 }} />
          <IconButton color="inherit" onClick={() => navigate('/account-settings')} title="Account Settings">
            <AccountCircleIcon />
          </IconButton>
          <Button color="inherit" onClick={handleLogout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth={isBoardPage ? 'xl' : 'lg'} sx={{ mt: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </Container>
    </Box>
  );
}
