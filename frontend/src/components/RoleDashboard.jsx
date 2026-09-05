import { useAuth } from '../context/AuthContext';
import Dashboard from './Dashboard';
import ManagerDashboard from './ManagerDashboard';
import GuestDashboard from './GuestDashboard';

// /dashboard renders a different component per role — Owner keeps the full
// Dashboard, Manager gets ManagerDashboard, Guest gets the read-only GuestDashboard.
export default function RoleDashboard() {
  const { user } = useAuth();
  const role = user?.role?.toLowerCase();

  if (role === 'guest') return <GuestDashboard />;
  if (role === 'manager') return <ManagerDashboard />;
  return <Dashboard />;
}
