import React, { useState, useEffect, useContext, useRef } from 'react';
import { Bell, ShoppingCart, Package, BarChart3, AlertCircle } from 'lucide-react';
import NewSaleModal from './Sales/NewSaleModal';
import NewPurchaseModal from './Purchase/NewPurchaseModal';
import AddPaymentModal from './Payments/AddPaymentModal';
import PurchasePaymentModal from './Payments/PurchasePaymentModal';
import AddProductionDirect from './AddProductionDirect';
import { NavLink, Link } from 'react-router-dom';
import { AlertRefreshContext } from './Layout';

// Shrinks its own font-size until the text fits on one line within its
// container, instead of overflowing the card or wrapping mid-number.
const FIT_MAX_PX = 30; // text-3xl
const FIT_MIN_PX = 15; // floor before we'd rather clip than get unreadable

function FitText({ children, className = '' }) {
  const ref = useRef(null);
  const [fontSize, setFontSize] = useState(FIT_MAX_PX);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      let size = FIT_MAX_PX;
      el.style.fontSize = `${size}px`;
      while (el.scrollWidth > el.clientWidth && size > FIT_MIN_PX) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
      setFontSize(size);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);

  return (
    <p
      ref={ref}
      className={`${className} whitespace-nowrap overflow-hidden`}
      style={{ fontSize }}
      title={typeof children === 'string' ? children : undefined}
    >
      {children}
    </p>
  );
}

function Dashboard() {
  const alertRefresh = useContext(AlertRefreshContext);
  const [showNewSaleModal, setShowNewSaleModal] = useState(false);
  const [showNewPurchaseModal, setShowNewPurchaseModal] = useState(false);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showPurchasePaymentModal, setShowPurchasePaymentModal] = useState(false);
  const [showPaymentPopover, setShowPaymentPopover] = useState(false);
  const paymentPopoverTimeout = useRef(null);
  const [showAddProductionModal, setShowAddProductionModal] = useState(false);
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);

  // Dashboard data comes from Layout's fetchAlerts (AlertRefreshContext), which
  // every page already fetches on mount — no separate call here, otherwise
  // /sales/dashboard/data ends up hit twice on every dashboard load.
  const salesSummary = alertRefresh?.salesSummary ?? null;
  const recentOrders = alertRefresh?.recentOrders ?? [];
  const lowStockAlerts = alertRefresh?.lowStockAlerts ?? [];
  const pendingPayments = alertRefresh?.pendingPayments ?? [];
  const loading = salesSummary === null;

  const openPaymentPopover = () => {
    if (paymentPopoverTimeout.current) {
      clearTimeout(paymentPopoverTimeout.current);
      paymentPopoverTimeout.current = null;
    }
    setShowPaymentPopover(true);
  };

  const closePaymentPopoverWithDelay = () => {
    paymentPopoverTimeout.current = setTimeout(() => {
      setShowPaymentPopover(false);
    }, 200);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR'
    }).format(amount || 0);
  };

  const allAlerts = [
    ...lowStockAlerts.map(stock => ({
      type: 'stock',
      message: `${stock.name} - Low Stock (${stock.quantity} units)`,
      severity: 'warning'
    })),
    ...pendingPayments.slice(0, 5).map(payment => ({
      type: 'payment',
      message: `${payment.customer_name} - Outstanding Debt: ${formatCurrency(payment.outstanding_debt)}`,
      severity: 'alert'
    }))
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col">
        {/* Header */}            


      {/* Action Buttons */}
      <div className="px-8 py-4 bg-white border-b border-gray-200">
        <div className="grid grid-cols-4 gap-4">
          <button
            onClick={() => setShowNewSaleModal(true)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-[var(--color-sale)] hover:bg-[var(--color-sale-hover)] text-white rounded-lg transition font-semibold"
          >
            <ShoppingCart className="w-5 h-5" />
            New Sale
          </button>
         <button
  onClick={() => setShowNewPurchaseModal(true)}
  className="flex items-center justify-center gap-2 px-6 py-3 bg-[var(--color-purchase)] hover:bg-[var(--color-purchase-hover)] text-white rounded-lg font-semibold transition-colors duration-150 shadow-sm cursor-pointer"
>
  <Package className="w-5 h-5" />
  New Purchase
</button>
          <button
            onClick={() => setShowAddProductionModal(true)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-[var(--color-production)] hover:bg-[var(--color-production-hover)] text-white rounded-lg transition font-semibold"
          >
            <Package className="w-5 h-5" />
            New Production
          </button>
          <div
            className="relative"
            onMouseEnter={openPaymentPopover}
            onMouseLeave={closePaymentPopoverWithDelay}
          >
            <button
              onClick={() => setShowPaymentPopover(prev => !prev)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[var(--color-payment)] hover:bg-[var(--color-payment-hover)] text-white rounded-lg transition font-semibold"
            >
              <BarChart3 className="w-5 h-5" />
              Add Payment
            </button>

            {showPaymentPopover && (
              <div
                className="absolute top-full left-0 right-0 pt-2 z-30"
                onMouseEnter={openPaymentPopover}
                onMouseLeave={closePaymentPopoverWithDelay}
              >
                <div className="relative p-2 rounded-xl bg-white border border-gray-200 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.28)] flex flex-col gap-1.5">
                  {/* pointer */}
                  <span className="absolute -top-[7px] left-7 w-3 h-3 rotate-45 bg-white border-l border-t border-gray-200 rounded-tl-sm" />

                  <button
                    onClick={() => {
                      setShowPaymentPopover(false);
                      setShowAddPaymentModal(true);
                    }}
                    className="relative flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-sale)] hover:bg-[var(--color-sale-hover)] text-white rounded-lg transition-all duration-200 font-semibold text-sm shadow-sm hover:shadow-md"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Sale Payment
                  </button>
                  <button
                    onClick={() => {
                      setShowPaymentPopover(false);
                      setShowPurchasePaymentModal(true);
                    }}
                    className="relative flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-purchase)] hover:bg-[var(--color-purchase-hover)] text-white rounded-lg transition-all duration-200 font-semibold text-sm shadow-sm hover:shadow-md"
                  >
                    <Package className="w-4 h-4" />
                    Purchase Payment
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-8 py-6">
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-brand)]"></div>
            <p className="mt-2 text-gray-600">Loading dashboard...</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-6 mb-6">
            {/* Card 1: Today's Sales Summary */}
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-[var(--color-brand)]">
              <h3 className="text-gray-600 text-sm font-semibold mb-2">Today's Sales</h3>
              <FitText className="font-bold text-gray-800">{formatCurrency(salesSummary?.total_amount)}</FitText>
              <p className="text-xs text-gray-500 mt-2">Total Sales: {salesSummary?.total_sales || 0}</p>
              <p className="text-xs text-gray-500">Received: {formatCurrency(salesSummary?.total_advance || 0)}</p>
            </div>

            {/* Card 2: Recent Orders */}
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-[var(--color-production)]">
              <h3 className="text-gray-600 text-sm font-semibold mb-2">Recent Orders</h3>
              <FitText className="font-bold text-gray-800">{recentOrders.length}</FitText>
              <p className="text-xs text-gray-500 mt-2">New orders today</p>
              {recentOrders.length > 0 && (
                <p className="text-xs text-gray-500">Latest: {recentOrders[0].customer_name}</p>
              )}
            </div>

            {/* Card 3: Low Stock Alerts */}
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
              <h3 className="text-gray-600 text-sm font-semibold mb-2">Low Stock</h3>
              <FitText className="font-bold text-gray-800">{lowStockAlerts.length}</FitText>
              <p className="text-xs text-gray-500 mt-2">Items need restock</p>
              {lowStockAlerts.length > 0 && (
                <p className="text-xs text-yellow-600 font-semibold">{lowStockAlerts[0].name}</p>
              )}
            </div>

            {/* Card 4: Pending Payments */}
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500">
              <h3 className="text-gray-600 text-sm font-semibold mb-2">Pending Payments</h3>
              <FitText className="font-bold text-gray-800">{formatCurrency(
                pendingPayments.reduce((sum, p) => {
                  const debt = parseFloat(p.outstanding_debt) || 0;
                  return sum + (isNaN(debt) ? 0 : debt);
                }, 0)
              )}</FitText>
              <p className="text-xs text-gray-500 mt-2">Outstanding: {pendingPayments.length} invoices</p>
            </div>
          </div>
        )}

        {/* Bottom Section: Recent Orders Table */}
        {recentOrders.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Recent Orders</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="text-left py-2 px-4 font-semibold text-gray-700">Order #</th>
                    <th className="text-left py-2 px-4 font-semibold text-gray-700">Customer</th>
                    <th className="text-left py-2 px-4 font-semibold text-gray-700">Amount</th>
                    <th className="text-left py-2 px-4 font-semibold text-gray-700">Status</th>
                    <th className="text-left py-2 px-4 font-semibold text-gray-700">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.slice(0, 5).map(order => (
                    <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 font-semibold text-gray-800">{order.sale_no}</td>
                      <td className="py-3 px-4 text-gray-700">{order.customer_name}</td>
                      <td className="py-3 px-4 text-gray-700 font-semibold">{formatCurrency(order.total_amount)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${order.status === 'ready' ? 'bg-gray-200 text-gray-900' :
                          order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            order.status === 'delivered' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                          }`}>
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs">{new Date(order.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* New Sale Modal */}
      {showNewSaleModal && (
        <NewSaleModal
          onClose={() => {
            setShowNewSaleModal(false);
          }}
        />
      )}

      {/* New Purchase Modal */}
      {showNewPurchaseModal && (
        <NewPurchaseModal
          onClose={() => {
            setShowNewPurchaseModal(false);
          }}
        />
      )}

      {/* Add Payment Modal */}
      {showAddPaymentModal && (
        <AddPaymentModal
          onClose={() => {
            setShowAddPaymentModal(false);
          }}
        />
      )}

      {/* Purchase Payment Modal */}
      {showPurchasePaymentModal && (
        <PurchasePaymentModal
          onClose={() => {
            setShowPurchasePaymentModal(false);
          }}
        />
      )}

      {/* Add Production Modal */}
      {showAddProductionModal && (
        <AddProductionDirect
          onClose={() => {
            setShowAddProductionModal(false);
          }}
          onSuccess={() => {
            setShowAddProductionModal(false);
            alertRefresh?.fetchAlerts?.();
          }}
        />
      )}
    </div>
  );
}

export default Dashboard;
