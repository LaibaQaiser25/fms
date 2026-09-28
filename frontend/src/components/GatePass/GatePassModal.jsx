import React, { useState, useEffect, useRef, useContext } from 'react';
import { X, Search, Printer, ArrowLeft, Truck } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import * as gatePassApi from '../../api/gatePassApi';
import * as salesApi from '../../api/salesApi';
import * as purchaseApi from '../../api/purchaseApi';
import { AlertRefreshContext } from '../Layout';

// kind 'order'    -> outward pass for a sale with status 'ready' (marks it delivered)
// kind 'received' -> inward pass for goods from a purchase
const COPY = {
  order: {
    title: 'Gate Pass — Order',
    passTitle: 'OUTWARD GATE PASS',
    partyLabel: 'Customer',
    searchPlaceholder: 'Search ready sales by customer name or phone',
    empty: 'No ready sales without a gate pass match this search.',
  },
  received: {
    title: 'Gate Pass — Received Goods',
    passTitle: 'INWARD GATE PASS',
    partyLabel: 'Seller',
    searchPlaceholder: 'Search purchases by seller name or phone',
    empty: 'No purchases without a gate pass match this search.',
  },
};

function GatePassModal({ kind, onClose }) {
  const alertRefresh = useContext(AlertRefreshContext);
  const copy = COPY[kind];

  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [selected, setSelected] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [vehicleNo, setVehicleNo] = useState('');
  const [driverName, setDriverName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [pass, setPass] = useState(null); // { gatePass, reference, items }
  const printRef = useRef(null);
  const handlePrint = useReactToPrint({ contentRef: printRef, documentTitle: pass?.gatePass.gate_pass_no });

  // Debounced search; an empty query lists the most recent eligible records
  useEffect(() => {
    if (selected || pass) return;
    let stale = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await gatePassApi.searchEligible(kind, search);
        if (!stale) setResults(response.data.data || []);
      } catch (err) {
        console.error('Error searching gate pass records:', err);
      } finally {
        if (!stale) setSearching(false);
      }
    }, 250);
    return () => { stale = true; clearTimeout(t); };
  }, [kind, search, selected, pass]);

  const selectRecord = async (record) => {
    setSelected(record);
    setSelectedItems([]);
    try {
      const response = kind === 'order'
        ? await salesApi.getSale(record.id)
        : await purchaseApi.getPurchase(record.id);
      setSelectedItems(response.data.data.items || []);
    } catch (err) {
      console.error('Error loading items:', err);
    }
  };

  const handleGenerate = async () => {
    setSaving(true);
    try {
      const created = await gatePassApi.createGatePass({
        kind,
        ref_id: selected.id,
        vehicle_no: vehicleNo.trim(),
        driver_name: driverName.trim(),
        notes: notes.trim(),
      });
      const response = await gatePassApi.getGatePass(created.data.data.id);
      setPass(response.data.data);
      // Sale status changed to delivered — refresh the dashboard's recent orders
      alertRefresh?.fetchAlerts?.();
    } catch (err) {
      console.error('❌ Error:', err.response?.data || err.message);
      alert('❌ Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(amount || 0);

  const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-accent)]";

  return (
    <div className="fixed inset-0 bg-white/10 backdrop-blur-sm flex z-50 overflow-y-auto p-4">
      <div className="bg-white w-full max-w-2xl h-fit max-h-[90vh] flex flex-col mx-auto my-auto rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            {selected && !pass && (
              <button onClick={() => setSelected(null)} title="Back to search" className="p-1 hover:bg-gray-100 rounded">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
            )}
            <h2 className="text-xl sm:text-2xl font-extrabold text-gray-800">{copy.title}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 flex-1 overflow-y-auto">
          {/* Step 1: search & select */}
          {!selected && !pass && (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  type="text"
                  className={`${inp} pl-9`}
                  placeholder={copy.searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {searching && results.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">Searching…</p>
                ) : results.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">{copy.empty}</p>
                ) : (
                  results.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => selectRecord(r)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-800 truncate">{r.party_name}</p>
                        <p className="text-xs text-gray-500">{r.phone || 'No phone'} · {r.ref_no}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-gray-800">{formatCurrency(r.total_amount)}</p>
                        <p className="text-xs text-gray-500">{new Date(r.created_at).toLocaleDateString()}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {/* Step 2: vehicle details & confirm */}
          {selected && !pass && (
            <>
              <div className="bg-[var(--color-selected-soft)] rounded-lg p-4 border border-[var(--color-selected-soft-hover)]">
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">{copy.partyLabel}</p>
                <p className="text-lg font-bold text-[var(--color-selected-hover)]">{selected.party_name}</p>
                <p className="text-sm text-gray-600">{selected.phone || 'No phone'} · {selected.ref_no}</p>
              </div>

              <div>
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Items</p>
                <table className="w-full text-sm border border-gray-200 rounded">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">Item</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.map((item, idx) => (
                      <tr key={idx} className="border-t border-gray-100">
                        <td className="py-2 px-3 text-gray-800">{item.product_name || item.description}</td>
                        <td className="py-2 px-3 text-right text-gray-800">{item.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className={inp} placeholder="Vehicle no. (optional)" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
                <input className={inp} placeholder="Driver name (optional)" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
                <textarea className={`${inp} sm:col-span-2`} rows={2} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {kind === 'order' && (
                <p className="text-xs text-gray-500">Generating this gate pass marks the sale as <b>delivered</b>.</p>
              )}
            </>
          )}

          {/* Step 3: printable gate pass */}
          {pass && (
            <div ref={printRef} className="p-2 sm:p-4 print:p-8 text-gray-900">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 mb-4 border-b-2 border-gray-900">
                <div>
                  <h1 className="text-2xl font-bold">{copy.passTitle}</h1>
                  <p className="text-sm font-semibold mt-1">{pass.gatePass.gate_pass_no}</p>
                </div>
                <div className="sm:text-right">
                  <p className="font-bold">Bin-Zahid & Partners</p>
                  <p className="text-sm text-gray-700">Sugar Mill Road, Near Kuthiala Sayedan, Mandi Bahauddin</p>
                  <p className="text-sm text-gray-700">Tel: +92 345 7579505</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm mb-5">
                <p><span className="font-semibold">{copy.partyLabel}:</span> {pass.gatePass.party_name}</p>
                <p><span className="font-semibold">Date:</span> {new Date(pass.gatePass.created_at).toLocaleString()}</p>
                <p><span className="font-semibold">Phone:</span> {pass.gatePass.phone || 'N/A'}</p>
                <p><span className="font-semibold">{kind === 'order' ? 'Sale' : 'Purchase'} No:</span> {pass.reference?.ref_no}</p>
                <p className="sm:col-span-2"><span className="font-semibold">Address:</span> {pass.gatePass.address || 'N/A'}</p>
                <p><span className="font-semibold">Vehicle No:</span> {pass.gatePass.vehicle_no || '—'}</p>
                <p><span className="font-semibold">Driver:</span> {pass.gatePass.driver_name || '—'}</p>
              </div>

              <table className="w-full text-sm border-collapse mb-5">
                <thead>
                  <tr className="border-y-2 border-gray-900">
                    <th className="text-left py-2 px-2 w-10">#</th>
                    <th className="text-left py-2 px-2">Item</th>
                    <th className="text-right py-2 px-2">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {pass.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-200">
                      <td className="py-2 px-2">{idx + 1}.</td>
                      <td className="py-2 px-2">{item.product_name}</td>
                      <td className="py-2 px-2 text-right">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {pass.gatePass.notes && (
                <p className="text-sm mb-5"><span className="font-semibold">Notes:</span> {pass.gatePass.notes}</p>
              )}

              <div className="grid grid-cols-3 gap-6 pt-12 text-xs text-center">
                <p className="border-t border-gray-900 pt-1">Issued by{pass.gatePass.created_by_name ? ` (${pass.gatePass.created_by_name})` : ''}</p>
                <p className="border-t border-gray-900 pt-1">Driver</p>
                <p className="border-t border-gray-900 pt-1">Security / Gate</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(selected || pass) && (
          <div className="flex gap-2 p-4 sm:p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="flex-1 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition font-semibold"
            >
              Close
            </button>
            {pass ? (
              <button
                onClick={handlePrint}
                className="flex-1 py-2 bg-[var(--color-gatepass)] text-white rounded-lg hover:bg-[var(--color-gatepass-hover)] transition font-semibold flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={saving}
                className="flex-1 py-2 bg-[var(--color-gatepass)] text-white rounded-lg hover:bg-[var(--color-gatepass-hover)] transition font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Truck className="w-4 h-4" />
                {saving ? 'Generating…' : 'Generate Gate Pass'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default GatePassModal;
