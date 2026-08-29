import { useState } from 'react';
import { Modal, Button } from '../shared/UIComponents';
import { createReport } from '../../api/reportsApi';

const PERIOD_OPTIONS = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This Week' },
  { value: 'monthly', label: 'This Month' },
  { value: 'yearly', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
];

const LEVEL_OPTIONS = [
  { value: 'summary', label: 'Summary', description: 'Net profit + charts. A one-page executive view.' },
  { value: 'medium', label: 'Medium', description: 'Key figures + one chart. A balanced overview.' },
  { value: 'full', label: 'Full Detail', description: 'Every figure, both charts, and a full breakdown table.' },
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const now = new Date();

const toDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateStr(d);
};

export default function CreateReportModal({ isOpen, onClose, onCreated }) {
  const [periodType, setPeriodType] = useState('daily');
  const [reportLevel, setReportLevel] = useState('medium');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [startDate, setStartDate] = useState(daysAgo(1));
  const [endDate, setEndDate] = useState(daysAgo(1));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const payload = { periodType, reportLevel };
      if (periodType === 'monthly') {
        payload.month = month;
        payload.year = year;
      }
      if (periodType === 'yearly') {
        payload.year = year;
      }
      if (periodType === 'custom') {
        if (!startDate || !endDate || startDate > endDate) {
          setError('Pick a valid date range (start date must not be after end date)');
          setSubmitting(false);
          return;
        }
        payload.startDate = startDate;
        payload.endDate = endDate;
      }
      const res = await createReport(payload);
      onCreated(res.data.data);
      handleClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title="Create Report" onClose={handleClose} size="md">
      <div className="flex flex-col gap-5">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Report Type</label>
          <div className="flex flex-col gap-2">
            {LEVEL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setReportLevel(opt.value)}
                className={`text-left px-4 py-2.5 rounded-lg border transition ${
                  reportLevel === opt.value
                    ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <p className={`text-sm font-semibold ${reportLevel === opt.value ? 'text-blue-700' : 'text-gray-800'}`}>{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Period</label>
          <div className="grid grid-cols-2 gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriodType(opt.value)}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                  periodType === opt.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {periodType === 'monthly' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="border border-gray-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Year</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="border border-gray-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {periodType === 'yearly' && (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border border-gray-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {periodType === 'custom' && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setStartDate(daysAgo(1)); setEndDate(daysAgo(1)); }}
                className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => { setStartDate(daysAgo(2)); setEndDate(daysAgo(2)); }}
                className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Day Before Yesterday
              </button>
              <button
                type="button"
                onClick={() => { setStartDate(daysAgo(7)); setEndDate(daysAgo(1)); }}
                className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Last 7 Days
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">From</label>
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">To</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 border-t">
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Generating...' : 'Create Report'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
