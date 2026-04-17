import React, { useState, useEffect } from 'react';
import { Bell, ShoppingCart, Package, BarChart3, AlertCircle } from 'lucide-react';
import NewSaleModal from './Sales/NewSaleModal';
import * as salesApi from '../api/salesApi';

function Dashboard() {
  const [showNewSaleModal, setShowNewSaleModal] = useState(false);
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);
  const [salesSummary, setSalesSummary] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

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
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-8 py-4 flex items-center justify-between">
          {/* Left: Logo */}
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-800">FMS Dashboard</h1>
          </div>

          {/* Center: Search Bar */}
          <div className="flex-1 mx-8">
            <input
              type="text"
              placeholder="Search customers, invoices, products..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              disabled
            />
          </div>

          {/* Right: Alert Bell */}
          <div className="relative">
            <button
              onClick={() => setShowAlertsDropdown(!showAlertsDropdown)}
              className="relative p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <Bell className="w-6 h-6 text-gray-700" />
              {allAlerts.length > 0 && (
                <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {allAlerts.length}
                </span>
              )}
            </button>

            {/* Alerts Dropdown */}
            {showAlertsDropdown && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-800">Alerts</h3>
                </div>
                <div className="divide-y divide-gray-200">
                  {allAlerts.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">No alerts</div>
                  ) : (
                    allAlerts.map((alert, idx) => (
                      <div key={idx} className="p-4 hover:bg-gray-50">
                        <div className="flex items-start gap-2">
                          <AlertCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${alert.severity === 'alert' ? 'text-red-500' : 'text-yellow-500'}`} />
                          <p className="text-sm text-gray-700">{alert.message}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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
            disabled
            className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-300 text-gray-600 rounded-lg cursor-not-allowed font-semibold opacity-60"
          >
            <Package className="w-5 h-5" />
            New Purchase
          </button>
          <button
            onClick={() => console.log('Production click - will navigate to production form')}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-semibold"
          >
            <Package className="w-5 h-5" />
            New Production
          </button>
          <button
            disabled
            className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-300 text-gray-600 rounded-lg cursor-not-allowed font-semibold opacity-60"
          >
            <BarChart3 className="w-5 h-5" />
            Reports
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
              <p className="text-xs text-gray-500 mt-2">Total Sales: {salesSummary?.total_sales}</p>
              <p className="text-xs text-gray-500">Advance: {formatCurrency(salesSummary?.total_advance)}</p>
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
                pendingPayments.reduce((sum, p) => sum + (p.outstanding_debt || 0), 0)
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
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          order.status === 'ready' ? 'bg-green-100 text-green-800' :
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
            fetchDashboardData(); // Refresh data after sale
          }}
        />
      )}
    </div>
  );
}

export default Dashboard;
