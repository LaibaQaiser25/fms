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
  Lock,
  ChevronDown,
  ChevronLeft,
  X,
} from 'lucide-react';

const LEDGER_PATHS = ['/ledger', '/purchase-ledger'];
const INVENTORY_PATHS = ['/products', '/stock', '/raw-materials', '/production', '/assets'];

// startsWith rather than exact-match so a future nested route (e.g. /products/:id)
// is still recognized as "inside" the group without needing this list updated.
const pathIsInGroup = (pathname, groupPaths) => groupPaths.some((p) => pathname.startsWith(p));

export default function Sidebar({ collapsed = false, onToggleCollapse, mobileOpen = false, onCloseMobile }) {
  const location = useLocation();
  const { user } = useAuth();
  const role = user?.role?.toLowerCase();
  const isOwner = role === 'owner';

  // On the mobile off-canvas drawer, always show full labels regardless of
  // the persisted desktop collapsed/expanded rail preference — an icon-only
  // rail makes no sense once the sidebar is a full-width overlay.
  const effectiveCollapsed = collapsed && !mobileOpen;

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
    `flex items-center rounded-2xl text-[14.5px] font-medium transition-all duration-200 ease-out ${effectiveCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
    } ${isActive
      ? 'font-bold'
      : 'text-white/60 hover:text-[var(--color-text-accent)] hover:bg-white/[0.05]'
    }`;

  const subLink = ({ isActive }) =>
    `flex items-center gap-3 px-5 py-3.5 rounded-xl text-[15px] font-medium whitespace-nowrap transition-all duration-150 ease-out ${isActive
      ? 'font-bold'
      : 'text-white/55 hover:text-[var(--color-text-accent)] hover:bg-white/[0.06]'
    }`;

  const groupToggle = (isActiveGroup) =>
    `w-full flex items-center rounded-2xl text-[14.5px] font-medium transition-all duration-200 ease-out ${effectiveCollapsed ? 'justify-center p-3' : 'justify-between gap-3 px-4 py-3'
    } ${isActiveGroup
      ? 'text-[var(--color-text-accent)] bg-white/[0.06]'
      : 'text-white/60 hover:text-[var(--color-text-accent)] hover:bg-white/[0.05]'
    }`;

  // Collapsed: flies out beside the rail as an absolutely-positioned overlay
  // (there's no room to push content down in the narrow icon-only rail).
  // Expanded (desktop rail or mobile drawer): stays in normal document flow
  // instead of overlaying — an absolute overlay here would render on top of
  // the next nav item (e.g. "Inventory" sitting right below "Ledger") and
  // make it unclickable for as long as the submenu stayed open. Being part
  // of the flow instead means opening a group pushes the items below it
  // down, which the nav's own overflow-y-auto already scrolls to reach.
  const popoverPosition = effectiveCollapsed
    ? 'absolute left-full top-0 pl-2 w-max min-w-[240px] z-50'
    : 'w-full pt-2';

  // Custom tooltip — only shown in collapsed mode (labels are already visible when
  // expanded) and only via CSS (`group`/`group-hover`), no extra hover state needed.
  const Tooltip = ({ label }) =>
    effectiveCollapsed ? (
      <span
        className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1.5 rounded-lg text-xs font-medium text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-40"
        style={PANEL_STYLE}
      >
        {label}
      </span>
    ) : null;

  const sectionLabel = (text) =>
    !effectiveCollapsed && (
      <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/30">
        {text}
      </p>
    );

  return (
    <>
      {/* Backdrop — mobile only, dims the page below the header while the
          off-canvas drawer is open; tapping it closes the drawer. */}
      {mobileOpen && (
        <div
          className="fixed top-[76px] left-0 right-0 bottom-0 z-30 bg-black/50 md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed top-[76px] left-0 h-[calc(100vh-76px)] flex flex-col z-40 w-64 transition-transform duration-300 ease-in-out md:transition-[width] md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'
          } ${collapsed ? 'md:w-20' : 'md:w-56'}`}
        style={{
          background: 'var(--nav-bg)',
          borderRight: 'var(--nav-border-width) solid var(--nav-border-color)',
          boxShadow: 'var(--nav-shadow)',
          backdropFilter: 'var(--nav-blur)',
        }}
      >
        {/* Collapse toggle — a small handle straddling the rail's edge
            instead of a full nav-row, so it doesn't compete with Dashboard
            for the top slot. Desktop only; the mobile drawer has no
            "collapsed" state of its own (see effectiveCollapsed above) and
            closes via the X button or backdrop instead. */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden md:flex absolute -right-3 top-6 z-50 w-5 h-10 items-center justify-center rounded-md border border-[var(--nav-border-color)] text-white/70 hover:text-[var(--color-text-accent)] shadow-md transition-all duration-200 ease-out"
          style={{ background: 'var(--nav-bg)' }}
        >
          <ChevronLeft
            size={13}
            strokeWidth={2.5}
            className={`shrink-0 transition-transform duration-300 ease-out ${collapsed ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Mobile-only close button — the desktop collapse toggle above is
            hidden on mobile since the drawer has no "collapsed" state of its
            own. */}
        <div className="flex justify-end px-3 pt-3 md:hidden">
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

      <nav
        className={`flex-1 px-3 py-4 flex flex-col gap-1.5 ${effectiveCollapsed ? 'overflow-visible' : 'overflow-y-auto overflow-x-hidden scrollbar-hide'
          }`}
      >

        <div className="relative group">
          <NavLink to="/dashboard" end className={link} style={navStyle}>
            <LayoutDashboard size={19} strokeWidth={2} className="shrink-0" />
            {!effectiveCollapsed && 'Dashboard'}
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
              {!effectiveCollapsed && 'Ledger'}
            </span>
            {!effectiveCollapsed && (
              <ChevronDown
                size={15}
                strokeWidth={2.3}
                className={`shrink-0 text-white/40 transition-transform duration-200 ease-out ${openGroup === 'ledger' ? 'rotate-180 text-[var(--color-text-accent)]' : ''}`}
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
              {!effectiveCollapsed && 'Inventory'}
            </span>
            {!effectiveCollapsed && (
              <ChevronDown
                size={15}
                strokeWidth={2.3}
                className={`shrink-0 text-white/40 transition-transform duration-200 ease-out ${openGroup === 'inventory' ? 'rotate-180 text-[var(--color-text-accent)]' : ''}`}
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

        {isOwner && (
          <div className="relative group">
            <NavLink to="/cashbook" className={link} style={navStyle}>
              <Wallet size={19} strokeWidth={2} className="shrink-0" />
              {!effectiveCollapsed && 'Cashbook'}
            </NavLink>
            <Tooltip label="Cashbook" />
          </div>
        )}
        {isOwner && (
          <div className="relative group">
            <NavLink to="/reports" className={link} style={navStyle}>
              <FileBarChart2 size={19} strokeWidth={2} className="shrink-0" />
              {!effectiveCollapsed && 'Reports'}
            </NavLink>
            <Tooltip label="Reports" />
          </div>
        )}
        {isOwner && (
          <div className="relative group">
            <NavLink to="/analytics" className={link} style={navStyle}>
              <LineChart size={19} strokeWidth={2} className="shrink-0" />
              {!effectiveCollapsed && 'Analytics'}
            </NavLink>
            <Tooltip label="Analytics" />
          </div>
        )}
        <div className="relative group">
          <NavLink to="/expenses" className={link} style={navStyle}>
            <Receipt size={19} strokeWidth={2} className="shrink-0" />
            {!effectiveCollapsed && 'Expenses'}
          </NavLink>
          <Tooltip label="Expenses" />
        </div>

        {sectionLabel('Team')}

        <div className="relative group">
          <NavLink to="/employees" className={link} style={navStyle}>
            <Users size={19} strokeWidth={2} className="shrink-0" />
            {!effectiveCollapsed && 'Employees'}
          </NavLink>
          <Tooltip label="Employees" />
        </div>
        {isOwner && (
          <div className="relative group">
            <NavLink to="/privacy" className={link} style={navStyle}>
              <Lock size={19} strokeWidth={2} className="shrink-0" />
              {!effectiveCollapsed && 'Privacy'}
            </NavLink>
            <Tooltip label="Privacy" />
          </div>
        )}
      </nav>
      </aside>
    </>
  );
}
