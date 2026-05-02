import { NavLink } from 'react-router-dom';

export default function Sidebar() {
  const link = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${isActive
      ? 'bg-white text-gray-900'
      : 'text-gray-400 hover:text-white hover:bg-white/10'
    }`;

  return (
    <aside className="fixed top-19 left-0 h-screen w-56 bg-gray-900 flex flex-col z-50">


      <nav className="flex-1 px-3 py-2 flex flex-col gap-0.5 overflow-y-auto">
        {/* Dashboard */}
        <p className="text-gray-600 text-xs uppercase tracking-widest px-4 mb-2 font-semibold">Main</p>
        <NavLink to="/dashboard" end className={link}>
          <span className="text-lg">📊</span> Dashboard
        </NavLink>
        <NavLink to="/analytics" className={link}>
          <span className="text-lg">📈</span> Analytics
        </NavLink>
        <div className="border-t border-white/10 my-3" />

        {/* Sales & Ledger */}
        <p className="text-gray-600 text-xs uppercase tracking-widest px-4 mb-2 font-semibold">Sales & Finance</p>
        <NavLink to="/ledger" className={link}>
          <span className="text-lg">📒</span> Customer Ledger
        </NavLink>
        <div className="border-t border-white/10 my-3" />

        {/* Production & Stock */}
        <p className="text-gray-600 text-xs uppercase tracking-widest px-4 mb-2 font-semibold">Operations</p>
        <NavLink to="/production" className={link}>
          <span className="text-lg">🏭</span> Production
        </NavLink>
        <NavLink to="/stock" className={link}>
          <span className="text-lg">📦</span> Stock
        </NavLink>
        <div className="border-t border-white/10 my-3" />

        {/* Finance Module */}
        <p className="text-gray-600 text-xs uppercase tracking-widest px-4 mb-2 font-semibold">Finance Module</p>
        <NavLink to="/expenses" className={link}>
          <span className="text-lg">💰</span> Expenses
        </NavLink>
        <NavLink to="/assets" className={link}>
          <span className="text-lg">🏢</span> Assets
        </NavLink>
        <div className="border-t border-white/10 my-3" />

        {/* HR Module */}
        <p className="text-gray-600 text-xs uppercase tracking-widest px-4 mb-2 font-semibold">HR Module</p>
        <NavLink to="/employees" className={link}>
          <span className="text-lg">👥</span> Employees
        </NavLink>
      </nav>

      <div className="px-5 py-4 border-t border-white/10 text-gray-600 text-xs">
        FMS v1.0 · FYP 2026
      </div>
    </aside>
  );
}