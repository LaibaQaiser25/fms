import React, { useState, useEffect } from 'react';
import { X, Pencil, Trash2, Check } from 'lucide-react';
import * as ledgerApi from '../../../api/ledgerApi';

// Entries of these types are written by the sale/payment flow and stay in
// sync with invoices/sales balances elsewhere — the backend refuses to
// edit/delete them through this manual endpoint, so hide the controls too.
const PROTECTED_TYPES = ['sale', 'payment'];

function LedgerHistoryModal({ customerId, onClose }) {
  const [ledgerData, setLedgerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ debit: 0, credit: 0, note: '' });
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    fetchLedgerHistory();
  }, [customerId]);

  const fetchLedgerHistory = async () => {
    try {
      setLoading(true);
      const response = await ledgerApi.getCustomerLedgerHistory(customerId);
      setLedgerData(response.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error loading ledger');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (entry) => {
    setActionError('');
    setEditingId(entry.id);
    setEditForm({ debit: entry.debit || 0, credit: entry.credit || 0, note: entry.note || '' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setActionError('');
  };

  const saveEdit = async (id) => {
    try {
      setActionError('');
      await ledgerApi.updateLedgerEntry(id, {
        debit: Number(editForm.debit) || 0,
        credit: Number(editForm.credit) || 0,
        note: editForm.note
      });
      setEditingId(null);
      fetchLedgerHistory();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Error updating entry');
      console.error('Error:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this ledger entry? This cannot be undone.')) return;
    try {
      setActionError('');
      await ledgerApi.deleteLedgerEntry(id);
      fetchLedgerHistory();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Error deleting entry');
      console.error('Error:', err);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR'
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
          <p className="mt-2 text-gray-600">Loading ledger history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md">
          <p className="text-red-600 font-semibold">{error}</p>
          <button
            onClick={onClose}
            className="mt-4 w-full py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!ledgerData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md">
          <p className="text-gray-600">No ledger data found</p>
          <button
            onClick={onClose}
            className="mt-4 w-full py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const { customer, history, summary } = ledgerData;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Ledger History</h2>
            <p className="text-sm text-gray-600">{customer?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 p-6 bg-gray-50 border-b border-gray-200">
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <p className="text-xs text-gray-600 font-semibold">Total Debit</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary?.total_debit)}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <p className="text-xs text-gray-600 font-semibold">Total Credit</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary?.total_credit)}</p>
          </div>
          <div className={`bg-white p-4 rounded-lg shadow-sm `}>
            <p className="text-xs text-gray-600 font-semibold">Outstanding Debt</p>
            <p className={`text-2xl font-bold ${summary?.total_debt > 0 ? 'text-red-600' : 'text-red-600'}`}>
              {formatCurrency(summary?.total_debt)}
            </p>
          </div>
        </div>

        {/* Ledger Transactions */}
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Transaction History</h3>

          {actionError && (
            <p className="mb-3 text-sm text-red-600 font-semibold">{actionError}</p>
          )}

          {history && history.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Invoice</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Type</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Debit (pkr)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Credit (pkr)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Debt (pkr)</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Notes</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {history.map((entry) => {
                    const isProtected = PROTECTED_TYPES.includes(entry.transaction_type);
                    const isEditing = editingId === entry.id;
                    return (
                      <tr key={entry.id} className="hover:bg-gray-50 transition">
                        <td className="py-3 px-4 text-sm text-gray-700">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-sm font-semibold text-gray-800">
                          {entry.invoice_no || '-'}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            entry.transaction_type === 'sale'
                              ? 'bg-red-100 text-red-800'
                              : entry.transaction_type === 'payment'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {entry.transaction_type?.charAt(0).toUpperCase() + entry.transaction_type?.slice(1)}
                          </span>
                        </td>
                        {isEditing ? (
                          <>
                            <td className="py-2 px-4 text-right">
                              <input
                                type="number"
                                min="0"
                                value={editForm.debit}
                                onChange={(e) => setEditForm({ ...editForm, debit: e.target.value })}
                                className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm"
                              />
                            </td>
                            <td className="py-2 px-4 text-right">
                              <input
                                type="number"
                                min="0"
                                value={editForm.credit}
                                onChange={(e) => setEditForm({ ...editForm, credit: e.target.value })}
                                className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm"
                              />
                            </td>
                            <td className="py-3 px-4 text-right text-gray-400 text-sm">—</td>
                            <td className="py-2 px-4">
                              <input
                                type="text"
                                value={editForm.note}
                                onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => saveEdit(entry.id)}
                                  className="p-1 text-red-700 hover:bg-red-100 rounded"
                                  title="Save"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="p-1 text-gray-600 hover:bg-gray-200 rounded"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-3 px-4 text-right text-gray-700 font-semibold">
                              {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-700 font-semibold">
                              {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                            </td>
                            <td className={`py-3 px-4 text-right font-bold ${
                              entry.running_balance > 0 ? 'text-red-600' : 'text-red-600'
                            }`}>
                              {formatCurrency(entry.running_balance || 0)}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600">
                              {entry.note || '-'}
                            </td>
                            <td className="py-3 px-4">
                              {isProtected ? (
                                <p className="text-center text-xs text-gray-400">Locked</p>
                              ) : (
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => startEdit(entry)}
                                    className="p-1 text-red-700 hover:bg-red-100 rounded"
                                    title="Edit entry"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(entry.id)}
                                    className="p-1 text-red-700 hover:bg-red-100 rounded"
                                    title="Delete entry"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-gray-500 py-8">No transactions found</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default LedgerHistoryModal;
