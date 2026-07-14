import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ allowedRoles }) => {
  const { user, loading } = useAuth();

  // While checking if user is logged in, show nothing
  if (loading) return null;

  // If not logged in, redirect to home
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // If roles are specified and user role doesn't match, deny access
  const userRole = user?.role?.toLowerCase();
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  // User is authenticated, render the protected route
  return <Outlet />;
};

export default ProtectedRoute;