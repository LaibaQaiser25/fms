import { useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Modal, Button } from '../shared/UIComponents';
import { updateReport, deleteReport } from '../../api/reportsApi';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 })
    .format(Number(amount) || 0);

const formatDate = (value) => {
  if (!value) return '-';
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
};

const FIELDS = [
  { group: 'sales', key: 'total', label: 'Sales Total' },
  { group: 'sales', key: 'count', label: 'Sales Count' },
  { group: 'purchases', key: 'total', label: 'Purchases Total' },
  { group: 'purchases', key: 'count', label: 'Purchases Count' },
  { group: 'expenses', key: 'total', label: 'Expenses Total' },
  { group: 'expenses', key: 'count', label: 'Expenses Count' },
  { group: null, key: 'netCashInHand', label: 'Net Cash In Hand' },
  { group: null, key: 'customerDebt', label: 'Customer Debt' },
  { group: null, key: 'payable', label: 'Total Payable' },
];

const StatCard = ({ label, value, tone = 'text-gray-800' }) => (
  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{label}</p>
    <p className={`text-xl font-bold ${tone}`}>{value}</p>
  </div>
);

export default function ReportDetailModal({ isOpen, report, onClose, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const printRef = useRef(null);
  const handlePrint = useReactToPrint({ contentRef: printRef });

  if (!isOpen || !report) return null;

  const startEdit = () => {
    setForm({ label: report.label, data: JSON.parse(JSON.stringify(report.data)) });
    setEditing(true);
    setError('');
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm(null);
  };

  const setFieldValue = (group, key, value) => {
    setForm((prev) => {
      const next = { ...prev, data: { ...prev.data } };
      if (group) {
        next.data[group] = { ...next.data[group], [key]: Number(value) };
      } else {
        next.data[key] = Number(value);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await updateReport(report.id, { label: form.label, data: form.data });
      onUpdated(res.data.data);
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${report.label}"? This can't be undone.`)) return;
    try {
      await deleteReport(report.id);
      onDeleted(report.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete report');
    }
  };

  const d = report.data || {};

  return (
    <Modal isOpen={isOpen} title={editing ? 'Edit Report' : report.label} onClose={onClose} size="xl">
      <div className="flex flex-col gap-5">
        {editing ? (
          <>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Label</label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                className="border border-gray-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {FIELDS.map(({ group, key, label }) => (
                <div key={`${group}.${key}`}>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{label}</label>
                  <input
                    type="number"
                    value={group ? form.data[group]?.[key] : form.data[key]}
                    onChange={(e) => setFieldValue(group, key, e.target.value)}
                    className="border border-gray-300 rounded px-3 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div ref={printRef} className="p-1">
            <p className="text-sm text-gray-500 mb-4">
              {formatDate(report.period_start)} – {formatDate(report.period_end)}
              {' · '}{report.generated_by === 'auto' ? 'Auto-generated' : 'Manually created'}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard label="Sales" value={formatCurrency(d.sales?.total)} tone="text-green-600" />
              <StatCard label="Purchases" value={formatCurrency(d.purchases?.total)} tone="text-amber-600" />
              <StatCard label="Expenses" value={formatCurrency(d.expenses?.total)} tone="text-red-600" />
              <StatCard label="Net Cash In Hand" value={formatCurrency(d.netCashInHand)} />
              <StatCard label="Customer Debt" value={formatCurrency(d.customerDebt)} tone="text-red-600" />
              <StatCard label="Total Payable" value={formatCurrency(d.payable)} tone="text-red-600" />
            </div>
            <p className="text-xs text-gray-400 mt-4">
              {d.sales?.count ?? 0} sales · {d.purchases?.count ?? 0} purchases · {d.expenses?.count ?? 0} expenses
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-between items-center pt-2 border-t">
          <div>
            {!editing && (
              <button onClick={handleDelete} className="text-red-600 hover:text-red-800 font-medium text-sm">
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-3">
            {editing ? (
              <>
                <Button variant="secondary" onClick={cancelEdit} disabled={saving}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => handlePrint()}>Print</Button>
                <Button variant="secondary" onClick={startEdit}>Edit</Button>
                <Button variant="secondary" onClick={onClose}>Close</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
