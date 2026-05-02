import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Mail, Lock } from 'lucide-react';

export default function LoginModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [role, setRole] = useState('owner');

  const handleSubmit = (e) => {
  e.preventDefault();
  setIsLoading(true);
  setTimeout(() => {
    setIsLoading(false);
    onClose();
    localStorage.setItem('role', role);
    navigate(role === 'owner' ? '/dashboard' : '/dashboard/manager');
  }, 500);
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
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

{/* Role Selector */}
<div>
  <label className="block text-sm font-semibold text-gray-700 mb-2">
    Login As
  </label>
  <div className="flex gap-3">
    <button
      type="button"
      onClick={() => setRole('owner')}
      className={`flex-1 py-2.5 rounded-lg font-semibold border-2 transition ${
        role === 'owner'
          ? 'border-green-600 bg-green-50 text-green-700'
          : 'border-gray-200 text-gray-500 hover:border-gray-300'
      }`}
    >
      Owner
    </button>
    <button
      type="button"
      onClick={() => setRole('manager')}
      className={`flex-1 py-2.5 rounded-lg font-semibold border-2 transition ${
        role === 'manager'
          ? 'border-blue-600 bg-blue-50 text-blue-700'
          : 'border-gray-200 text-gray-500 hover:border-gray-300'
      }`}
    >
      Manager
    </button>
  </div>
</div>

          {/* Remember Me & Forgot Password */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              Remember me
            </label>
            <a href="#" className="text-sm text-green-600 hover:text-green-700 font-semibold">
              Forgot password?
            </a>
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
        </form>

        {/* Footer */}
        <div className="border-t border-gray-200 px-8 py-4 text-center text-sm text-gray-600">
          <p>
            Demo access: Use any credentials
            <br />
            <span className="text-xs text-gray-500">No authentication required</span>
          </p>
        </div>
      </div>
    </div>
  );
}
