import React, { useState, useEffect, useContext } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import * as customersApi from '../../api/customersApi';
import * as ledgerApi from '../../api/ledgerApi';
import * as invoiceApi from '../../api/invoiceApi';
import * as productionApi from '../../api/productionApi';
import AddProductionDirect from '../AddProductionDirect';
import { AlertRefreshContext } from '../Layout';
import { PAYMENT_METHODS, PAKISTANI_BANKS } from '../../paymentOptions';

function AddPaymentModal({ onClose }) {
  const alertRefresh = useContext(AlertRefreshContext);
  const [showProductionModal, setShowProductionModal] = useState(false);
  // Customer Search
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Customer Ledger Data
  const [ledgerHistory, setLedgerHistory] = useState([]);
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [outstandingDebt, setOutstandingDebt] = useState(0);

  // Payment Form
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentType, setPaymentType] = useState('Cash');
  const [bankName, setBankName] = useState('');
  const [loading, setLoading] = useState(false);

  // Customer search and selection
  const handleCustomerSearch = async (value) => {
    setCustomerSearch(value);
    setSelectedCustomer(null);
    setLedgerHistory([]);
    setTotalDebit(0);
    setTotalCredit(0);
    setOutstandingDebt(0);

    if (value.length > 0) {
      try {
        const response = await customersApi.searchCustomers(value, 10);
        setCustomers(response.data.data || []);
        setShowCustomerDropdown(true);
      } catch (error) {
        console.error('Error searching customers:', error);
      }
    } else {
      setShowCustomerDropdown(false);
    }
  };

  const selectCustomer = async (customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
    setPaymentAmount('');
    setPaymentNote('');
    setPaymentType('Cash');
    setBankName('');

    // Fetch customer's ledger
    try {
      const response = await ledgerApi.getCustomerLedger(customer.id);
      
      // Handle the nested data structure from backend
      const history = response.data.data.history || [];
      const summary = response.data.data.summary || {};

      setLedgerHistory(history);

      // Extract summary values
      setTotalDebit(Number(summary.total_debit) || 0);
      setTotalCredit(Number(summary.total_credit) || 0);
      setOutstandingDebt(Number(summary.total_debt) || 0);
      
    } catch (error) {
      console.error('Error fetching ledger:', error);
      alert("Failed to load customer ledger data.");
    }
  };

  const handleSubmit = async () => {
    if (!selectedCustomer) {
      return alert('⚠️ Please select a customer');
    }

    const amount = Number(paymentAmount) || 0;
    if (amount <= 0) {
      return alert('⚠️ Please enter a valid payment amount');
    }

    // Validation to prevent overpayment
    if (amount > outstandingDebt) {
      return alert(`⚠️ Payment amount exceeds outstanding debt of PKR${outstandingDebt.toFixed(0)}`);
    }

    if (paymentType === 'Bank Transfer' && !bankName) {
      return alert('⚠️ Please select a bank');
    }

    setLoading(true);
    try {
      await invoiceApi.recordPayment({
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.name,
        payment_amount: amount,
        payment_type: paymentType,
        bank_name: paymentType === 'Bank Transfer' ? bankName : null,
        note: paymentNote || 'Payment received'
      });

      // Update outstanding debt immediately
      const newOutstandingDebt = outstandingDebt - amount;
      setOutstandingDebt(newOutstandingDebt);
      setTotalCredit(totalCredit + amount);

      // Refresh alerts in header
      alertRefresh?.fetchAlerts();

      alert('✅ Payment recorded successfully!');
      
      // Ask if user wants to add production order
      const addProduction = window.confirm('Would you like to create a production order?');
      if (addProduction) {
        setShowProductionModal(true);
        setPaymentAmount('');
        setPaymentNote('');
      } else {
        onClose();
      }
    } catch (err) {
      console.error('❌ Error:', err.response?.data || err.message);
      alert('❌ Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-accent)]";
  const inpReadOnly = "w-full border border-gray-300 rounded px-3 py-2 text-sm bg-gray-100 text-gray-700 cursor-not-allowed";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex z-50 overflow-y-auto p-4">
      <div className="bg-white w-full h-fit max-h-screen flex flex-col mx-auto my-auto rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white z-10">
          <h2 className="text-2xl font-extrabold text-gray-800">Add Payment</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {/* Customer Search Section */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h3 className="font-bold mb-3 text-sm text-gray-600 uppercase tracking-wider">Select Customer</h3>
            <div className="relative">
              <input
                type="text"
                className={inp}
                placeholder="Search customer *"
                value={customerSearch}
                onChange={(e) => handleCustomerSearch(e.target.value)}
              />
              {showCustomerDropdown && customers.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 max-h-96 overflow-y-auto">
                  {customers.map(customer => (
                    <div
                      key={customer.id}
                      onClick={() => selectCustomer(customer)}
                      className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                    >
                      <div className="font-semibold text-sm text-gray-800">{customer.name}</div>
                      <div className="text-xs text-gray-500">{customer.phone || 'No phone'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Selected Customer Info */}
          {selectedCustomer && (
            <div className="bg-[var(--color-accent-soft)] rounded-lg p-4 border border-[var(--color-accent-soft-hover)]">
              <h3 className="font-bold mb-2 text-sm text-gray-600 uppercase tracking-wider">Selected Customer</h3>
              <p className="text-lg font-bold text-[var(--color-accent-hover)]">{selectedCustomer.name}</p>
              {selectedCustomer.phone && <p className="text-sm text-gray-600">Phone: {selectedCustomer.phone}</p>}
            </div>
          )}

          {/* Outstanding Debt Display */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-xs text-gray-600 font-semibold mb-1">Total Owed</p>
              <p className="text-xl font-bold text-gray-800">PKR{selectedCustomer ? totalDebit.toLocaleString() : '0'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-xs text-gray-600 font-semibold mb-1">Total Paid</p>
              <p className="text-xl font-bold text-gray-800">PKR{selectedCustomer ? totalCredit.toLocaleString() : '0'}</p>
            </div>
            <div className={`rounded-lg p-4 border-2 ${selectedCustomer && outstandingDebt > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
              <p className="text-xs text-gray-600 font-semibold mb-1">Remaining Debt</p>
              <p className={`text-xl font-bold ${selectedCustomer && outstandingDebt > 0 ? 'text-red-600' : 'text-gray-800'}`}>
                PKR{selectedCustomer ? outstandingDebt.toLocaleString() : '0'}
              </p>
            </div>
          </div>

          {/* Payment Form */}
          <div className="bg-[var(--color-accent-soft)] rounded-lg p-4 border border-[var(--color-accent-soft-hover)]">
            <h3 className="font-bold mb-3 text-sm text-gray-600 uppercase tracking-wider">Record New Payment</h3>
            {selectedCustomer && outstandingDebt > 0 ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Amount to Pay *</label>
                  <input
                    type="number"
                    placeholder="Enter amount"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    onWheel={(e) => e.target.blur()}
                    className={inp}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Payment Method</label>
                  <select
                    value={paymentType}
                    onChange={(e) => { setPaymentType(e.target.value); setBankName(''); }}
                    className={inp}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                {paymentType === 'Bank Transfer' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Bank *</label>
                    <select
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className={inp}
                    >
                      <option value="">-- Select Bank --</option>
                      {PAKISTANI_BANKS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Note</label>
                  <textarea
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    placeholder="e.g., Cash payment, Bank transfer..."
                    className={`${inp} resize-none`}
                    rows="2"
                  />
                </div>
              </div>
            ) : selectedCustomer && outstandingDebt === 0 ? (
              <div className="flex items-center gap-3 p-3 bg-white rounded border border-red-200">
                <CheckCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm font-semibold text-red-700">Account is fully cleared!</p>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-white rounded border border-gray-200">
                <AlertCircle className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <p className="text-sm font-semibold text-gray-600">Select a customer to proceed</p>
              </div>
            )}
          </div>

          {/* Ledger History Table */}
          {selectedCustomer && ledgerHistory.length > 0 && (
            <div>
              <h3 className="font-bold mb-2 text-xs text-gray-500 uppercase">Recent History</h3>
              <div className="border border-gray-200 rounded overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-100 border-b border-gray-200 text-gray-600">
                    <tr>
                      <th className="p-2">Date</th>
                      <th className="p-2 text-right">Debit</th>
                      <th className="p-2 text-right">Credit</th>
                      <th className="p-2">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerHistory.map((entry, idx) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="p-2 text-gray-500">{new Date(entry.created_at).toLocaleDateString()}</td>
                        <td className="p-2 text-right text-red-500 font-medium">{entry.debit > 0 ? entry.debit : '-'}</td>
                        <td className="p-2 text-right text-red-600 font-medium">{entry.credit > 0 ? entry.credit : '-'}</td>
                        <td className="p-2 text-gray-400 truncate max-w-[100px]">{entry.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        {selectedCustomer && outstandingDebt > 0 && (
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={handleSubmit}
              disabled={loading || !paymentAmount}
              className="w-full bg-[var(--color-accent)] text-white py-3 rounded-lg font-bold text-sm hover:bg-[var(--color-accent-hover)] transition disabled:bg-gray-300"
            >
              {loading ? 'Processing...' : 'Confirm Payment'}
            </button>
          </div>
        )}
      </div>

      {/* Production Modal */}
      {showProductionModal && (
        <AddProductionDirect
          onClose={() => {
            setShowProductionModal(false);
            onClose();
          }}
          onSuccess={() => {
            setShowProductionModal(false);
            onClose();
            alertRefresh?.fetchAlerts?.();
          }}
        />
      )}
    </div>
  );
}

export default AddPaymentModal;