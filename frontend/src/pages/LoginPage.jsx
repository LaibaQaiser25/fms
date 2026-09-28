import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Login from '../components/Login';
import { alpha, steel, ground } from '../homeTheme';

// Standalone /login route for the dashboard domain — the public site no longer
// has a Login button, so this is the only way in. Reuses the Login card, just
// always open and without its close button.
export default function LoginPage() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="relative min-h-screen" style={{ background: ground }}>
      {/* the public site's faint blueprint verticals */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: `repeating-linear-gradient(90deg, ${alpha(steel, 0.28)} 0 1px, transparent 1px 120px)` }}
      />
      <Login isOpen />
    </div>
  );
}
