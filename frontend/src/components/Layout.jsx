import Sidebar from './Sidebar';
import DashboardHeader from './DashboardHeader';
import { Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import * as salesApi from '../api/salesApi';

export default function Layout() {
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const response = await salesApi.getDashboardData();
      const { lowStockAlerts, pendingPayments } = response.data.data;
      setLowStockAlerts(lowStockAlerts || []);
      setPendingPayments(pendingPayments || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
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
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <DashboardHeader
        allAlerts={allAlerts}
        showAlertsDropdown={showAlertsDropdown}
        setShowAlertsDropdown={setShowAlertsDropdown}
      />
      <main className="ml-56 flex-1 p-6 min-h-screen" style={{ paddingTop: '76px' }}>
        <Outlet />
      </main>
    </div>
  );
}