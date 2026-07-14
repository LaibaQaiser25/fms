import { Bell, AlertCircle, Search, LogOut, User } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function DashboardHeader({ allAlerts = [], showAlertsDropdown, setShowAlertsDropdown, setSearchResults, setSearchSQL }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('http://localhost:5000/api/nlp/nlp-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      if (!res.ok) {
        console.error('Server error:', res.status);
        return;
      }

      const data = await res.json();
      setSearchResults(data.data || []);
      setSearchSQL(data.sql || '');
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #0f0f1a 50%, #0a1a0f 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 2px 20px rgba(0,0,0,0.6)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 40,
      }}
    >
      <div className="px-4 py-4 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group pl-10">
          <div className="relative w-10 h-10 rounded-xl overflow-hidden shadow-[0_0_20px_rgba(88,28,212,0.5),0_0_40px_rgba(5,150,105,0.3)]">
            <img src="../logo.png" alt="Bin-Zahid Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <div
              className="font-bold text-white leading-tight uppercase tracking-[0.12em]"
              style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.4rem' }}
            >
              Bin-Zahid & Partners'
            </div>
            <div
              className="text-xs uppercase tracking-[0.2em]"
              style={{ fontFamily: "'Cormorant Garamond', serif", color: 'rgba(52,211,153,0.7)' }}
            >
              Precast Solutions
            </div>
          </div>
        </Link>

        {/* Search */}
        <div className="flex-1 mx-16 max-w-[600px] relative">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder='Try: "gross profit for cement" or "unpaid invoices this month"'
            className="w-full px-4 py-2 pr-10 rounded-lg focus:outline-none text-sm bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-white/30 transition"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 p-2 rounded-lg transition bg-white/5 border border-white/10 hover:bg-white/10"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-green-500 flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm text-white/70 max-w-[150px] truncate">{user?.username || user?.email || 'User'}</span>
          </button>

          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
                <div className="p-4 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-800">{user?.username || 'User'}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                  <p className="text-xs text-gray-500 uppercase mt-1">Role: {user?.role || 'manager'}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setShowAlertsDropdown(!showAlertsDropdown)}
            className="relative p-2 rounded-lg transition bg-white/5 border border-white/10 hover:bg-white/10"
          >
            <Bell className="w-5 h-5 text-white/70" />
            {allAlerts.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(239,68,68,0.7)]">
                {allAlerts.length}
              </span>
            )}
          </button>

          {showAlertsDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowAlertsDropdown(false)} />
              <div
                className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-800">Alerts</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {allAlerts.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">No alerts at the moment</div>
                  ) : (
                    allAlerts.map((alert, idx) => (
                      <div key={idx} className="p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                        <div className="flex items-start gap-3">
                          <AlertCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${alert.severity === 'alert' ? 'text-red-500' : 'text-amber-500'}`} />
                          <p className="text-sm text-gray-600 leading-relaxed">{alert.message}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}