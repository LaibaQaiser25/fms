import React, { useState, useEffect } from 'react';
import { FileText, History, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import * as purchaseLedgerApi from '../../../api/purchaseLedgerApi';
import * as purchaseInvoiceApi from '../../../api/purchaseInvoiceApi';
import PurchaseInvoiceModal from '../PInvoices/PInvoiceModal';
import PurchaseLedgerHistoryModal from './PurchaseLedgerHistoryModal';

function PurchaseLedger() {
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(10);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedSellerId, setSelectedSellerId] = useState(null);
  const [showLedgerHistory, setShowLedgerHistory] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('desc');

  // Debounce the search input before it drives a fetch
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    fetchLedger();
  }, [page, search, sortBy, sortOrder]);

  // Deep link from the header alerts dropdown, e.g. /purchase-ledger?sellerId=123
  useEffect(() => {
    const sellerId = searchParams.get('sellerId');
    if (sellerId) {
      setSelectedSellerId(Number(sellerId));
      setShowLedgerHistory(true);
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('sellerId');
        return next;
      }, { replace: true });
    }
  }, []);

  const fetchLedger = async () => {
    try {
      setLoading(true);
      const response = await purchaseLedgerApi.getAllPurchaseLedger(page, limit, search, sortBy, sortOrder);
      setLedger(response.data.data || []);
      setTotal(response.data.pagination?.total || 0);
    } catch (error) {
      console.error('Error fetching purchase ledger:', error);
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

  const sortOptions = [
    { value: 'id-desc', label: 'Newest First' },
    { value: 'id-asc', label: 'Oldest First' },
    { value: 'name-asc', label: 'Seller Name (A-Z)' },
    { value: 'name-desc', label: 'Seller Name (Z-A)' },
    { value: 'debit-desc', label: 'Debit (High to Low)' },
    { value: 'debit-asc', label: 'Debit (Low to High)' },
    { value: 'credit-desc', label: 'Credit (High to Low)' },
    { value: 'credit-asc', label: 'Credit (Low to High)' },
    { value: 'debt-desc', label: 'Debt (High to Low)' },
    { value: 'debt-asc', label: 'Debt (Low to High)' },
  ];

  const handleSortChange = (value) => {
    const [field, order] = value.split('-');
    setSortBy(field);
    setSortOrder(order);
    setPage(1);
  };

  const handleShowRecord = (sellerId) => {
    setSelectedSellerId(sellerId);
    setShowLedgerHistory(true);
  };

  const handleShowInvoices = async (sellerId) => {
    setSelectedSellerId(sellerId);
    try {
      const response = await purchaseInvoiceApi.getSellerInvoices(sellerId);
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
        <h1 className="text-3xl font-bold text-gray-800">Purchase Ledger</h1>
        <p className="text-gray-600 mt-2">Track all seller transactions, payments, and outstanding payables</p>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        <div className="mb-4 flex flex-col sm:flex-row gap-3">
          <div className="relative max-w-sm w-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by seller name or phone..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-text-accent)]"
            />
          </div>
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => handleSortChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-text-accent)] sm:w-64"
          >
            {sortOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)]"></div>
            <p className="mt-2 text-gray-600">Loading ledger...</p>
          </div>
        ) : ledger.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-600">
              {search ? `No sellers found matching "${search}"` : 'No seller transactions yet'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-6 text-left font-semibold text-gray-700">#</th>
                    <th className="py-3 px-6 text-left font-semibold text-gray-700">Seller Name</th>
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
                        <p className="font-semibold text-gray-800">{entry.seller_name}</p>
                        <p className="text-xs text-gray-600">{entry.phone || 'N/A'}</p>
                      </td>
                      <td className="py-4 px-6 text-right text-gray-700 font-semibold">
                        {formatCurrency(entry.total_debit || 0)}
                      </td>
                      <td className="py-4 px-6 text-right text-gray-700 font-semibold">
                        {formatCurrency(entry.total_credit || 0)}
                      </td>
                      <td className={`py-4 px-6 text-right font-bold ${
                        entry.debt > 0 ? 'text-red-600' : 'text-gray-800'
                      }`}>
                        {formatCurrency(entry.debt || 0)}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <button
                          onClick={() => handleShowRecord(entry.id)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--color-accent-soft)] text-[var(--color-accent)] rounded hover:bg-[var(--color-accent-soft-hover)] transition font-semibold text-sm"
                        >
                          <History className="w-4 h-4" />
                          RECORD
                        </button>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <button
                          onClick={() => handleShowInvoices(entry.id)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--color-accent-soft)] text-[var(--color-accent)] rounded hover:bg-[var(--color-accent-soft-hover)] transition font-semibold text-sm"
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
                  Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} sellers
                </p>
                <div className="flex gap-2">
                  <button
                    data-guest-allow="true"
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
                    data-guest-allow="true"
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
        <PurchaseInvoiceModal
          invoiceId={selectedInvoiceId}
          onClose={() => setShowInvoiceModal(false)}
        />
      )}

      {showLedgerHistory && selectedSellerId && (
        <PurchaseLedgerHistoryModal
          sellerId={selectedSellerId}
          onClose={() => setShowLedgerHistory(false)}
        />
      )}
    </div>
  );
}

export default PurchaseLedger;
