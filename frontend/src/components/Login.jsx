import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Mail, Lock, AlertCircle, ShieldCheck, UserCog, Eye } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ROLES = [
  { value: 'owner', label: 'Owner', Icon: ShieldCheck },
  { value: 'manager', label: 'Manager', Icon: UserCog },
  { value: 'guest', label: 'Guest', Icon: Eye },
];

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
      console.log('Attempting login with username:', form.username);
      const response = await fetch('http://localhost:5000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username,
          password: form.password
        })
      });

      const data = await response.json();
      console.log('Auth response:', response.status, data);

      if (!response.ok) {
        if (response.status === 401) {
          setError('Invalid username or password. Try: admin / password123');
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
      
      console.log('✅ Login successful:', data.user);
      setIsLoading(false);
      onClose();
      navigate('/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      setError('Network error. Is the backend running on port 5000?');
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-green-900 text-white px-8 py-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Welcome Back</h2>
            <p className="text-blue-100 text-sm">Bin-Zahid & Partners</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded-lg transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-8 space-y-6">
          {/* Role Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Login as
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  disabled={isLoading}
                  onClick={() => { setSelectedRole(value); setError(''); }}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border-2 transition font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                    selectedRole === value
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <Icon size={20} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Username Field */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Username or Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 text-gray-400" size={20} />
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="Enter your username"
                required
                disabled={isLoading}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 text-gray-400" size={20} />
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Enter your password"
                required
                disabled={isLoading}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-blue-600 to-green-600 text-white py-3 rounded-lg font-bold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Logging in...
              </>
            ) : (
              'Login to Dashboard'
            )}
          </button>

          {/* Test Credentials */}
          <div className="text-center text-xs text-gray-500 pt-2">
            <p>Demo credentials:</p>
            <p>Username: <span className="font-mono">admin</span> | Password: <span className="font-mono">password123</span></p>
          </div>
        </form>

        {/* Footer */}
        <div className="border-t border-gray-200 px-8 py-4 text-center text-sm text-gray-600">
          <p className="text-xs text-gray-500">Secure login powered by JWT</p>
        </div>
      </div>
    </div>
  );
}
