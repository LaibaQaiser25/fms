import { useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Modal, Button } from '../shared/UIComponents';
import { BarChartPanel } from './ReportCharts';
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

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatRange = (start, end) => (start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`);

const LEVEL_LABELS = { summary: 'Summary', medium: 'Medium', full: 'Full Detail' };

const FIELDS = [
  { group: 'sales', key: 'total', label: 'Sales Total' },
  { group: 'sales', key: 'count', label: 'Sales Count' },
  { group: 'purchases', key: 'total', label: 'Purchases Total' },
  { group: 'purchases', key: 'count', label: 'Purchases Count' },
  { group: 'expenses', key: 'total', label: 'Expenses Total' },
  { group: 'expenses', key: 'count', label: 'Expenses Count' },
  { group: null, key: 'todayCashInHand', label: "Today's Cash In Hand" },
  { group: null, key: 'netCashInHand', label: 'Complete Cash In Hand' },
  { group: null, key: 'todayCustomerDebt', label: "Today's Customer Debt" },
  { group: null, key: 'customerDebt', label: 'Complete Customer Debt' },
  { group: null, key: 'todayPayable', label: "Today's Payable" },
  { group: null, key: 'payable', label: 'Complete Payable' },
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
  const salesTotal = d.sales?.total || 0;
  const purchasesTotal = d.purchases?.total || 0;
  const expensesTotal = d.expenses?.total || 0;
  const netProfit = salesTotal - purchasesTotal - expensesTotal;
  const profitMargin = salesTotal > 0 ? (netProfit / salesTotal) * 100 : 0;

  const letterhead = (
    <div className="border-b-2 border-gray-800 pb-4 mb-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
          <div>
            <p className="text-lg font-bold text-gray-900 leading-tight">Bin-Zahid &amp; Partners'</p>
            <p className="text-xs text-gray-500 leading-tight tracking-wide">PRECAST SOLUTIONS</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold text-gray-400 tracking-widest uppercase">{LEVEL_LABELS[report.report_level] || 'Report'}</p>
          <p className="text-sm font-semibold text-gray-800">{report.label}</p>
          <p className="text-xs text-gray-500">{formatRange(report.period_start, report.period_end)}</p>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        {report.generated_by === 'auto' ? 'Auto-generated' : 'Manually created'} · {formatDateTime(report.created_at)} · Report #{report.id}
      </p>
    </div>
  );

  const footer = (
    <p className="text-[11px] text-gray-400 text-center border-t border-gray-100 pt-3 mt-2">
      This report was generated by the FMS system and reflects data as of the moment it was created. Confidential — internal use only.
    </p>
  );

  const heroProfit = (
    <div className="text-center py-5 border-b border-gray-100 mb-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Net Profit</p>
      <p className={`font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{ fontSize: 48, lineHeight: 1 }}>
        {formatCurrency(netProfit)}
      </p>
      <p className="text-sm text-gray-500 mt-2">{profitMargin.toFixed(1)}% margin on sales</p>
    </div>
  );

  const renderCharts = (both) => (
    <div className="flex flex-col gap-6 mb-5">
      <BarChartPanel
        title="Cash Flow"
        hue="blue"
        formatValue={formatCurrency}
        series={[
          { label: 'Sales', value: salesTotal },
          { label: 'Purchases', value: purchasesTotal },
          { label: 'Expenses', value: expensesTotal },
        ]}
      />
      {both && (
        <BarChartPanel
          title="Financial Position"
          hue="orange"
          formatValue={formatCurrency}
          series={[
            { label: "Today's Cash", value: d.todayCashInHand || 0 },
            { label: 'Complete Cash', value: d.netCashInHand || 0 },
            { label: "Today's Debt", value: d.todayCustomerDebt || 0 },
            { label: 'Complete Debt', value: d.customerDebt || 0 },
            { label: "Today's Payable", value: d.todayPayable || 0 },
            { label: 'Complete Payable', value: d.payable || 0 },
          ]}
        />
      )}
    </div>
  );

  const statCards = (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
      <StatCard label="Sales" value={formatCurrency(salesTotal)} tone="text-green-600" />
      <StatCard label="Purchases" value={formatCurrency(purchasesTotal)} tone="text-amber-600" />
      <StatCard label="Expenses" value={formatCurrency(expensesTotal)} tone="text-red-600" />
      <StatCard label="Today's Cash In Hand" value={formatCurrency(d.todayCashInHand)} />
      <StatCard label="Complete Cash In Hand" value={formatCurrency(d.netCashInHand)} />
      <StatCard label="Today's Customer Debt" value={formatCurrency(d.todayCustomerDebt)} tone="text-red-600" />
      <StatCard label="Complete Customer Debt" value={formatCurrency(d.customerDebt)} tone="text-red-600" />
      <StatCard label="Today's Payable" value={formatCurrency(d.todayPayable)} tone="text-red-600" />
      <StatCard label="Complete Payable" value={formatCurrency(d.payable)} tone="text-red-600" />
    </div>
  );

  const renderFullMetricsTable = () => {
    const rows = [
      ['Sales total', formatCurrency(salesTotal)],
      ['Sales count', d.sales?.count ?? 0],
      ['Purchases total', formatCurrency(purchasesTotal)],
      ['Purchases count', d.purchases?.count ?? 0],
      ['Expenses total', formatCurrency(expensesTotal)],
      ['Expenses count', d.expenses?.count ?? 0],
      ["Today's cash in hand", formatCurrency(d.todayCashInHand)],
      ['Complete cash in hand', formatCurrency(d.netCashInHand)],
      ["Today's customer debt (receivable)", formatCurrency(d.todayCustomerDebt)],
      ['Complete customer debt (receivable)', formatCurrency(d.customerDebt)],
      ["Today's payable", formatCurrency(d.todayPayable)],
      ['Complete payable', formatCurrency(d.payable)],
      ['Net profit (sales − purchases − expenses)', formatCurrency(netProfit)],
      ['Profit margin', `${profitMargin.toFixed(1)}%`],
      ['Net position (debt − payable)', formatCurrency((d.customerDebt || 0) - (d.payable || 0))],
      ['Report period type', report.period_type],
      ['Report id', `#${report.id}`],
    ];
    return (
      <div className="mb-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Full Breakdown</h3>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-b border-gray-100 last:border-0">
                <td className="py-2 text-gray-600">{label}</td>
                <td className="py-2 text-right font-semibold text-gray-800" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} title={editing ? 'Edit Report' : report.label} onClose={onClose} size="2xl">
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
                    value={(group ? form.data[group]?.[key] : form.data[key]) ?? 0}
                    onChange={(e) => setFieldValue(group, key, e.target.value)}
                    className="border border-gray-300 rounded px-3 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div ref={printRef} className="p-1">
            {letterhead}

            {report.report_level === 'summary' && (
              <>
                {heroProfit}
                {renderCharts(true)}
              </>
            )}

            {(report.report_level === 'medium' || !report.report_level) && (
              <>
                {statCards}
                {renderCharts(false)}
                <p className="text-xs text-gray-400 mb-5">
                  {d.sales?.count ?? 0} sales · {d.purchases?.count ?? 0} purchases · {d.expenses?.count ?? 0} expenses
                </p>
              </>
            )}

            {report.report_level === 'full' && (
              <>
                {heroProfit}
                {statCards}
                {renderCharts(true)}
                {renderFullMetricsTable()}
              </>
            )}

            {footer}
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
