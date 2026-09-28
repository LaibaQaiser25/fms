import React, { useState, useContext, useRef, useEffect } from 'react';
import { Bell, ShoppingCart, Package, BarChart3, AlertCircle, Truck, PackageCheck, Boxes, Factory, Receipt, ClipboardList, AlertTriangle, HandCoins, ChevronRight } from 'lucide-react';
import NewSaleModal from './Sales/NewSaleModal';
import NewPurchaseModal from './Purchase/NewPurchaseModal';
import AddPaymentModal from './Payments/AddPaymentModal';
import PurchasePaymentModal from './Payments/PurchasePaymentModal';
import AddProductionDirect from './AddProductionDirect';
import GatePassModal from './GatePass/GatePassModal';
import { NavLink, Link } from 'react-router-dom';
import { AlertRefreshContext } from './Layout';
import { SkeletonStatCard } from './shared/Skeleton';
import * as stockApi from '../api/stockApi';
import * as productionApi from '../api/productionApi';
import expenseAPI from '../api/expenseApi';
import { ORDER_STATUSES } from './Sales/orderStatuses';

// Open/close state for a hover menu under an action button — the short close
// delay lets the pointer cross the gap between the button and the menu.
function useHoverPopover() {
  const [open, setOpen] = useState(false);
  const timeout = useRef(null);
  const show = () => {
    clearTimeout(timeout.current);
    setOpen(true);
  };
  const hide = () => {
    timeout.current = setTimeout(() => setOpen(false), 200);
  };
  return { open, setOpen, show, hide };
}

// Dashboard tile — a flat, wide strip: tinted icon, label, value and one
// line of detail, with a chevron on the right. The whole card links to `to`
// (the page/list behind the number). `cta` names that destination for
// screen readers and the hover tooltip.
function StatCard({ title, value, lines = [], icon: Icon, accent, to, cta = 'View all' }) {
  const detail = lines.filter(Boolean);
  return (
    <Link
      to={to}
      title={cta}
      aria-label={`${title}: ${value}. ${cta}`}
      className="group flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-5 py-4 transition-colors duration-150 hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
    >
      {Icon && (
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `color-mix(in srgb, ${accent} 10%, white)`, color: accent }}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
        <p className="truncate text-xl font-semibold tabular-nums text-gray-900">{value}</p>
        {detail.length > 0 && (
          <p className="text-xs leading-5 text-gray-500">
            {detail.map((line, i) => (
              <React.Fragment key={i}>
                {i > 0 && ' · '}
                <span className="whitespace-nowrap">{line}</span>
              </React.Fragment>
            ))}
          </p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-gray-500" />
    </Link>
  );
}

// Local YYYY-MM-DD for the first of this month (expenses.date is a DATE)
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

function Dashboard() {
  const alertRefresh = useContext(AlertRefreshContext);
  const [showNewSaleModal, setShowNewSaleModal] = useState(false);
  const [showNewPurchaseModal, setShowNewPurchaseModal] = useState(false);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showPurchasePaymentModal, setShowPurchasePaymentModal] = useState(false);
  const paymentPopover = useHoverPopover();
  const gatePassPopover = useHoverPopover();
  const [gatePassKind, setGatePassKind] = useState(null); // 'order' | 'received'
  const [showAddProductionModal, setShowAddProductionModal] = useState(false);
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);

  // Dashboard data comes from Layout's fetchAlerts (AlertRefreshContext), which
  // every page already fetches on mount — no separate call here, otherwise
  // /sales/dashboard/data ends up hit twice on every dashboard load.
  const salesSummary = alertRefresh?.salesSummary ?? null;
  const recentOrders = alertRefresh?.recentOrders ?? [];
  const lowStockAlerts = alertRefresh?.lowStockAlerts ?? [];
  const pendingPayments = alertRefresh?.pendingPayments ?? [];
  const orderStatusCounts = alertRefresh?.orderStatusCounts ?? [];
  const purchasesSummary = alertRefresh?.purchasesSummary ?? null;
  const payablePayments = alertRefresh?.payablePayments ?? [];
  const loading = salesSummary === null;

  // Stock / production / expense figures are only shown here, so they're
  // fetched by the dashboard itself rather than added to Layout's shared fetch.
  const [stockList, setStockList] = useState(null);
  const [productionStats, setProductionStats] = useState(null);
  const [monthExpenses, setMonthExpenses] = useState(null);

  useEffect(() => {
    stockApi.getAllStock()
      .then((res) => setStockList(res.data || []))
      .catch((err) => { console.error('Error fetching stock:', err); setStockList([]); });
    productionApi.getStats()
      .then((res) => setProductionStats(res.data.data || {}))
      .catch((err) => { console.error('Error fetching production stats:', err); setProductionStats({}); });
    expenseAPI.getSummary({ startDate: monthStart() })
      .then((res) => {
        const rows = res.data.data || [];
        setMonthExpenses({
          total: rows.reduce((sum, r) => sum + (Number(r.total) || 0), 0),
          count: rows.reduce((sum, r) => sum + (Number(r.count) || 0), 0)
        });
      })
      .catch((err) => { console.error('Error fetching expense summary:', err); setMonthExpenses({ total: 0, count: 0 }); });
  }, []);

  const totalOrders = orderStatusCounts.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
  const statusCount = (status) => orderStatusCounts.find((r) => r.status === status) || { count: 0, total_amount: 0 };

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
      <div className="px-3 sm:px-6 md:px-8 py-4 bg-white border-b border-gray-200">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <button
            onClick={() => setShowNewSaleModal(true)}
            className="flex items-center justify-center gap-2 px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-[var(--color-sale)] hover:bg-[var(--color-sale-hover)] text-white rounded-lg transition font-semibold"
          >
            <ShoppingCart className="w-5 h-5 shrink-0" />
            New Sale
          </button>
         <button
  onClick={() => setShowNewPurchaseModal(true)}
  className="flex items-center justify-center gap-2 px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-[var(--color-purchase)] hover:bg-[var(--color-purchase-hover)] text-white rounded-lg font-semibold transition-colors duration-150 shadow-sm cursor-pointer"
>
  <Package className="w-5 h-5 shrink-0" />
  New Purchase
</button>
          <button
            onClick={() => setShowAddProductionModal(true)}
            className="flex items-center justify-center gap-2 px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-[var(--color-production)] hover:bg-[var(--color-production-hover)] text-white rounded-lg transition font-semibold"
          >
            <Package className="w-5 h-5 shrink-0" />
            New Production
          </button>
          <div
            className="relative"
            onMouseEnter={paymentPopover.show}
            onMouseLeave={paymentPopover.hide}
          >
            <button
              onClick={() => paymentPopover.setOpen(prev => !prev)}
              className="w-full flex items-center justify-center gap-2 px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-[var(--color-payment)] hover:bg-[var(--color-payment-hover)] text-white rounded-lg transition font-semibold"
            >
              <BarChart3 className="w-5 h-5" />
              Add Payment
            </button>

            {paymentPopover.open && (
              <div
                className="absolute top-full left-0 right-0 pt-2 z-30"
                onMouseEnter={paymentPopover.show}
                onMouseLeave={paymentPopover.hide}
              >
                <div className="relative p-2 rounded-xl bg-white border border-gray-200 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.28)] flex flex-col gap-1.5">
                  {/* pointer */}
                  <span className="absolute -top-[7px] left-7 w-3 h-3 rotate-45 bg-white border-l border-t border-gray-200 rounded-tl-sm" />

                  <button
                    onClick={() => {
                      paymentPopover.setOpen(false);
                      setShowAddPaymentModal(true);
                    }}
                    className="relative flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-sale)] hover:bg-[var(--color-sale-hover)] text-white rounded-lg transition-all duration-200 font-semibold text-sm shadow-sm hover:shadow-md"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Sale Payment
                  </button>
                  <button
                    onClick={() => {
                      paymentPopover.setOpen(false);
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
          <div
            className="relative col-span-2 lg:col-span-1"
            onMouseEnter={gatePassPopover.show}
            onMouseLeave={gatePassPopover.hide}
          >
            <button
              onClick={() => gatePassPopover.setOpen(prev => !prev)}
              className="w-full flex items-center justify-center gap-2 px-3 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-[var(--color-gatepass)] hover:bg-[var(--color-gatepass-hover)] text-white rounded-lg transition font-semibold"
            >
              <Truck className="w-5 h-5 shrink-0" />
              Gate Pass
            </button>

            {gatePassPopover.open && (
              <div
                className="absolute top-full left-0 right-0 pt-2 z-30"
                onMouseEnter={gatePassPopover.show}
                onMouseLeave={gatePassPopover.hide}
              >
                <div className="relative p-2 rounded-xl bg-white border border-gray-200 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.28)] flex flex-col gap-1.5">
                  {/* pointer */}
                  <span className="absolute -top-[7px] left-7 w-3 h-3 rotate-45 bg-white border-l border-t border-gray-200 rounded-tl-sm" />

                  <button
                    onClick={() => {
                      gatePassPopover.setOpen(false);
                      setGatePassKind('order');
                    }}
                    className="relative flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-sale)] hover:bg-[var(--color-sale-hover)] text-white rounded-lg transition-all duration-200 font-semibold text-sm shadow-sm hover:shadow-md"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Order
                  </button>
                  <button
                    onClick={() => {
                      gatePassPopover.setOpen(false);
                      setGatePassKind('received');
                    }}
                    className="relative flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-purchase)] hover:bg-[var(--color-purchase-hover)] text-white rounded-lg transition-all duration-200 font-semibold text-sm shadow-sm hover:shadow-md"
                  >
                    <PackageCheck className="w-4 h-4" />
                    Received Goods
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-3 sm:px-6 md:px-8 py-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <StatCard
              title="Today's Sales"
              value={formatCurrency(salesSummary?.total_amount)}
              lines={[
                `Total Sales: ${salesSummary?.total_sales || 0}`,
                `Received: ${formatCurrency(salesSummary?.total_advance || 0)}`
              ]}
              icon={ShoppingCart}
              accent="var(--color-accent)"
              to="/orders"
              cta="View orders"
            />
            <StatCard
              title="Recent Orders"
              value={recentOrders.length}
              lines={[
                recentOrders.length > 0 ? `Latest: ${recentOrders[0].customer_name}` : 'No orders yet'
              ]}
              icon={ClipboardList}
              accent="var(--color-production)"
              to="/orders"
              cta="View orders"
            />
            <StatCard
              title="Low Stock"
              value={lowStockAlerts.length}
              lines={[
                'Items need restock',
                lowStockAlerts.length > 0 && lowStockAlerts[0].name
              ]}
              icon={AlertTriangle}
              accent="#eab308"
              to="/stock"
              cta="View stock"
            />
            <StatCard
              title="Pending Payments"
              value={formatCurrency(pendingPayments.reduce((sum, p) => sum + (parseFloat(p.outstanding_debt) || 0), 0))}
              lines={[`Outstanding: ${pendingPayments.length} invoices`]}
              icon={HandCoins}
              accent="var(--color-payment)"
              to="/ledger"
              cta="View ledger"
            />
          </div>
        )}

        {/* Order status (left) and operations overview (right) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:grid-flow-col sm:grid-rows-[auto_repeat(4,auto)] sm:gap-x-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Orders by Status</h2>
            <Link to="/orders" className="text-xs font-medium text-gray-500 hover:text-gray-900">All orders</Link>
          </div>
          {ORDER_STATUSES.map(({ status, label, icon, accent }) => {
            const row = statusCount(status);
            return (
              <StatCard
                key={status}
                title={label}
                value={loading ? '—' : row.count}
                lines={[
                  `Value: ${formatCurrency(row.total_amount)}`,
                  `${totalOrders ? Math.round((row.count / totalOrders) * 100) : 0}% of all orders`
                ]}
                icon={icon}
                accent={accent}
                to={`/orders?status=${status}`}
                cta="View list"
              />
            );
          })}

          <h2 className="mt-5 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:mt-0">Operations</h2>
          <StatCard
            title="Purchases Today"
            value={loading ? '—' : formatCurrency(purchasesSummary?.total_amount)}
            lines={[
              `Purchases: ${purchasesSummary?.total_purchases || 0}`,
              `Payable: ${formatCurrency(payablePayments.reduce((sum, p) => sum + (Number(p.outstanding_debt) || 0), 0))}`
            ]}
            icon={Package}
            accent="var(--color-purchase)"
            to="/purchase-ledger"
            cta="View purchases"
          />
          <StatCard
            title="Stock"
            value={stockList === null ? '—' : `${stockList.length} items`}
            lines={[
              `Units on hand: ${(stockList || []).reduce((sum, s) => sum + (Number(s.quantity) || 0), 0).toLocaleString()}`,
              `Low stock: ${lowStockAlerts.length}`
            ]}
            icon={Boxes}
            accent="#0ea5e9"
            to="/stock"
            cta="View stock"
          />
          <StatCard
            title="Production"
            value={productionStats === null ? '—' : `${(Number(productionStats.pending_count) || 0) + (Number(productionStats.in_progress_count) || 0)} active`}
            lines={[
              `Pending: ${productionStats?.pending_count || 0} · In progress: ${productionStats?.in_progress_count || 0}`,
              `Completed: ${productionStats?.completed_count || 0}`
            ]}
            icon={Factory}
            accent="var(--color-production)"
            to="/production"
            cta="View queue"
          />
          <StatCard
            title="Expenses This Month"
            value={monthExpenses === null ? '—' : formatCurrency(monthExpenses.total)}
            lines={[`Entries: ${monthExpenses?.count || 0}`]}
            icon={Receipt}
            accent="#e11d48"
            to="/expenses"
            cta="View expenses"
          />
        </div>
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

      {/* Gate Pass Modal */}
      {gatePassKind && (
        <GatePassModal
          kind={gatePassKind}
          onClose={() => setGatePassKind(null)}
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
