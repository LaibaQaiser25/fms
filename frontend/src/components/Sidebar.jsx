import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PANEL_STYLE, ACCENT_GRADIENT_STYLE } from '../theme';
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

// startsWith rather than exact-match so a future nested route (e.g. /products/:id)
// is still recognized as "inside" the group without needing this list updated.
const pathIsInGroup = (pathname, groupPaths) => groupPaths.some((p) => pathname.startsWith(p));

export default function Sidebar({ collapsed = false, onToggleCollapse }) {
  const location = useLocation();
  const { user } = useAuth();
  const isOwner = user?.role?.toLowerCase() === 'owner';

  const ledgerActive = pathIsInGroup(location.pathname, LEDGER_PATHS);
  const inventoryActive = pathIsInGroup(location.pathname, INVENTORY_PATHS);

  // A single "which group is open" value (instead of two independent booleans)
  // gives mutual exclusion for free — opening one group closes the other — and
  // keeps the click-outside/Escape/arrow-key handling in one place below.
  const [openGroup, setOpenGroup] = useState(null);

  const ledgerRef = useRef(null);
  const inventoryRef = useRef(null);
  const ledgerBtnRef = useRef(null);
  const inventoryBtnRef = useRef(null);
  const ledgerPanelRef = useRef(null);
  const inventoryPanelRef = useRef(null);

  const groupRefs = { ledger: ledgerRef, inventory: inventoryRef };
  const groupBtnRefs = { ledger: ledgerBtnRef, inventory: inventoryBtnRef };
  const groupPanelRefs = { ledger: ledgerPanelRef, inventory: inventoryPanelRef };

  const toggleGroup = (name) => setOpenGroup((g) => (g === name ? null : name));
  const closeGroup = () => setOpenGroup(null);

  // Click outside the open group's popover closes it — same pattern already
  // used for the header's alerts dropdown, for consistency.
  useEffect(() => {
    if (!openGroup) return;
    const handleClickOutside = (e) => {
      const ref = groupRefs[openGroup];
      if (ref.current && !ref.current.contains(e.target)) {
        closeGroup();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openGroup]);

  // Escape closes the open group and returns focus to its trigger button
  useEffect(() => {
    if (!openGroup) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        groupBtnRefs[openGroup]?.current?.focus();
        closeGroup();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openGroup]);

  // Arrow-key movement between a submenu's items once it's open
  const focusPanelItem = (panelRef, index) => {
    const items = panelRef.current?.querySelectorAll('[role="menuitem"]');
    if (!items || items.length === 0) return;
    const clamped = ((index % items.length) + items.length) % items.length;
    items[clamped].focus();
  };

  const handleTriggerKeyDown = (name) => (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpenGroup(name);
      // Wait a tick for the panel to mount before focusing into it
      requestAnimationFrame(() => focusPanelItem(groupPanelRefs[name], 0));
    }
  };

  const handlePanelKeyDown = (name) => (e) => {
    const items = groupPanelRefs[name].current?.querySelectorAll('[role="menuitem"]');
    if (!items || items.length === 0) return;
    const currentIndex = Array.prototype.indexOf.call(items, document.activeElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusPanelItem(groupPanelRefs[name], currentIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusPanelItem(groupPanelRefs[name], currentIndex - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusPanelItem(groupPanelRefs[name], 0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusPanelItem(groupPanelRefs[name], items.length - 1);
    }
  };

  // Matches the header's Login-button / avatar treatment so both surfaces read as one system
  const ACTIVE_STYLE = { ...ACCENT_GRADIENT_STYLE, color: '#fff' };

  const navStyle = ({ isActive }) => (isActive ? ACTIVE_STYLE : undefined);

  const link = ({ isActive }) =>
    `flex items-center rounded-2xl text-[14.5px] font-medium transition-all duration-200 ease-out ${collapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
    } ${isActive
      ? 'font-bold'
      : 'text-white/60 hover:text-[#6ee7b7] hover:bg-white/[0.05]'
    }`;

  const subLink = ({ isActive }) =>
    `flex items-center gap-3 px-5 py-3.5 rounded-xl text-[15px] font-medium whitespace-nowrap transition-all duration-150 ease-out ${isActive
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
    ? 'absolute left-full top-0 pl-2 w-max min-w-[240px] z-50'
    : 'absolute left-0 top-full w-full pt-2 z-50';

  // Custom tooltip — only shown in collapsed mode (labels are already visible when
  // expanded) and only via CSS (`group`/`group-hover`), no extra hover state needed.
  const Tooltip = ({ label }) =>
    collapsed ? (
      <span
        className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1.5 rounded-lg text-xs font-medium text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-40"
        style={PANEL_STYLE}
      >
        {label}
      </span>
    ) : null;

  const sectionLabel = (text) =>
    !collapsed && (
      <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/30">
        {text}
      </p>
    );

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

        <div className="relative group">
          <NavLink to="/dashboard" end className={link} style={navStyle}>
            <LayoutDashboard size={19} strokeWidth={2} className="shrink-0" />
            {!collapsed && 'Dashboard'}
          </NavLink>
          <Tooltip label="Dashboard" />
        </div>

        {/* Ledger */}
        <div className="relative group" ref={ledgerRef}>
          <button
            ref={ledgerBtnRef}
            type="button"
            onClick={() => toggleGroup('ledger')}
            onKeyDown={handleTriggerKeyDown('ledger')}
            aria-expanded={openGroup === 'ledger'}
            aria-controls="sidebar-ledger-menu"
            className={groupToggle(ledgerActive || openGroup === 'ledger')}
          >
            <span className="flex items-center gap-3">
              <BookText size={19} strokeWidth={2} className="shrink-0" />
              {!collapsed && 'Ledger'}
            </span>
            {!collapsed && (
              <ChevronDown
                size={15}
                strokeWidth={2.3}
                className={`shrink-0 text-white/40 transition-transform duration-200 ease-out ${openGroup === 'ledger' ? 'rotate-180 text-[#6ee7b7]' : ''}`}
              />
            )}
          </button>
          {openGroup !== 'ledger' && <Tooltip label="Ledger" />}
          {openGroup === 'ledger' && (
            <div className={popoverPosition}>
              <div
                id="sidebar-ledger-menu"
                ref={ledgerPanelRef}
                role="menu"
                aria-label="Ledger"
                onKeyDown={handlePanelKeyDown('ledger')}
                className="flex flex-col gap-1.5 p-2.5 rounded-2xl"
                style={PANEL_STYLE}
              >
                <NavLink to="/ledger" role="menuitem" className={subLink} style={navStyle} onClick={closeGroup}>
                  Customer Ledger
                </NavLink>
                <NavLink to="/purchase-ledger" role="menuitem" className={subLink} style={navStyle} onClick={closeGroup}>
                  Purchase Ledger
                </NavLink>
              </div>
            </div>
          )}
        </div>

        {/* Inventory */}
        <div className="relative group" ref={inventoryRef}>
          <button
            ref={inventoryBtnRef}
            type="button"
            onClick={() => toggleGroup('inventory')}
            onKeyDown={handleTriggerKeyDown('inventory')}
            aria-expanded={openGroup === 'inventory'}
            aria-controls="sidebar-inventory-menu"
            className={groupToggle(inventoryActive || openGroup === 'inventory')}
          >
            <span className="flex items-center gap-3">
              <Boxes size={19} strokeWidth={2} className="shrink-0" />
              {!collapsed && 'Inventory'}
            </span>
            {!collapsed && (
              <ChevronDown
                size={15}
                strokeWidth={2.3}
                className={`shrink-0 text-white/40 transition-transform duration-200 ease-out ${openGroup === 'inventory' ? 'rotate-180 text-[#6ee7b7]' : ''}`}
              />
            )}
          </button>
          {openGroup !== 'inventory' && <Tooltip label="Inventory" />}
          {openGroup === 'inventory' && (
            <div className={popoverPosition}>
              <div
                id="sidebar-inventory-menu"
                ref={inventoryPanelRef}
                role="menu"
                aria-label="Inventory"
                onKeyDown={handlePanelKeyDown('inventory')}
                className="flex flex-col gap-1.5 p-2.5 rounded-2xl"
                style={PANEL_STYLE}
              >
                <NavLink to="/products" role="menuitem" className={subLink} style={navStyle} onClick={closeGroup}>
                  Products
                </NavLink>
                <NavLink to="/stock" role="menuitem" className={subLink} style={navStyle} onClick={closeGroup}>
                  Stock
                </NavLink>
                <NavLink to="/raw-materials" role="menuitem" className={subLink} style={navStyle} onClick={closeGroup}>
                  Raw Material
                </NavLink>
                <NavLink to="/production" role="menuitem" className={subLink} style={navStyle} onClick={closeGroup}>
                  Production
                </NavLink>
                <NavLink to="/assets" role="menuitem" className={subLink} style={navStyle} onClick={closeGroup}>
                  Assets
                </NavLink>
              </div>
            </div>
          )}
        </div>

        <div className="my-2.5 border-t border-white/[0.07]" />

        {sectionLabel('Finance')}

        <div className="relative group">
          <NavLink to="/cashbook" className={link} style={navStyle}>
            <Wallet size={19} strokeWidth={2} className="shrink-0" />
            {!collapsed && 'Cashbook'}
          </NavLink>
          <Tooltip label="Cashbook" />
        </div>
        {isOwner && (
          <div className="relative group">
            <NavLink to="/reports" className={link} style={navStyle}>
              <FileBarChart2 size={19} strokeWidth={2} className="shrink-0" />
              {!collapsed && 'Reports'}
            </NavLink>
            <Tooltip label="Reports" />
          </div>
        )}
        <div className="relative group">
          <NavLink to="/analytics" className={link} style={navStyle}>
            <LineChart size={19} strokeWidth={2} className="shrink-0" />
            {!collapsed && 'Analytics'}
          </NavLink>
          <Tooltip label="Analytics" />
        </div>
        <div className="relative group">
          <NavLink to="/expenses" className={link} style={navStyle}>
            <Receipt size={19} strokeWidth={2} className="shrink-0" />
            {!collapsed && 'Expenses'}
          </NavLink>
          <Tooltip label="Expenses" />
        </div>

        {sectionLabel('Team')}

        <div className="relative group">
          <NavLink to="/employees" className={link} style={navStyle}>
            <Users size={19} strokeWidth={2} className="shrink-0" />
            {!collapsed && 'Employees'}
          </NavLink>
          <Tooltip label="Employees" />
        </div>
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
