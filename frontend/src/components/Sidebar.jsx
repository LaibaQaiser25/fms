import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  BookText,
  Boxes,
  Wallet,
  FileBarChart2,
  LineChart,
  Receipt,
  Users,
  ChevronDown,
  ChevronLeft,
} from 'lucide-react';

const LEDGER_PATHS = ['/ledger', '/purchase-ledger'];
const INVENTORY_PATHS = ['/products', '/stock', '/raw-materials', '/production', '/assets'];

export default function Sidebar({ collapsed = false, onToggleCollapse }) {
  const location = useLocation();
  const { user } = useAuth();
  const isOwner = user?.role?.toLowerCase() === 'owner';

  const ledgerActive = LEDGER_PATHS.includes(location.pathname);
  const inventoryActive = INVENTORY_PATHS.includes(location.pathname);

  const [ledgerOpen, setLedgerOpen] = useState(ledgerActive);
  const [inventoryOpen, setInventoryOpen] = useState(inventoryActive);

  // Matches the header's Login-button / avatar treatment so both surfaces read as one system
  const ACTIVE_STYLE = {
    background: 'linear-gradient(135deg, #581cd4, #059669)',
    color: '#fff',
    boxShadow: '0 0 20px rgba(88,28,212,0.45), 0 0 40px rgba(5,150,105,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
  };

  const PANEL_STYLE = {
    background: 'linear-gradient(135deg, #000000 0%, #05001a 40%, #000d08 100%)',
    border: '1px solid rgba(255,255,255,0.07)',
    boxShadow: '0 8px 40px rgba(0,0,0,0.85), 0 1px 0 rgba(139,92,246,0.3)',
    backdropFilter: 'blur(12px)',
  };

  const navStyle = ({ isActive }) => (isActive ? ACTIVE_STYLE : undefined);

  const link = ({ isActive }) =>
    `flex items-center rounded-2xl text-[14.5px] font-medium transition-all duration-200 ease-out ${collapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
    } ${isActive
      ? 'font-bold'
      : 'text-white/60 hover:text-[#6ee7b7] hover:bg-white/[0.05]'
    }`;

  const subLink = ({ isActive }) =>
    `flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[13.5px] font-medium whitespace-nowrap transition-all duration-150 ease-out ${isActive
      ? 'font-bold'
      : 'text-white/55 hover:text-[#6ee7b7] hover:bg-white/[0.06]'
    }`;

  const groupToggle = (isActiveGroup) =>
    `w-full flex items-center rounded-2xl text-[14.5px] font-medium transition-all duration-200 ease-out ${collapsed ? 'justify-center p-3' : 'justify-between gap-3 px-4 py-3'
    } ${isActiveGroup
      ? 'text-[#6ee7b7] bg-white/[0.06]'
      : 'text-white/60 hover:text-[#6ee7b7] hover:bg-white/[0.05]'
    }`;

  // Expanded: drops below the button at full width. Collapsed: flies out beside the rail.
  const popoverPosition = collapsed
    ? 'absolute left-full top-0 pl-2 w-max min-w-[190px] z-50'
    : 'absolute left-0 top-full w-full pt-1.5 z-50';

  return (
    <aside
      className={`fixed top-[76px] left-0 h-[calc(100vh-76px)] flex flex-col z-30 transition-[width] duration-300 ease-in-out ${collapsed ? 'w-20' : 'w-56'}`}
      style={{
        background: 'linear-gradient(160deg, #000000 0%, #05001a 45%, #000d08 100%)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '4px 0 40px rgba(0,0,0,0.8), 1px 0 0 rgba(139,92,246,0.3)',
        backdropFilter: 'blur(12px)',
      }}
    >

      <nav
        className={`flex-1 px-3 py-4 flex flex-col gap-1.5 ${collapsed ? 'overflow-visible' : 'overflow-y-auto overflow-x-hidden'
          }`}
      >

        <NavLink to="/dashboard" end className={link} style={navStyle} title="Dashboard">
          <LayoutDashboard size={19} strokeWidth={2} className="shrink-0" />
          {!collapsed && 'Dashboard'}
        </NavLink>

        {/* Ledger */}
        <div className="relative" onMouseLeave={() => setLedgerOpen(false)}>
          <button
            type="button"
            onClick={() => setLedgerOpen((open) => !open)}
            aria-expanded={ledgerOpen}
            title="Ledger"
            className={groupToggle(ledgerActive || ledgerOpen)}
          >
            <span className="flex items-center gap-3">
              <BookText size={19} strokeWidth={2} className="shrink-0" />
              {!collapsed && 'Ledger'}
            </span>
            {!collapsed && (
              <ChevronDown
                size={15}
                strokeWidth={2.3}
                className={`shrink-0 text-white/40 transition-transform duration-200 ease-out ${ledgerOpen ? 'rotate-180 text-[#6ee7b7]' : ''}`}
              />
            )}
          </button>
          {ledgerOpen && (
            <div className={popoverPosition}>
              <div className="flex flex-col gap-1 p-1.5 rounded-2xl" style={PANEL_STYLE}>
                <NavLink to="/ledger" className={subLink} style={navStyle} onClick={() => setLedgerOpen(false)}>
                  Customer Ledger
                </NavLink>
                <NavLink to="/purchase-ledger" className={subLink} style={navStyle} onClick={() => setLedgerOpen(false)}>
                  Purchase Ledger
                </NavLink>
              </div>
            </div>
          )}
        </div>

        {/* Inventory */}
        <div className="relative" onMouseLeave={() => setInventoryOpen(false)}>
          <button
            type="button"
            onClick={() => setInventoryOpen((open) => !open)}
            aria-expanded={inventoryOpen}
            title="Inventory"
            className={groupToggle(inventoryActive || inventoryOpen)}
          >
            <span className="flex items-center gap-3">
              <Boxes size={19} strokeWidth={2} className="shrink-0" />
              {!collapsed && 'Inventory'}
            </span>
            {!collapsed && (
              <ChevronDown
                size={15}
                strokeWidth={2.3}
                className={`shrink-0 text-white/40 transition-transform duration-200 ease-out ${inventoryOpen ? 'rotate-180 text-[#6ee7b7]' : ''}`}
              />
            )}
          </button>
          {inventoryOpen && (
            <div className={popoverPosition}>
              <div className="flex flex-col gap-1 p-1.5 rounded-2xl" style={PANEL_STYLE}>
                <NavLink to="/products" className={subLink} style={navStyle} onClick={() => setInventoryOpen(false)}>
                  Products
                </NavLink>
                <NavLink to="/stock" className={subLink} style={navStyle} onClick={() => setInventoryOpen(false)}>
                  Stock
                </NavLink>
                <NavLink to="/raw-materials" className={subLink} style={navStyle} onClick={() => setInventoryOpen(false)}>
                  Raw Material
                </NavLink>
                <NavLink to="/production" className={subLink} style={navStyle} onClick={() => setInventoryOpen(false)}>
                  Production
                </NavLink>
                <NavLink to="/assets" className={subLink} style={navStyle} onClick={() => setInventoryOpen(false)}>
                  Assets
                </NavLink>
              </div>
            </div>
          )}
        </div>

        <div className="my-2.5 border-t border-white/[0.07]" />

        <NavLink to="/cashbook" className={link} style={navStyle} title="Cashbook">
          <Wallet size={19} strokeWidth={2} className="shrink-0" />
          {!collapsed && 'Cashbook'}
        </NavLink>
        {isOwner && (
          <NavLink to="/reports" className={link} style={navStyle} title="Reports">
            <FileBarChart2 size={19} strokeWidth={2} className="shrink-0" />
            {!collapsed && 'Reports'}
          </NavLink>
        )}
        <NavLink to="/analytics" className={link} style={navStyle} title="Analytics">
          <LineChart size={19} strokeWidth={2} className="shrink-0" />
          {!collapsed && 'Analytics'}
        </NavLink>
        <NavLink to="/expenses" className={link} style={navStyle} title="Expenses">
          <Receipt size={19} strokeWidth={2} className="shrink-0" />
          {!collapsed && 'Expenses'}
        </NavLink>
        <NavLink to="/employees" className={link} style={navStyle} title="Employees">
          <Users size={19} strokeWidth={2} className="shrink-0" />
          {!collapsed && 'Employees'}
        </NavLink>
      </nav>

      {/* Collapse toggle */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
          className={`w-full flex items-center rounded-2xl text-[14.5px] font-medium text-white/60 hover:text-[#6ee7b7] hover:bg-white/[0.05] transition-all duration-200 ease-out ${collapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
            }`}
        >
          <ChevronLeft
            size={19}
            strokeWidth={2}
            className={`shrink-0 transition-transform duration-300 ease-out ${collapsed ? 'rotate-180' : ''}`}
          />
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  );
}
