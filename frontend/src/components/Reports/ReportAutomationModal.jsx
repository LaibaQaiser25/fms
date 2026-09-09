import { useEffect, useState } from 'react';
import { Modal, Button } from '../shared/UIComponents';
import { getSchedules, updateSchedule } from '../../api/reportsApi';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FREQUENCY_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const FREQUENCY_ORDER = ['daily', 'weekly', 'monthly'];

// report_schedules.run_time comes back as 'HH:MM:SS' — <input type="time"> wants 'HH:MM'
const toInputTime = (dbTime) => (dbTime ? dbTime.slice(0, 5) : '23:55');

export default function ReportAutomationModal({ isOpen, onClose }) {
  const [schedules, setSchedules] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    getSchedules()
      .then((res) => {
        const byFrequency = {};
        (res.data.data || []).forEach((row) => {
          byFrequency[row.frequency] = {
            enabled: row.enabled,
            runTime: toInputTime(row.run_time),
            runDayOfWeek: row.run_day_of_week ?? 0,
            runDayOfMonth: row.run_day_of_month ?? 1,
          };
        });
        setSchedules(byFrequency);
      })
      .catch(() => setError('Failed to load automation settings'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const patch = (frequency, fields) => {
    setSchedules((prev) => ({ ...prev, [frequency]: { ...prev[frequency], ...fields } }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await Promise.all(
        FREQUENCY_ORDER.map((frequency) => {
          const s = schedules[frequency];
          if (!s) return null;
          return updateSchedule(frequency, {
            enabled: s.enabled,
            runTime: s.runTime,
            runDayOfWeek: frequency === 'weekly' ? s.runDayOfWeek : undefined,
            runDayOfMonth: frequency === 'monthly' ? s.runDayOfMonth : undefined,
          });
        })
      );
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save automation settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title="Automate Report Creation" onClose={onClose} size="lg">
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : (
        <div className="flex flex-col gap-4">
          {FREQUENCY_ORDER.map((frequency) => {
            const s = schedules[frequency] || {};
            return (
              <div key={frequency} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-gray-800">{FREQUENCY_LABELS[frequency]}</span>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!s.enabled}
                      onChange={(e) => patch(frequency, { enabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-[var(--color-accent)] relative transition-colors">
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${s.enabled ? 'translate-x-5' : ''}`} />
                    </div>
                  </label>
                </div>

                {s.enabled && (
                  <div className="flex flex-wrap gap-4 items-end">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Time</label>
                      <input
                        type="time"
                        value={s.runTime || '23:55'}
                        onChange={(e) => patch(frequency, { runTime: e.target.value })}
                        className="border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                      />
                    </div>

                    {frequency === 'weekly' && (
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Day of week</label>
                        <select
                          value={s.runDayOfWeek ?? 0}
                          onChange={(e) => patch(frequency, { runDayOfWeek: Number(e.target.value) })}
                          className="border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                        >
                          {DAY_NAMES.map((name, idx) => (
                            <option key={name} value={idx}>{name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {frequency === 'monthly' && (
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Day of month</label>
                        <select
                          value={s.runDayOfMonth ?? 1}
                          onChange={(e) => patch(frequency, { runDayOfMonth: Number(e.target.value) })}
                          className="border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                        >
                          {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                            <option key={day} value={day}>{day}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
