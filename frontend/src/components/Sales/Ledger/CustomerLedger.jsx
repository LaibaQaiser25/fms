import React, { useState, useEffect } from 'react';
import { FileText, History, Trash2 } from 'lucide-react';
import * as ledgerApi from '../../../api/ledgerApi';
import * as invoiceApi from '../../../api/invoiceApi';
import InvoiceModal from '../Invoices/InvoiceModal';
import LedgerHistoryModal from './LedgerHistoryModal';

function CustomerLedger() {
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(10);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [showLedgerHistory, setShowLedgerHistory] = useState(false);

  useEffect(() => {
    fetchLedger();
  }, [page]);

  const fetchLedger = async () => {
    try {
      setLoading(true);
      const response = await ledgerApi.getAllLedger(page, limit);
      setLedger(response.data.data || []);
      setTotal(response.data.pagination?.total || 0);
    } catch (error) {
      console.error('Error fetching ledger:', error);
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

  const totalPages = Math.ceil(total / limit);

  const handleShowRecord = (customerId) => {
    setSelectedCustomerId(customerId);
    setShowLedgerHistory(true);
  };

  const handleShowInvoices = async (customerId) => {
    // This should show a list of invoices, we'll implement a simpler version
    setSelectedCustomerId(customerId);
    // Get recent invoice for this customer
    try {
      const response = await invoiceApi.getCustomerInvoices(customerId);
      if (response.data.data && response.data.data.length > 0) {
        setSelectedInvoiceId(response.data.data[0].id);
        setShowInvoiceModal(true);
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-8 py-6">
        <h1 className="text-3xl font-bold text-gray-800">Customer Ledger</h1>
        <p className="text-gray-600 mt-2">Track all customer transactions, payments, and outstanding debts</p>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading ledger...</p>
          </div>
        ) : ledger.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-600">No customer transactions yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-6 text-left font-semibold text-gray-700">#</th>
                    <th className="py-3 px-6 text-left font-semibold text-gray-700">Customer Name</th>
                    <th className="py-3 px-6 text-right font-semibold text-gray-700">Debit (pkr)</th>
                    <th className="py-3 px-6 text-right font-semibold text-gray-700">Credit (pkr)</th>
                    <th className="py-3 px-6 text-right font-semibold text-gray-700">Debt (pkr)</th>
                    <th className="py-3 px-6 text-center font-semibold text-gray-700">RECORD</th>
                    <th className="py-3 px-6 text-center font-semibold text-gray-700">INVOICES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {ledger.map((entry, idx) => (
                    <tr key={entry.id} className="hover:bg-gray-50 transition">
                      <td className="py-4 px-6 text-gray-700 font-semibold">{(page - 1) * limit + idx + 1}</td>
                      <td className="py-4 px-6">
                        <p className="font-semibold text-gray-800">{entry.customer_name}</p>
                        <p className="text-xs text-gray-600">{entry.phone || 'N/A'}</p>
                      </td>
                      <td className="py-4 px-6 text-right text-gray-700 font-semibold">
                        {formatCurrency(entry.total_debit || 0)}
                      </td>
                      <td className="py-4 px-6 text-right text-gray-700 font-semibold">
                        {formatCurrency(entry.total_credit || 0)}
                      </td>
                      <td className={`py-4 px-6 text-right font-bold ${
                        entry.debt > 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {formatCurrency(entry.debt || 0)}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <button
                          onClick={() => handleShowRecord(entry.id)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition font-semibold text-sm"
                        >
                          <History className="w-4 h-4" />
                          RECORD
                        </button>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <button
                          onClick={() => handleShowInvoices(entry.id)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition font-semibold text-sm"
                        >
                          <FileText className="w-4 h-4" />
                          INVOICES
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} customers
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 text-gray-700 font-semibold">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showInvoiceModal && selectedInvoiceId && (
        <InvoiceModal
          invoiceId={selectedInvoiceId}
          onClose={() => setShowInvoiceModal(false)}
        />
      )}

      {showLedgerHistory && selectedCustomerId && (
        <LedgerHistoryModal
          customerId={selectedCustomerId}
          onClose={() => setShowLedgerHistory(false)}
        />
      )}
    </div>
  );
}

export default CustomerLedger;
