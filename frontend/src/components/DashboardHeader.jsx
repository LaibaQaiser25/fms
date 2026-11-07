import { Bell, AlertCircle, LogOut, User, Palette, Menu } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { PANEL_STYLE, ACCENT_GRADIENT_STYLE } from '../theme';
import SyncStatusIndicator from './SyncStatusIndicator';

export default function DashboardHeader({ allAlerts = [], showAlertsDropdown, setShowAlertsDropdown, onOpenMobileMenu, collapsed, onToggleCollapse }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
    navigate('/login');
  };

  return (
    <nav
      style={{
        background: 'var(--nav-bg)',
        borderBottom: 'var(--nav-border-width) solid var(--nav-border-color)',
        boxShadow: 'var(--nav-shadow)',
        backdropFilter: 'var(--nav-blur)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 40,
      }}
    >
      <div className="max-w-7xl mx-auto h-[76px] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">

        {/* Mobile menu button — opens the off-canvas sidebar drawer */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open menu"
          className="md:hidden shrink-0 p-2 -ml-1 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Desktop sidebar collapse/expand toggle — same static-hamburger
            treatment as the mobile drawer button above, just wired to the
            persistent rail's collapsed state instead of the off-canvas one. */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden md:block shrink-0 p-2 -ml-1 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Logo */}
        <Link to="/dashboard" className="flex items-center gap-2 sm:gap-3 group min-w-0">
          <div
            className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden shrink-0"
            style={{ border: 'var(--logo-border)', boxShadow: 'var(--logo-glow)' }}
          >
            <img src="../logo.jpeg" alt="Bin-Zahid Logo" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <div
              className="font-bold text-white leading-tight truncate text-base sm:text-lg"
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: '700',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                textShadow: 'var(--title-glow)',
              }}
            >
              Bin-Zahid & Partners
            </div>
            <div
              className="text-xs hidden sm:block"
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--color-text-accent)',
              }}
            >
              Precast Solutions
            </div>
          </div>
        </Link>

        {/* Spacer — pushes the controls below to the right edge */}
        <div className="flex-1" />

        <SyncStatusIndicator />

        {/* Theme toggle — only rendered post-login via Layout/ProtectedRoute, never on public pages */}
        <button
          onClick={toggleTheme}
          title={theme === 'construction' ? 'Switch to Classic theme' : 'Switch to Construction theme'}
          className="flex items-center gap-2 h-11 px-3.5 mr-3 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-white/[0.05]"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}
        >
          <Palette className="w-4 h-4" />
          <span className="hidden lg:inline">{theme === 'construction' ? 'Construction' : 'Classic'}</span>
        </button>

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
              <span className="hidden sm:inline text-sm font-medium max-w-[150px] truncate" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {user?.username || user?.email || 'User'}
              </span>
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div
                  className="absolute right-0 mt-3 w-56 max-w-[90vw] rounded-xl overflow-hidden z-50"
                  style={PANEL_STYLE}
                >
                  <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="text-sm font-semibold text-white">{user?.username || 'User'}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{user?.email}</p>
                    <p className="text-xs uppercase tracking-wider mt-2" style={{ color: 'var(--color-text-accent)' }}>
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
                  className="absolute right-0 top-full mt-3 w-80 max-w-[90vw] rounded-xl overflow-hidden z-50 max-h-96 overflow-y-auto"
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