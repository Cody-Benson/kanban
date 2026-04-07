import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Breadcrumbs, Link, CircularProgress } from '@mui/material';
import { getProject } from '../api/projects';
import KanbanBoard from '../components/KanbanBoard';

export default function ProjectBoardPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProject(projectId)
      .then(setProject)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 4 }} />;

  return (
    <>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link underline="hover" color="inherit" sx={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          Clients
        </Link>
        {project && (
          <Link
            underline="hover"
            color="inherit"
            sx={{ cursor: 'pointer' }}
            onClick={() => navigate(`/clients/${project.client_id}`)}
          >
            Client
          </Link>
        )}
        <Typography color="text.primary">{project?.name}</Typography>
      </Breadcrumbs>

      <Typography variant="h4" gutterBottom>{project?.name}</Typography>
      <KanbanBoard projectId={projectId} />
    </>
  );
}
