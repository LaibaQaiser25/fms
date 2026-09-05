import Sidebar from './Sidebar';
import DashboardHeader from './DashboardHeader';
import { Outlet } from 'react-router-dom';
import { useState, useEffect, createContext } from 'react';
import * as salesApi from '../api/salesApi';
import * as purchaseApi from '../api/purchaseApi';
import * as rawMaterialsApi from '../api/rawMaterialsApi';

export const AlertRefreshContext = createContext();

export default function Layout() {
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('sidebarCollapsed');
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sidebarCollapsed', String(next));
      } catch {
        // ignore — persistence is a convenience, not a requirement
      }
      return next;
    });
  };
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);       // owed TO us (customers)
  const [payablePayments, setPayablePayments] = useState([]);       // owed BY us (sellers)
  const [lowStockRawMaterials, setLowStockRawMaterials] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [searchSQL, setSearchSQL] = useState('');

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const [salesResponse, purchaseResponse, rawMaterialsResponse] = await Promise.all([
        salesApi.getDashboardData(),
        purchaseApi.getDashboardData(),
        rawMaterialsApi.getLowStockRawMaterials()
      ]);

      const { lowStockAlerts, pendingPayments } = salesResponse.data.data;
      const { pendingPayments: payablePayments } = purchaseResponse.data.data;

      setLowStockAlerts(lowStockAlerts || []);
      setPendingPayments(pendingPayments || []);
      setPayablePayments(payablePayments || []);
      setLowStockRawMaterials(rawMaterialsResponse.data.data || []);
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
      severity: 'warning',
      link: '/stock'
    })),
    ...pendingPayments.slice(0, 5).map(payment => ({
      type: 'payment',
      message: `${payment.customer_name} - Outstanding Debt: ${formatCurrency(payment.outstanding_debt)}`,
      severity: 'alert',
      link: `/ledger?customerId=${payment.customer_id}`
    })),
    ...payablePayments.slice(0, 5).map(payment => ({
      type: 'payable',
      message: `Owed to ${payment.seller_name} - ${formatCurrency(payment.outstanding_debt)}`,
      severity: 'alert',
      link: `/purchase-ledger?sellerId=${payment.seller_id}`
    })),
    ...lowStockRawMaterials.map(material => ({
      type: 'raw-material',
      message: `${material.name} - Low raw material (${material.quantity}${material.unit || ''})`,
      severity: 'warning',
      link: '/raw-materials'
    }))
  ];

  return (
    <AlertRefreshContext.Provider value={{ fetchAlerts, pendingPayments, lowStockAlerts, payablePayments, lowStockRawMaterials }}>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapsed}
        />
        <DashboardHeader
          allAlerts={allAlerts}
          showAlertsDropdown={showAlertsDropdown}
          setShowAlertsDropdown={setShowAlertsDropdown}
          setSearchResults={setSearchResults}
          setSearchSQL={setSearchSQL}
          refreshTrigger={{ pendingPayments, lowStockAlerts, payablePayments, lowStockRawMaterials }}
        />
        <main
          className={`flex-1 p-6 min-h-screen transition-[margin] duration-300 ease-in-out ${sidebarCollapsed ? 'ml-20' : 'ml-56'}`}
          style={{ paddingTop: '101px' }}
        >
          {searchResults && (
            <div className="mb-6 bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-semibold text-gray-700">Search Results</h2>
                <button
                  onClick={() => { setSearchResults(null); setSearchSQL(''); }}
                  className="text-sm text-red-400 hover:text-red-600"
                >
                  ✕ Clear
                </button>
              </div>
              {searchSQL && (
                <code className="block text-xs text-gray-400 mb-3 bg-gray-50 p-2 rounded">
                  {searchSQL}
                </code>
              )}
              {searchResults.length === 0 ? (
                <p className="text-gray-400 text-sm">No results found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                      <tr>
                        {Object.keys(searchResults[0]).map(k => (
                          <th key={k} className="px-4 py-2">{k.replace(/_/g, ' ')}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map((row, i) => (
                        <tr key={i} className="border-t hover:bg-gray-50">
                          {Object.values(row).map((v, j) => (
                            <td key={j} className="px-4 py-2">{v ?? '-'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          <Outlet context={{ refreshTrigger: { pendingPayments, lowStockAlerts, payablePayments, lowStockRawMaterials } }} />
        </main>
      </div>
    </AlertRefreshContext.Provider>
  );
}
