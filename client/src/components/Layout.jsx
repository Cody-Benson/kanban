import { AppBar, Toolbar, Typography, Button, Container, Box, IconButton, Chip } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import GroupIcon from '@mui/icons-material/Group';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }) {
  const { logout, currentTeam, teamsLoading } = useAuth();
  const navigate = useNavigate();

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
            onClick={() => navigate('/teams')}
          >
            Kanban Board
          </Typography>
          {!teamsLoading && currentTeam && (
            <Chip
              icon={<GroupIcon />}
              label={currentTeam.name}
              sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', mr: 1 }}
              variant="outlined"
              size="small"
            />
          )}
          <Box sx={{ flexGrow: 1 }} />
          <IconButton color="inherit" onClick={() => navigate('/team-settings')} title="Team Settings">
            <SettingsIcon />
          </IconButton>
          <Button color="inherit" onClick={handleLogout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ mt: 3, flex: 1 }}>
        {children}
      </Container>
    </Box>
  );
}
