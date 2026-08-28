import { useState } from 'react';
import { Modal, Button } from '../shared/UIComponents';
import { createReport } from '../../api/reportsApi';

const PERIOD_OPTIONS = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This Week' },
  { value: 'monthly', label: 'This Month' },
  { value: 'yearly', label: 'This Year' },
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const now = new Date();

export default function CreateReportModal({ isOpen, onClose, onCreated }) {
  const [periodType, setPeriodType] = useState('daily');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
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
      const payload = { periodType };
      if (periodType === 'monthly') {
        payload.month = month;
        payload.year = year;
      }
      if (periodType === 'yearly') {
        payload.year = year;
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
