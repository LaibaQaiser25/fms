import { useCallback, useEffect, useState } from 'react';
import { FileBarChart2, Zap, MessageCircle } from 'lucide-react';
import * as reportsApi from '../../api/reportsApi';
import { Button, Pagination } from '../shared/UIComponents';
import CreateReportModal from './CreateReportModal';
import ReportAutomationModal from './ReportAutomationModal';
import ReportDetailModal from './ReportDetailModal';

const LIMIT = 20;

const PERIOD_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly', custom: 'Custom' };
const LEVEL_LABELS = { summary: 'Summary', medium: 'Medium', full: 'Full Detail' };

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 })
    .format(Number(amount) || 0);

// period_start/period_end arrive as plain 'YYYY-MM-DD' strings — parse the
// parts rather than new Date(str), which treats it as UTC and can shift the day
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

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [periodType, setPeriodType] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [order, setOrder] = useState('DESC');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  // Feed the typed search into the query a beat later, so every keystroke
  // doesn't fire its own request (same pattern as Cashbook.jsx)
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: LIMIT, sortBy, order };
      if (search) params.search = search;
      if (periodType) params.periodType = periodType;

      const res = await reportsApi.listReports(params);
      setReports(res.data.data || []);
      setTotalPages(res.data.pagination?.pages || 1);
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError(err.response?.data?.error || 'Failed to load reports');
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, order, search, periodType]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleCreated = () => {
    setPage(1);
    fetchReports();
  };

  const handleUpdated = (updated) => {
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setSelectedReport(updated);
  };

  const handleDeleted = (id) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
    setSelectedReport(null);
  };

  const toggleSort = (column) => {
    if (sortBy === column) {
      setOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(column);
      setOrder('DESC');
    }
  };

  const sortIndicator = (column) => (sortBy === column ? (order === 'ASC' ? ' ▲' : ' ▼') : '');

  const handleSendWhatsApp = async () => {
    setSendingWhatsApp(true);
    setError('');
    try {
      await reportsApi.sendDailyReportWhatsApp();
    } catch (err) {
      console.error('Error sending daily report to WhatsApp:', err);
      setError(err.response?.data?.error || 'Failed to send report to WhatsApp');
    } finally {
      setSendingWhatsApp(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="px-8 py-6 flex-1">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <FileBarChart2 className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleSendWhatsApp} disabled={sendingWhatsApp}>
              <span className="inline-flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> {sendingWhatsApp ? 'Sending...' : "Send Today's Report"}
              </span>
            </Button>
            <Button variant="secondary" onClick={() => setAutomationOpen(true)}>
              <span className="inline-flex items-center gap-1.5"><Zap className="w-4 h-4" /> Automate</span>
            </Button>
            <Button onClick={() => setCreateOpen(true)}>Create Report</Button>
          </div>
        </div>

        {/* Search + filters */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="text-sm font-medium text-gray-700 mb-1 block">Search by date</label>
            <input
              type="text"
              placeholder="e.g. Aug, 2026-08, 24..."
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Period Type</label>
            <select
              value={periodType}
              onChange={(e) => { setPeriodType(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <p className="mt-2 text-gray-600">Loading reports...</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
            No reports yet. Click "Create Report" to generate your first one.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm text-gray-700">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold cursor-pointer select-none" onClick={() => toggleSort('label')}>Label{sortIndicator('label')}</th>
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-left font-semibold">Period</th>
                  <th className="px-4 py-3 text-left font-semibold cursor-pointer select-none" onClick={() => toggleSort('period_start')}>Date Range{sortIndicator('period_start')}</th>
                  <th className="px-4 py-3 text-left font-semibold cursor-pointer select-none" onClick={() => toggleSort('created_at')}>Generated{sortIndicator('created_at')}</th>
                  <th className="px-4 py-3 text-right font-semibold">Sales</th>
                  <th className="px-4 py-3 text-right font-semibold">Purchases</th>
                  <th className="px-4 py-3 text-right font-semibold">Expenses</th>
                  <th className="px-4 py-3 text-right font-semibold">Net Cash</th>
                  <th className="px-4 py-3 text-right font-semibold">Debt</th>
                  <th className="px-4 py-3 text-right font-semibold">Payable</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedReport(r)}
                  >
                    <td className="px-4 py-3 font-semibold text-gray-800">{r.label}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                        {LEVEL_LABELS[r.report_level] || 'Medium'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{PERIOD_LABELS[r.period_type] || r.period_type}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.period_start)} – {formatDate(r.period_end)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mr-1.5 ${r.generated_by === 'auto' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {r.generated_by === 'auto' ? 'Auto' : 'Manual'}
                      </span>
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600 font-medium">{formatCurrency(r.data?.sales?.total)}</td>
                    <td className="px-4 py-3 text-right text-amber-600 font-medium">{formatCurrency(r.data?.purchases?.total)}</td>
                    <td className="px-4 py-3 text-right text-red-600 font-medium">{formatCurrency(r.data?.expenses?.total)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.data?.netCashInHand)}</td>
                    <td className="px-4 py-3 text-right text-red-600 font-medium">{formatCurrency(r.data?.customerDebt)}</td>
                    <td className="px-4 py-3 text-right text-red-600 font-medium">{formatCurrency(r.data?.payable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        )}
      </div>

      <CreateReportModal isOpen={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
      <ReportAutomationModal isOpen={automationOpen} onClose={() => setAutomationOpen(false)} />
      <ReportDetailModal
        isOpen={!!selectedReport}
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
