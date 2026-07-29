import React, { useState, useEffect, useContext } from 'react';
import { Bell, ShoppingCart, Package, BarChart3, AlertCircle } from 'lucide-react';
import NewSaleModal from './Sales/NewSaleModal';
import NewPurchaseModal from './Purchase/NewPurchaseModal';
import AddPaymentModal from './Payments/AddPaymentModal';
import AddProductionDirect from './AddProductionDirect';
import * as salesApi from '../api/salesApi';
import { NavLink, Link, useOutletContext } from 'react-router-dom';
import { AlertRefreshContext } from './Layout';

function Dashboard() {
  const alertRefresh = useContext(AlertRefreshContext);
  const outletContext = useOutletContext();
  const [showNewSaleModal, setShowNewSaleModal] = useState(false);
  const [showNewPurchaseModal, setShowNewPurchaseModal] = useState(false);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showAddProductionModal, setShowAddProductionModal] = useState(false);
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);
  const [salesSummary, setSalesSummary] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [outletContext?.refreshTrigger?.pendingPayments]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      // Single optimized API call replaces 4 separate calls
      const response = await salesApi.getDashboardData();

      const { salesSummary, recentOrders, lowStockAlerts, pendingPayments } = response.data.data;

      setSalesSummary(salesSummary);
      setRecentOrders(recentOrders || []);
      setLowStockAlerts(lowStockAlerts || []);
      setPendingPayments(pendingPayments || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
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
    <div className="min-h-screen bg-white flex flex-col" style={{ paddingTop: '76px' }}>
        {/* Header */}            


      {/* Action Buttons */}
      <div className="px-8 py-4 bg-white border-b border-gray-200">
        <div className="grid grid-cols-4 gap-4">
          <button
            onClick={() => setShowNewSaleModal(true)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-semibold"
          >
            <ShoppingCart className="w-5 h-5" />
            New Sale
          </button>
         <button
  onClick={() => setShowNewPurchaseModal(true)}
  className="flex items-center justify-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white rounded-lg font-semibold transition-colors duration-150 shadow-sm cursor-pointer"
>
  <Package className="w-5 h-5" />
  New Purchase
</button>
          <button
            onClick={() => setShowAddProductionModal(true)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-semibold"
          >
            <Package className="w-5 h-5" />
            New Production
          </button>
          <button
            onClick={() => setShowAddPaymentModal(true)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition font-semibold"
          >
            <BarChart3 className="w-5 h-5" />
            Add Payment
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-8 py-6">
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading dashboard...</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-6 mb-6">
            {/* Card 1: Today's Sales Summary */}
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
              <h3 className="text-gray-600 text-sm font-semibold mb-2">Today's Sales</h3>
              <p className="text-3xl font-bold text-gray-800">{formatCurrency(salesSummary?.total_amount)}</p>
              <p className="text-xs text-gray-500 mt-2">Total Sales: {salesSummary?.total_sales || 0}</p>
              <p className="text-xs text-gray-500">Received: {formatCurrency(salesSummary?.total_advance || 0)}</p>
            </div>

            {/* Card 2: Recent Orders */}
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
              <h3 className="text-gray-600 text-sm font-semibold mb-2">Recent Orders</h3>
              <p className="text-3xl font-bold text-gray-800">{recentOrders.length}</p>
              <p className="text-xs text-gray-500 mt-2">New orders today</p>
              {recentOrders.length > 0 && (
                <p className="text-xs text-gray-500">Latest: {recentOrders[0].customer_name}</p>
              )}
            </div>

            {/* Card 3: Low Stock Alerts */}
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
              <h3 className="text-gray-600 text-sm font-semibold mb-2">Low Stock</h3>
              <p className="text-3xl font-bold text-gray-800">{lowStockAlerts.length}</p>
              <p className="text-xs text-gray-500 mt-2">Items need restock</p>
              {lowStockAlerts.length > 0 && (
                <p className="text-xs text-yellow-600 font-semibold">{lowStockAlerts[0].name}</p>
              )}
            </div>

            {/* Card 4: Pending Payments */}
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500">
              <h3 className="text-gray-600 text-sm font-semibold mb-2">Pending Payments</h3>
              <p className="text-3xl font-bold text-gray-800">{formatCurrency(
                pendingPayments.reduce((sum, p) => {
                  const debt = parseFloat(p.outstanding_debt) || 0;
                  return sum + (isNaN(debt) ? 0 : debt);
                }, 0)
              )}</p>
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
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${order.status === 'ready' ? 'bg-green-100 text-green-800' :
                          order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            order.status === 'delivered' ? 'bg-blue-100 text-blue-800' :
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
          onSuccess={() => {
            setShowNewPurchaseModal(false);
            fetchDashboardData();
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
