import { Bell, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardHeader({ allAlerts = [], showAlertsDropdown, setShowAlertsDropdown }) {
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
          <div 
            className="relative w-10 h-10 rounded-xl overflow-hidden shadow-[0_0_20px_rgba(88,28,212,0.5),0_0_40px_rgba(5,150,105,0.3)]"
          >
            <img src="../logo.png" alt="Bin-Zahid Logo" className="w-full h-full object-cover" />
          </div>
          
          <div>
            <div 
              className="font-bold text-white leading-tight uppercase tracking-[0.12em] text-shadow-[0_0_20px_rgba(139,92,246,0.4)]"
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: '1.4rem',
              }}
            >
              Bin-Zahid & Partners'
            </div>
            <div 
              className="text-xs uppercase tracking-[0.2em]"
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                color: 'rgba(52,211,153,0.7)',
              }}
            >
              Precast Solutions
            </div>
          </div>
        </Link>

        {/* Center: Search */}
        <div className="flex-1 mx-16 max-w-[600px]">
          <input
            type="text"
            placeholder="Search customers, invoices, products..."
            className="w-full px-4 py-2 rounded-lg focus:outline-none text-sm bg-white/5 border border-white/10 text-white/60"
            disabled
          />
        </div>

        {/* Right: Bell */}
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

          {/* Alerts Dropdown */}
          {showAlertsDropdown && (
            <>
              {/* Backdrop overlay */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowAlertsDropdown(false)}
              />
              {/* Alert Panel */}
              <div
                className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
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