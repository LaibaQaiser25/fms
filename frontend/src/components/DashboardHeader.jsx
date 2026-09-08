import { Bell, AlertCircle, Search, LogOut, User } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { PANEL_STYLE, ACCENT_GRADIENT_STYLE } from '../theme';
import { API_BASE_URL } from '../config';

export default function DashboardHeader({ allAlerts = [], showAlertsDropdown, setShowAlertsDropdown, setSearchResults, setSearchSQL }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const alertsRef = useRef(null);

  useEffect(() => {
    if (!showAlertsDropdown) return;
    const handleClickOutside = (e) => {
      if (alertsRef.current && !alertsRef.current.contains(e.target)) {
        setShowAlertsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAlertsDropdown, setShowAlertsDropdown]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/nlp/nlp-search`, {
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
    <nav
      style={{
        background: '#1a1a1a',
        borderBottom: '3px solid #b91c1c',
        boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 40,
      }}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div
            className="relative w-10 h-10 rounded-xl overflow-hidden"
            style={{ border: '2px solid #b91c1c' }}
          >
            <img src="../logo.png" alt="Bin-Zahid Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <div
              className="font-bold text-white text-lg leading-tight"
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: '1.4rem',
                fontWeight: '700',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              Bin-Zahid & Partners'
            </div>
            <div
              className="text-xs"
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#ef4444',
              }}
            >
              Precast Solutions
            </div>
          </div>
        </Link>

        {/* Search */}
        <div className="flex-1 mx-10 max-w-[560px] relative">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder='Try: "gross profit for cement" or "unpaid invoices this month"'
            className="w-full px-4 py-2.5 pr-10 rounded-lg focus:outline-none text-sm font-medium text-white placeholder-white/30 transition-all duration-200"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
            onFocus={e => { e.target.style.border = '1px solid rgba(239,68,68,0.5)'; }}
            onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.07)'; }}
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 transition-all duration-200"
            style={{ color: 'rgba(255,255,255,0.6)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* Profile + Alerts — one unified control, no gap between them */}
        <div
          className="flex items-stretch rounded-lg h-11"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="h-full flex items-center gap-2.5 pl-1.5 pr-3 rounded-l-lg transition-all duration-200 hover:bg-white/[0.05]"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={ACCENT_GRADIENT_STYLE}
              >
                <User className="w-5 h-5 text-white" />
              </div>
              <span className="text-sm font-medium max-w-[150px] truncate" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {user?.username || user?.email || 'User'}
              </span>
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div
                  className="absolute right-0 mt-3 w-56 rounded-xl overflow-hidden z-50"
                  style={PANEL_STYLE}
                >
                  <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="text-sm font-semibold text-white">{user?.username || 'User'}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{user?.email}</p>
                    <p className="text-xs uppercase tracking-wider mt-2" style={{ color: '#ef4444' }}>
                      Role: {user?.role || 'manager'}
                    </p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all duration-200"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="w-px my-2" style={{ background: 'rgba(255,255,255,0.07)' }} />

          {/* Alerts */}
          <div className="relative flex" ref={alertsRef}>
            <button
              onClick={() => setShowAlertsDropdown(!showAlertsDropdown)}
              className="relative px-3 rounded-r-lg transition-all duration-200 hover:bg-white/[0.05]"
            >
              <Bell className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.6)' }} />
              {allAlerts.length > 0 && (
                <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(239,68,68,0.7)]">
                  {allAlerts.length}
                </span>
              )}
            </button>

            {showAlertsDropdown && (
                <div
                  className="absolute right-0 top-full mt-3 w-80 rounded-xl overflow-hidden z-50 max-h-96 overflow-y-auto"
                  style={PANEL_STYLE}
                >
                  <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <h3 className="font-semibold text-white">Alerts</h3>
                  </div>
                  <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    {allAlerts.length === 0 ? (
                      <div className="p-8 text-center text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        No alerts at the moment
                      </div>
                    ) : (
                      allAlerts.map((alert, idx) => (
                        <button
                          key={idx}
                          onClick={() => { setShowAlertsDropdown(false); if (alert.link) navigate(alert.link); }}
                          className="w-full text-left p-4 hover:bg-white/[0.04] transition-colors cursor-pointer"
                        >
                          <div className="flex items-start gap-3">
                            <AlertCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${alert.severity === 'alert' ? 'text-red-400' : 'text-amber-400'}`} />
                            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{alert.message}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}