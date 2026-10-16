import { useEffect, useState } from 'react';
import { Card, Button, Alert } from '../shared/UIComponents';
import { SkeletonTable } from '../shared/Skeleton';
import * as syncQuarantineApi from '../../api/syncQuarantineApi';
import { sendTestWhatsApp } from '../../api/whatsappTestApi';
import { getFactoryPcStatus } from '../../api/statusApi';

// Factory app only, Owner (SYNC-HARDENING-PLAN.md T1.4). Changes the online
// server refused — usually a duplicate, e.g. a product with the same name,
// type and size already exists online. Everything else keeps uploading.
// Retry sends the row as it is NOW, so fix the cause first.

const OPS = { I: 'New', U: 'Change', D: 'Delete' };

// Plain-language reason from the database error code.
function reason(item) {
  switch (item.code) {
    case '23505': return 'Already exists on the online server (duplicate)';
    case '23514': return 'A value is not allowed on the online server';
    case '23502': return 'A required value is missing';
    default: return item.code?.startsWith('22') ? 'A value does not fit on the online server' : 'Refused by the online server';
  }
}

// A short label for the row: its name if it has one, else its id.
function label(item) {
  const r = item.row_data || {};
  const name = r.name || r.invoice_no || r.gate_pass_no || r.username;
  return name ? `${name} (#${r.id ?? '?'})` : `#${r.id ?? JSON.stringify(r)}`;
}

const RELAY_STATES = {
  ok: 'Working',
  no_target: 'Not set up on the online server',
  n8n_rejecting: 'Refused by WhatsApp',
  offline: 'No internet — alerts wait here',
};

// WhatsApp alerts (T1.6/T1.8): how sending is going, and a test that shows
// the real outcome instead of "sent".
function WhatsAppCard() {
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = () => getFactoryPcStatus().then((r) => setStatus(r.data)).catch(() => {});
  useEffect(() => { loadStatus(); }, []);

  const test = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await sendTestWhatsApp();
      setResult(res.data);
    } catch (err) {
      setResult(err.response?.data || { ok: false, detail: 'The FMS server did not answer' });
    } finally {
      setBusy(false);
      loadStatus();
    }
  };

  return (
    <Card title="WhatsApp alerts">
      {status && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-gray-700 mb-4">
          <dt className="font-medium">Sending</dt>
          <dd>{RELAY_STATES[status.relayState] || status.relayState || '—'}{status.relayError ? ` (${status.relayError})` : ''}</dd>
          <dt className="font-medium">Waiting to send</dt>
          <dd>{status.whatsappQueued ?? 0}</dd>
        </dl>
      )}
      <Button variant="primary" disabled={busy} onClick={test}>
        {busy ? 'Sending test…' : 'Send test WhatsApp'}
      </Button>
      {result && (
        <div className={`mt-4 rounded border p-3 text-sm ${result.ok ? 'border-green-300 bg-green-50 text-green-900' : 'border-red-300 bg-red-50 text-red-900'}`}>
          <div className="font-semibold">
            {result.ok ? 'Sent — check the owner\'s WhatsApp.' : 'Not sent.'}
          </div>
          {result.detail && <div className="mt-1 break-all font-mono text-xs">{result.detail}</div>}
        </div>
      )}
    </Card>
  );
}

export default function SyncIssues() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      const res = await syncQuarantineApi.getRefusedChanges();
      setItems(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load sync issues');
    }
  };

  useEffect(() => { load(); }, []);

  const retry = async (item) => {
    setBusyId(item.id);
    setError('');
    setSuccess('');
    try {
      await syncQuarantineApi.retryRefusedChange(item.id);
      setSuccess(`${label(item)} will be uploaded again with the next sync.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Retry failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Sync issues</h1>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}

      <Card title="Changes the online server refused">
        <p className="text-gray-600 mb-4">
          Everything else keeps uploading. Fix the cause first — for a duplicate, rename the item here, or have the
          matching item removed online — then press <b>Retry</b>. Retry sends the item as it is now.
        </p>
        {!items ? (
          <SkeletonTable rows={3} columns={5} />
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Nothing refused. All changes reached the online server.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm text-gray-700">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">When</th>
                  <th className="px-4 py-3 text-left font-semibold">What</th>
                  <th className="px-4 py-3 text-left font-semibold">Item</th>
                  <th className="px-4 py-3 text-left font-semibold">Why</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b align-top">
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(item.detected_at).toLocaleString()}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{OPS[item.op] || item.op} · {item.table_name.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">{label(item)}</td>
                    <td className="px-4 py-3">
                      <div>{reason(item)}</div>
                      {item.detail && <div className="text-xs text-gray-500 mt-1 break-all">{item.detail}</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="primary" disabled={busyId === item.id} onClick={() => retry(item)}>
                        {busyId === item.id ? 'Retrying…' : 'Retry'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6">
        <WhatsAppCard />
      </div>
    </div>
  );
}
