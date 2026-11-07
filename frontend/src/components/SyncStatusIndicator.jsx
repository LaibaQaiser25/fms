import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cloud } from 'lucide-react';
import { IS_DESKTOP } from '../config';
import { getFactoryPcStatus, getFactorySyncStatus } from '../api/statusApi';
import { PANEL_STYLE } from '../theme';

// The sync indicator in the top bar (SYNC-HARDENING-PLAN.md T1.5): a small
// cloud icon with a coloured dot — green synced, amber waiting, red problem,
// grey still checking. Clicking it opens the details.
//   Factory app: this PC's uploads — "Uploaded ✓" / "Waiting: N changes" /
//     "Problem" (blocked, refused changes, a table that can't sync).
//   Online dashboard: "View-only" (D7) and when the factory was last heard from.

const FACTORY_POLL_MS = 10_000;
const ONLINE_POLL_MS = 60_000;
// The factory status file is rewritten every 15 s; older than this means stuck.
const STALE_STATUS_SEC = 90;

const DOT = { green: '#10b981', amber: '#f59e0b', red: '#ef4444', grey: '#9ca3af' };

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

// -> { level, label (short, next to the icon), title (headline in the panel), details: [string] }
function useFactoryStatus() {
  const { data: s, failed } = usePoll(getFactoryPcStatus, FACTORY_POLL_MS);
  if (!s) return { level: 'grey', label: 'Checking', title: 'Checking upload status…', details: [] };
  if (failed && s.state !== 'starting') {
    return { level: 'red', label: 'Problem', title: 'Problem: cannot read the upload status', details: [] };
  }

  const stale = s.ageSec > STALE_STATUS_SEC;
  const level = stale ? 'red' : s.level;
  let title;
  let label;
  if (stale) { title = 'Problem: the upload status stopped updating — restart FMS'; label = 'Problem'; }
  else if (s.state === 'blocked_not_writer' || s.state === 'not_registered') { title = 'Not uploading'; label = 'Not uploading'; }
  else if (s.state === 'error') { title = 'Problem'; label = 'Problem'; }
  else if (s.outboxCount > 0) { title = `Waiting: ${s.outboxCount} change${s.outboxCount === 1 ? '' : 's'} to upload`; label = 'Waiting'; }
  else { title = 'Uploaded ✓ — everything is synced'; label = 'Synced'; }

  const details = [];
  if (s.lastSyncedAt) details.push(`Last upload ${ago(s.lastSyncedAt)}`);
  if (!stale) details.push(...(s.problems || []));
  return { level, label, title, details };
}

function useOnlineStatus() {
  const { data: s } = usePoll(getFactorySyncStatus, ONLINE_POLL_MS);
  const details = [];
  let level = 'grey';
  let label = 'Checking';
  let title = 'Checking the factory…';
  if (s && !s.registered) {
    level = 'red';
    label = 'Not set up';
    title = 'No factory PC is set up yet';
  } else if (s) {
    level = s.level;
    label = s.level === 'red' ? 'Offline' : s.level === 'amber' ? 'Delayed' : 'Synced';
    title = s.level === 'red'
      ? `Factory offline — last updated ${ago(s.lastSeenAt)}`
      : `Factory last updated ${ago(s.lastSeenAt)}`;
    const hb = s.heartbeat;
    if (hb?.outboxCount) details.push(`${hb.outboxCount} change${hb.outboxCount === 1 ? '' : 's'} still on the factory PC`);
    if (hb?.quarantineCount) details.push(`${hb.quarantineCount} refused change${hb.quarantineCount === 1 ? '' : 's'} at the factory`);
  }
  details.push('This dashboard is view-only. Enter data in the FMS app at the factory.');
  return { level, label, title, details };
}

function Indicator({ level, label, title, details, viewOnly }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const dot = DOT[level] || DOT.grey;

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className="relative mr-2 sm:mr-3" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`Sync: ${label}`}
        aria-label={`Sync status: ${label}`}
        aria-expanded={open}
        className="flex items-center gap-2 h-11 px-2.5 sm:px-3 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-white/[0.05]"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}
      >
        <span className="relative">
          <Cloud className="w-5 h-5" />
          <span
            aria-hidden="true"
            className={`absolute -bottom-0.5 -right-1 h-2.5 w-2.5 rounded-full ${level === 'grey' ? 'animate-pulse' : ''}`}
            style={{ background: dot, boxShadow: `0 0 0 2px var(--nav-bg, #0b0b12), 0 0 8px ${dot}` }}
          />
        </span>
        <span className="hidden lg:inline">{label}</span>
      </button>

      {open && (
        <div role="status" className="fixed left-3 right-3 top-[84px] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:w-72 rounded-xl overflow-hidden z-50" style={PANEL_STYLE}>
          <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ background: dot }} />
              <h3 className="font-semibold text-white text-sm">Sync status</h3>
              {viewOnly && (
                <span className="ml-auto rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-white/10 text-white/80">View-only</span>
              )}
            </div>
            <p className="mt-2 text-sm" style={{ color: dot }}>{title}</p>
          </div>
          {details.length > 0 && (
            <ul className="p-4 space-y-2 text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {details.map((d) => (
                <li key={d}>
                  {d.includes('Sync issues')
                    ? <Link to="/sync-issues" onClick={() => setOpen(false)} className="underline" style={{ color: 'var(--color-text-accent)' }}>{d}</Link>
                    : d}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function FactoryIndicator() {
  return <Indicator {...useFactoryStatus()} />;
}

function OnlineIndicator() {
  return <Indicator {...useOnlineStatus()} viewOnly />;
}

export default function SyncStatusIndicator() {
  return IS_DESKTOP ? <FactoryIndicator /> : <OnlineIndicator />;
}
