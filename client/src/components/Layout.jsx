import { AppBar, Toolbar, Typography, Button, Container, Box, IconButton } from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }) {
  const { logout } = useAuth();
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
            onClick={() => navigate('/')}
          >
            Kanban Board
          </Typography>
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
