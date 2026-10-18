import { Fragment, useCallback, useEffect, useState } from 'react';
import * as reportsApi from '../../api/reportsApi';
import { Pagination } from '../shared/UIComponents';
import { SkeletonTable } from '../shared/Skeleton';

// Online dashboard only (T2.3, D2): what the server's send-only scheduler
// sent to WhatsApp on its own — scheduled reports and the daily digests.
// Read-only history; these are not stored as reports (the mirror stays pure).

const LIMIT = 25;
const KIND_LABELS = { daily: 'Daily report', weekly: 'Weekly report', monthly: 'Monthly report', digest: 'Daily alerts' };

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function SentReports() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [openId, setOpenId] = useState(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await reportsApi.listDispatchLog({ page, limit: LIMIT });
      setRows(res.data.data || []);
      setTotalPages(res.data.pagination?.pages || 1);
    } catch (err) {
      console.error('Error fetching sent reports:', err);
      setError(err.response?.data?.error || 'Failed to load sent reports');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  if (loading) return <SkeletonTable rows={6} columns={4} />;
  if (error) return <p className="text-sm text-red-600 mb-4">{error}</p>;
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
        Nothing sent yet. Scheduled reports and the daily alerts appear here once this server sends them.
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-gray-600 mb-3">
        Sent to WhatsApp by this server, with the factory&apos;s data as of the time shown. Click a row to see the message.
      </p>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm text-gray-700">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Sent</th>
              <th className="px-4 py-3 text-left font-semibold">What</th>
              <th className="px-4 py-3 text-left font-semibold">Label</th>
              <th className="px-4 py-3 text-left font-semibold">Data as of</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(r.sent_at)}</td>
                  <td className="px-4 py-3">{KIND_LABELS[r.frequency] || r.frequency}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{r.label || r.period_key}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.data_as_of ? formatDateTime(r.data_as_of) : 'no upload yet'}</td>
                </tr>
                {openId === r.id && (
                  <tr className="border-b bg-gray-50">
                    <td colSpan={4} className="px-4 py-3">
                      <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">{r.message}</pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />}
    </>
  );
}
