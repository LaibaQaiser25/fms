import Dashboard from './Dashboard';

// Manager sees the same dashboard as Owner — role restrictions for Manager
// are enforced at the route/sidebar level (Analytics, Cashbook, Reports),
// not on the dashboard itself.
export default function ManagerDashboard() {
  return <Dashboard />;
}
