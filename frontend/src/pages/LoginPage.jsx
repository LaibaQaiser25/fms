import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Login from '../components/Login';

// Standalone /login route for the dashboard domain — the public site no longer
// has a Login button, so this is the only way in. Reuses the Login card, just
// always open and without its close button.
export default function LoginPage() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen" style={{ background: '#1a1a1a' }}>
      <Login isOpen />
    </div>
  );
}
