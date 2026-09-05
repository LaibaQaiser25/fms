import Dashboard from './Dashboard';

// Guest sees the same dashboard layout as Manager/Owner, but every action
// button (New Sale, New Purchase, New Production, Add Payment) is disabled —
// Guest is view-only and has no other route to reach.
export default function GuestDashboard() {
  return <Dashboard readOnly />;
}
