import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Mail, Lock, AlertCircle, ShieldCheck, UserCog, Eye, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AUTH_BASE_URL } from '../config';
import { alpha, orangeText, ground, ink, serifNavy, btnNavy, btnOrange, serif, sans } from '../homeTheme';
import { Tag, Title, PillButton } from './Public/ui';
import { fieldClass, fieldStyle, labelClass, labelStyle } from './Public/styles';

const ROLES = [
  { value: 'owner', label: 'Owner', Icon: ShieldCheck },
  { value: 'manager', label: 'Manager', Icon: UserCog },
  { value: 'guest', label: 'Guest', Icon: Eye },
];

const Spinner = ({ size }) => <Loader2 size={size} className="animate-spin" />;

// The login card, in the public site's look. With `onClose` it is a modal over a
// dimmed page; without it (the standalone /login page) it sits on whatever the
// page puts behind it and has no close button.
export default function Login({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [selectedRole, setSelectedRole] = useState('owner');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!form.username.trim() || !form.password.trim()) {
      setError('Username and password are required');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${AUTH_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username,
          password: form.password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setError('Invalid username or password.');
        } else if (response.status === 400) {
          setError(data.error || 'Invalid input');
        } else if (response.status === 500) {
          setError('Server error. Is the database initialized?');
        } else {
          setError(data.error || 'Login failed');
        }
        setIsLoading(false);
        return;
      }

      // The account's real role always wins — the tab just picks which
      // dashboard the person meant to land on, so a mismatch blocks entry
      // instead of silently landing them somewhere else.
      const accountRole = data.user?.role?.toLowerCase();
      if (accountRole !== selectedRole) {
        setError(`This account is a ${data.user.role} account. Select "${data.user.role}" above to continue.`);
        setIsLoading(false);
        return;
      }

      // Store token and user info
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Update auth context
      login(data.token);

      setIsLoading(false);
      onClose?.();
      navigate('/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      setError('Network error. Is the backend running on port 5000?');
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const iconClass = 'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2';
  const iconStyle = { color: alpha(serifNavy, 0.45) };

  return (
    // As a modal it overlays the page (and scrolls inside itself if the window is short); on the standalone
    // page it sits in normal flow, so the page scrolls instead.
    <div className={onClose ? 'fixed inset-0 z-50 flex items-center justify-center p-4' : 'relative flex min-h-screen items-center justify-center px-4 py-5'}
      style={{ background: onClose ? alpha(ink, 0.55) : 'transparent' }}>
      <div className="relative w-full max-w-md">
        {/* thin offset outline behind the card, the drafting-style double edge used across the site */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 translate-x-3.5 translate-y-3.5 rounded-2xl"
          style={{ border: `1px solid ${alpha(serifNavy, 0.45)}` }} />

        <div className={`relative rounded-2xl bg-white ${onClose ? 'max-h-[90vh] overflow-y-auto' : ''}`}
          style={{ border: `1px solid ${alpha(serifNavy, 0.12)}` }}>
          {/* Header */}
          <div className="relative px-8 pt-6 pb-5" style={{ background: ground, borderBottom: `1px solid ${alpha(serifNavy, 0.12)}` }}>
            <Tag className="mb-3 text-[0.7rem]">Staff Login</Tag>
            <Title size="2.4rem">Welcome Back</Title>
            <p className="mt-2 text-[0.95rem] font-medium uppercase"
              style={{ fontFamily: serif, color: serifNavy, letterSpacing: '0.2em' }}>
              Bin-Zahid &amp; Partners
            </p>
            {/* No close button on the standalone /login page (no onClose) */}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full transition hover:bg-black/5"
                style={{ color: btnNavy }}
              >
                <X size={20} />
              </button>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5 px-8 py-6">
            {/* Role Selection */}
            <div>
              <span className={labelClass} style={labelStyle}>Login as</span>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map(({ value, label, Icon: icon }) => {
                  const Icon = icon;
                  const on = selectedRole === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={isLoading}
                      aria-pressed={on}
                      onClick={() => { setSelectedRole(value); setError(''); }}
                      className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        fontFamily: sans,
                        color: on ? btnNavy : alpha(serifNavy, 0.6),
                        background: on ? ground : '#fff',
                        border: on ? `1.5px solid ${btnNavy}` : `1.5px solid ${alpha(serifNavy, 0.14)}`,
                      }}
                    >
                      <Icon size={17} style={{ color: on ? btnOrange : undefined }} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl p-3 text-sm"
                style={{ fontFamily: sans, color: orangeText, background: '#FDF1EC', border: `1px solid ${alpha(orangeText, 0.25)}` }}>
                <AlertCircle size={18} className="mt-px shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Username Field */}
            <div>
              <label htmlFor="login-username" className={labelClass} style={labelStyle}>Username or Email</label>
              <div className="relative">
                <Mail className={iconClass} style={iconStyle} size={18} />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="Enter your username"
                  required
                  disabled={isLoading}
                  className={`${fieldClass} pl-11 disabled:opacity-60`}
                  style={fieldStyle}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="login-password" className={labelClass} style={labelStyle}>Password</label>
              <div className="relative">
                <Lock className={iconClass} style={iconStyle} size={18} />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Enter your password"
                  required
                  disabled={isLoading}
                  className={`${fieldClass} pl-11 disabled:opacity-60`}
                  style={fieldStyle}
                />
              </div>
            </div>

            {/* Submit Button */}
            <PillButton type="submit" disabled={isLoading} icon={isLoading ? Spinner : undefined} className="w-full disabled:cursor-not-allowed">
              {isLoading ? 'Logging in…' : 'Login to Dashboard'}
            </PillButton>
          </form>

          {/* Footer */}
          <div className="px-8 py-3.5 text-center" style={{ borderTop: `1px solid ${alpha(serifNavy, 0.12)}` }}>
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: sans, color: alpha(serifNavy, 0.55) }}>
              Secure login powered by JWT
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
