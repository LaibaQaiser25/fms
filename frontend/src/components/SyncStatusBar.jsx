import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IS_DESKTOP } from '../config';
import { getFactoryPcStatus, getFactorySyncStatus } from '../api/statusApi';

// The sync indicator at the top of every page (SYNC-HARDENING-PLAN.md T1.5).
//   Factory app: this PC's uploads — "Uploaded ✓" / "Waiting: N changes" /
//     "Problem", green / amber (backlog > 5 min) / red (blocked, refused
//     changes, a table that can't sync). Replaces the window title (F10).
//   Online dashboard: "View-only" (D7) and when the factory was last heard from.

const FACTORY_POLL_MS = 10_000;
const ONLINE_POLL_MS = 60_000;
// The factory status file is rewritten every 15 s; older than this means stuck.
const STALE_STATUS_SEC = 90;

const COLORS = {
  green: { background: '#ecfdf5', border: '#a7f3d0', color: '#065f46', dot: '#10b981' },
  amber: { background: '#fffbeb', border: '#fcd34d', color: '#92400e', dot: '#f59e0b' },
  red: { background: '#fef2f2', border: '#fca5a5', color: '#991b1b', dot: '#ef4444' },
  grey: { background: '#f9fafb', border: '#e5e7eb', color: '#4b5563', dot: '#9ca3af' },
};

function ago(date) {
  if (!date) return 'never';
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function usePoll(fetcher, intervalMs) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const run = () => fetcher()
      .then((res) => { if (alive) { setData(res.data); setFailed(false); } })
      .catch((err) => { if (alive) { setData(err.response?.data || null); setFailed(true); } });
    run();
    const timer = setInterval(run, intervalMs);
    return () => { alive = false; clearInterval(timer); };
  }, [fetcher, intervalMs]);
  return { data, failed };
}

function Bar({ level, children, extra }) {
  const c = COLORS[level] || COLORS.grey;
  return (
    <div role="status" className="mb-4 rounded-lg border px-4 py-2 text-sm flex flex-wrap items-center gap-x-4 gap-y-1"
      style={{ background: c.background, borderColor: c.border, color: c.color }}>
      <span className="flex items-center gap-2 font-semibold">
        <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.dot }} />
        {children}
      </span>
      {extra}
    </div>
  );
}

function FactoryBar() {
  const { data: s, failed } = usePoll(getFactoryPcStatus, FACTORY_POLL_MS);
  if (!s) return <Bar level="grey">Checking upload status…</Bar>;
  if (failed && s.state !== 'starting') return <Bar level="red">Problem: cannot read the upload status</Bar>;

  const stale = s.ageSec > STALE_STATUS_SEC;
  const level = stale ? 'red' : s.level;
  let main;
  if (stale) main = 'Problem: the upload status stopped updating — restart FMS';
  else if (s.state === 'blocked_not_writer' || s.state === 'not_registered') main = 'Not uploading';
  else if (s.state === 'error') main = 'Problem';
  else if (s.outboxCount > 0) main = `Waiting: ${s.outboxCount} change${s.outboxCount === 1 ? '' : 's'}`;
  else main = 'Uploaded ✓';

  const problems = stale ? [] : s.problems || [];
  return (
    <Bar
      level={level}
      extra={(
        <>
          {s.lastSyncedAt && <span>Last upload {ago(s.lastSyncedAt)}</span>}
          {problems.map((p) => (
            <span key={p}>
              {p.includes('Sync issues') ? <Link to="/sync-issues" className="underline">{p}</Link> : p}
            </span>
          ))}
        </>
      )}
    >
      {main}
    </Bar>
  );
}

function OnlineBar() {
  const { data: s } = usePoll(getFactorySyncStatus, ONLINE_POLL_MS);
  const viewOnly = (
    <span className="rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide bg-gray-800 text-white">View-only</span>
  );
  let level = 'grey';
  let main = 'Checking the factory…';
  const extra = [];
  if (s && !s.registered) {
    level = 'red';
    main = 'No factory PC is set up yet';
  } else if (s) {
    level = s.level;
    main = s.level === 'red'
      ? `Factory offline — last updated ${ago(s.lastSeenAt)}`
      : `Factory last updated ${ago(s.lastSeenAt)}`;
    const hb = s.heartbeat;
    if (hb?.outboxCount) extra.push(`${hb.outboxCount} change${hb.outboxCount === 1 ? '' : 's'} still on the factory PC`);
    if (hb?.quarantineCount) extra.push(`${hb.quarantineCount} refused change${hb.quarantineCount === 1 ? '' : 's'} at the factory`);
  }
  return (
    <Bar level={level} extra={<>{extra.map((e) => <span key={e}>{e}</span>)}<span className="ml-auto">Enter data in the FMS app at the factory.</span></>}>
      {viewOnly}
      {main}
    </Bar>
  );
}

export default function SyncStatusBar() {
  return IS_DESKTOP ? <FactoryBar /> : <OnlineBar />;
}
