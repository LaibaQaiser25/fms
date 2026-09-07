import Dashboard from './Dashboard';

// Guest sees the exact same dashboard as Manager/Owner — no visual
// difference. Action buttons are made non-functional for Guest by Layout's
// click-blocker (see components/Layout.jsx), not by disabling/dimming them
// here, so nothing here needs to look different.
export default function GuestDashboard() {
  return <Dashboard />;
}
