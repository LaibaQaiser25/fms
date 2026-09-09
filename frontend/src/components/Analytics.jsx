import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package, Users, AlertTriangle, BarChart3 } from 'lucide-react';
import * as salesApi from '../api/salesApi';
import * as stockApi from '../api/stockApi';
import * as expenseApi from '../api/expenseApi';
import * as ledgerApi from '../api/ledgerApi';
import * as customersApi from '../api/customersApi';

function Analytics() {
  const [analytics, setAnalytics] = useState({
    salesData: null,
    stockData: null,
    expenseData: null,
    ledgerData: null,
    customerData: null,
  });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('today'); // today, week, month

  useEffect(() => {
    fetchAnalyticsData();
    const interval = setInterval(fetchAnalyticsData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [period]);

  const ensureArray = (data) => {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object' && Array.isArray(data.data)) return data.data;
    return [];
  };

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);

      // Fetch all analytics data in parallel
      const [sales, stock, expenses, ledger, customers] = await Promise.allSettled([
        salesApi.getAllSales(1, 100),
        stockApi.getAllStock(),
        expenseApi.expenseAPI.getAll({ limit: 100 }),
        ledgerApi.getAllLedger(1, 100),
        customersApi.getAllCustomers(1, 100),
      ]);

      // Process results with better error handling
      const processedSales = sales.status === 'fulfilled' ? ensureArray(sales.value.data) : [];
      const processedStock = stock.status === 'fulfilled' ? ensureArray(stock.value.data) : [];
      const processedExpenses = expenses.status === 'fulfilled' ? ensureArray(expenses.value.data) : [];
      const processedLedger = ledger.status === 'fulfilled' ? ensureArray(ledger.value.data) : [];
      const processedCustomers = customers.status === 'fulfilled' ? ensureArray(customers.value.data) : [];

      setAnalytics({
        salesData: processedSales,
        stockData: processedStock,
        expenseData: processedExpenses,
        ledgerData: processedLedger,
        customerData: processedCustomers,
      });
    } catch (error) {
      console.error('Error fetching analytics data:', error);
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

  const calculateMetrics = () => {
    const { salesData, stockData, expenseData, ledgerData, customerData } = analytics;

    // Sales Metrics
    const totalSalesRevenue = (salesData || []).reduce((sum, sale) => {
      const amount = parseFloat(sale.total_amount) || 0;
      return sum + amount;
    }, 0);

    const totalSales = (salesData || []).length;
    const avgSaleValue = totalSales > 0 ? totalSalesRevenue / totalSales : 0;

    // Stock Metrics
    const totalStockValue = (stockData || []).reduce((sum, item) => {
      const value = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
      return sum + value;
    }, 0);

    const totalStockItems = (stockData || []).reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
    const lowStockCount = (stockData || []).filter(item => (parseFloat(item.quantity) || 0) <= (parseFloat(item.minimum_stock) || 10)).length;

    // Expense Metrics
    const totalExpenses = (expenseData || []).reduce((sum, expense) => {
      const amount = parseFloat(expense.amount) || 0;
      return sum + amount;
    }, 0);

    // Ledger Metrics
    const totalOutstanding = (ledgerData || []).reduce((sum, entry) => {
      const debt = parseFloat(entry.outstanding_debt) || 0;
      return sum + debt;
    }, 0);

    // Customer Metrics
    const totalCustomers = (customerData || []).length;

    return {
      totalSalesRevenue,
      totalSales,
      avgSaleValue,
      totalStockValue,
      totalStockItems,
      lowStockCount,
      totalExpenses,
      totalOutstanding,
      totalCustomers,
      profit: totalSalesRevenue - totalExpenses,
    };
  };

  const metrics = calculateMetrics();

  const getTopProducts = () => {
    const { salesData } = analytics;
    // Group by product and calculate totals
    const productMap = {};
    (salesData || []).forEach(sale => {
      if (sale.product_name) {
        if (!productMap[sale.product_name]) {
          productMap[sale.product_name] = { name: sale.product_name, sales: 0, revenue: 0 };
        }
        productMap[sale.product_name].sales += 1;
        productMap[sale.product_name].revenue += parseFloat(sale.total_amount) || 0;
      }
    });

    return Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  };

  const getTopCustomers = () => {
    const { ledgerData } = analytics;
    return (ledgerData || [])
      .filter(item => item.outstanding_debt > 0)
      .sort((a, b) => (parseFloat(b.outstanding_debt) || 0) - (parseFloat(a.outstanding_debt) || 0))
      .slice(0, 5);
  };

  const AnalyticsCard = ({ title, value, icon: Icon, trend, subtext, color = 'blue' }) => {
    const colorClasses = {
      blue: 'border-[var(--color-text-accent)] text-[var(--color-text-accent)]',
      green: 'border-gray-700 text-gray-800',
      orange: 'border-orange-500 text-orange-600',
      red: 'border-red-500 text-red-600',
      purple: 'border-[var(--color-accent-hover)] text-[var(--color-accent-hover)]',
    };

    return (
      <div className={`bg-white rounded-lg shadow-md p-6 border-l-4 ${colorClasses[color]}`}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-gray-600 text-sm font-semibold mb-2">{title}</h3>
            <p className="text-3xl font-bold text-gray-800">{value}</p>
            {subtext && <p className="text-xs text-gray-500 mt-2">{subtext}</p>}
          </div>
          <Icon className="w-8 h-8 text-gray-400" />
        </div>
        {trend !== undefined && (
          <div className="flex items-center gap-1 mt-3 text-sm">
            {trend >= 0 ? (
              <TrendingUp className="w-4 h-4 text-gray-800" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-600" />
            )}
            <span className={trend >= 0 ? 'text-gray-800' : 'text-red-600'}>
              {Math.abs(trend)}% vs prev period
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      {/* <div className="px-8 py-6 bg-gradient-to-r from-red-600 to-red-800 text-white">
        <h1 className="text-3xl font-bold mb-2">Analytics Dashboard</h1>
        <p className="text-red-100">Real-time business analytics and performance metrics</p>
      </div> */}

      {/* Period Selector */}
      <div className="px-8 py-4 bg-white border-b border-gray-200 flex gap-4">
        <button
          onClick={() => setPeriod('today')}
          className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${period === 'today' ? 'bg-[var(--color-accent)] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          Today
        </button>
        <button
          onClick={() => setPeriod('week')}
          className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${period === 'week' ? 'bg-[var(--color-accent)] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          This Week
        </button>
        <button
          onClick={() => setPeriod('month')}
          className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${period === 'month' ? 'bg-[var(--color-accent)] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          This Month
        </button>
      </div>

      {/* Main Content */}
      <div className="px-8 py-6 flex-1">
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)]"></div>
            <p className="mt-2 text-gray-600">Loading analytics...</p>
          </div>
        ) : (
          <>
            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <AnalyticsCard
                title="Total Revenue"
                value={formatCurrency(metrics.totalSalesRevenue)}
                icon={DollarSign}
                color="green"
                subtext={`${metrics.totalSales} sales`}
              />
              <AnalyticsCard
                title="Avg Sale Value"
                value={formatCurrency(metrics.avgSaleValue)}
                icon={ShoppingCart}
                color="blue"
                subtext="Average per transaction"
              />
              <AnalyticsCard
                title="Total Expenses"
                value={formatCurrency(metrics.totalExpenses)}
                icon={TrendingDown}
                color="orange"
                subtext="All expenses"
              />
              <AnalyticsCard
                title="Profit"
                value={formatCurrency(metrics.profit)}
                icon={BarChart3}
                color={metrics.profit >= 0 ? 'green' : 'red'}
                subtext="Revenue - Expenses"
              />
            </div>

            {/* Inventory & Finance Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <AnalyticsCard
                title="Inventory Value"
                value={formatCurrency(metrics.totalStockValue)}
                icon={Package}
                color="purple"
                subtext={`${metrics.totalStockItems} items in stock`}
              />
              <AnalyticsCard
                title="Low Stock Items"
                value={metrics.lowStockCount}
                icon={AlertTriangle}
                color="red"
                subtext="Need restocking"
              />
              <AnalyticsCard
                title="Outstanding Debt"
                value={formatCurrency(metrics.totalOutstanding)}
                icon={DollarSign}
                color="red"
                subtext="From customers"
              />
              <AnalyticsCard
                title="Total Customers"
                value={metrics.totalCustomers}
                icon={Users}
                color="blue"
                subtext="Active customers"
              />
            </div>

            {/* Detailed Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Top Products */}
              {/* <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">Top Products</h2>
                {getTopProducts().length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200">
                        <tr>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Product</th>
                          <th className="text-right py-2 px-4 font-semibold text-gray-700">Sales</th>
                          <th className="text-right py-2 px-4 font-semibold text-gray-700">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getTopProducts().map((product, idx) => (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4 text-gray-700 font-semibold">{product.name}</td>
                            <td className="py-3 px-4 text-right text-gray-700">{product.sales}</td>
                            <td className="py-3 px-4 text-right text-gray-700 font-semibold">{formatCurrency(product.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No sales data available</p>
                )}
              </div> */}

              {/* Outstanding Debts */}
              {/* <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">Top Debtors</h2>
                {getTopCustomers().length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200">
                        <tr>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Customer</th>
                          <th className="text-right py-2 px-4 font-semibold text-gray-700">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getTopCustomers().map((customer, idx) => (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4 text-gray-700 font-semibold">{customer.customer_name || 'Unknown'}</td>
                            <td className="py-3 px-4 text-right text-red-600 font-semibold">{formatCurrency(customer.outstanding_debt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No outstanding debts</p>
                )}
              </div> */}
            </div>

            {/* Performance Summary */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Performance Summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="border-l-4 border-[var(--color-accent)] pl-4">
                  <p className="text-sm text-gray-600 font-semibold mb-2">Profit Margin</p>
                  <p className="text-2xl font-bold text-[var(--color-accent)]">
                    {metrics.totalSalesRevenue > 0 ? ((metrics.profit / metrics.totalSalesRevenue) * 100).toFixed(2) : 0}%
                  </p>
                </div>
                <div className="border-l-4 border-[var(--color-accent)] pl-4">
                  <p className="text-sm text-gray-600 font-semibold mb-2">Revenue per Customer</p>
                  <p className="text-2xl font-bold text-[var(--color-accent)]">
                    {formatCurrency(metrics.totalCustomers > 0 ? metrics.totalSalesRevenue / metrics.totalCustomers : 0)}
                  </p>
                </div>
                <div className="border-l-4 border-orange-500 pl-4">
                  <p className="text-sm text-gray-600 font-semibold mb-2">Expense Ratio</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {metrics.totalSalesRevenue > 0 ? ((metrics.totalExpenses / metrics.totalSalesRevenue) * 100).toFixed(2) : 0}%
                  </p>
                </div>
              </div>
            </div>

            {/* Last Updated */}
            <div className="text-center text-xs text-gray-500 mt-6">
              Last updated: {new Date().toLocaleTimeString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Analytics;
