import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Truck, Receipt,
  HandCoins, Wallet, Landmark, Package, AlertTriangle, Search, X, Eye
} from 'lucide-react';
import * as analyticsApi from '../api/analyticsApi';
import { useSocket } from '../context/SocketContext';
import { Modal, Pagination } from './shared/UIComponents';
import { Skeleton, SkeletonText, SkeletonCircle, SkeletonStatGrid, SkeletonTable } from './shared/Skeleton';

// ---- Constants -------------------------------------------------------

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
];

const PERIOD_COMPARE_LABEL = {
  today: 'vs yesterday',
  week: 'vs last week',
  month: 'vs last month',
  all: null,
};

// Validated against the dataviz palette validator (light surface #fcfcfb):
// blue/orange pass the adjacent-pair CVD + normal-vision floors as a
// 2-series pair, and blue/orange/aqua pass all-pairs as a 3-series set — see
// conversation notes. Color is pinned to the entity (series/payment method),
// never to sort rank, so it can't repaint when totals reorder.
const SERIES_COLORS = { sales: '#2a78d6', purchases: '#eb6834' };

const PAYMENT_TYPE_COLORS = {
  'Cash': '#2a78d6',
  'Bank Transfer': '#eb6834',
  'Cheque': '#1baf7a',
};
const FALLBACK_SLICE_COLOR = '#898781'; // "Other" and anything unexpected — muted, never a generated hue

const RECORD_TYPE_META = {
  sale: { label: 'Sale', badge: 'bg-[var(--color-accent-soft)] text-[var(--color-sale)]' },
  purchase: { label: 'Purchase', badge: 'bg-amber-100 text-[var(--color-purchase)]' },
  expense: { label: 'Expense', badge: 'bg-orange-100 text-[var(--color-payment)]' },
  payment_in: { label: 'Payment Received', badge: 'bg-green-100 text-green-700' },
  payment_out: { label: 'Payment Paid', badge: 'bg-slate-200 text-slate-700' },
};

const INFLOW_TYPES = new Set(['sale', 'payment_in']);

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'sale', label: 'Sales' },
  { key: 'purchase', label: 'Purchases' },
  { key: 'expense', label: 'Expenses' },
  { key: 'payment_in,payment_out', label: 'Payments' },
];

const RECORDS_LIMIT = 10;

// ---- Formatters --------------------------------------------------------

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(Number(amount) || 0);

const formatCompact = (amount) =>
  new Intl.NumberFormat('en-PK', { notation: 'compact', style: 'currency', currency: 'PKR', maximumFractionDigits: 1 }).format(Number(amount) || 0);

// occurredAt arrives as a naive local 'YYYY-MM-DDTHH:MM:SS' string (see
// AnalyticsController.getRecords) — parsed part-by-part rather than
// `new Date(str)` so it's never reinterpreted through a UTC offset.
const formatDateTime = (value) => {
  if (!value) return '—';
  const [datePart, timePart] = String(value).split('T');
  const [y, m, d] = (datePart || '').split('-').map(Number);
  if (!y || !m || !d) return String(value);
  const [hh = 0, mm = 0] = (timePart || '').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).toLocaleString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const statusBadgeClass = (status) => {
  const s = (status || '').toLowerCase();
  if (['cancelled', 'canceled'].includes(s)) return 'bg-red-50 text-red-700';
  if (s === 'pending') return 'bg-amber-50 text-amber-700';
  if (['ready', 'partial'].includes(s)) return 'bg-blue-50 text-blue-700';
  return 'bg-green-50 text-green-700'; // paid, received, delivered, recorded, unpaid-but-created, etc.
};

// ---- Stat card -----------------------------------------------------------

function StatCard({ label, value, icon: Icon, iconBg, iconColor, trend, trendMode = 'positive', subtext }) {
  const hasTrend = trend !== undefined && trend !== null && !Number.isNaN(trend);
  const isUp = hasTrend && trend > 0;
  const isFlat = hasTrend && trend === 0;

  let chipClass = 'text-gray-500 bg-gray-100';
  if (hasTrend && !isFlat && trendMode !== 'neutral') {
    const good = trendMode === 'negative' ? !isUp : isUp;
    chipClass = good ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50';
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm text-gray-500 font-medium truncate">{label}</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1 truncate">{value}</p>
        </div>
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap min-h-[20px]">
        {hasTrend && (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded ${chipClass}`}>
            {!isFlat && (isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
        {subtext && <span className="text-xs text-gray-400 truncate">{subtext}</span>}
      </div>
    </div>
  );
}

// ---- Orders Analytics: dual-line chart (Sales vs Purchases) --------------

function OrdersTrendChart({ points, granularity, onGranularityChange }) {
  const svgRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  const W = 600, H = 220;
  const padL = 46, padR = 12, padT = 16, padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxRaw = useMemo(
    () => Math.max(1, ...points.flatMap((p) => [p.sales, p.purchases])),
    [points]
  );

  const niceMax = useMemo(() => {
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxRaw)));
    const steps = [1, 2, 2.5, 5, 10];
    for (const step of steps) {
      const candidate = step * magnitude;
      if (candidate >= maxRaw) return candidate;
    }
    return 10 * magnitude;
  }, [maxRaw]);

  const xFor = (i) => padL + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yFor = (v) => padT + plotH - (v / niceMax) * plotH;

  const buildPath = (key) => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p[key]).toFixed(1)}`).join(' ');
  const buildArea = (key) => points.length === 0 ? '' :
    `${buildPath(key)} L ${xFor(points.length - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${xFor(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

  const handleMove = (evt) => {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const vbX = ((evt.clientX - rect.left) / rect.width) * W;
    let nearest = 0, best = Infinity;
    points.forEach((_, i) => {
      const dist = Math.abs(xFor(i) - vbX);
      if (dist < best) { best = dist; nearest = i; }
    });
    setHoverIdx(nearest);
  };

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];
  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  const tooltipW = 150, tooltipH = 58;
  let tipX = hoverIdx !== null ? xFor(hoverIdx) + 12 : 0;
  if (tipX + tooltipW > W - padR) tipX = xFor(hoverIdx) - tooltipW - 12;
  const tipY = padT + 6;

  if (points.length === 0) {
    return <div className="flex items-center justify-center h-56 text-sm text-gray-400">No trend data yet</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: SERIES_COLORS.sales }} />
            Sales
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: SERIES_COLORS.purchases }} />
            Purchases
          </span>
        </div>
        <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
          {['monthly', 'weekly'].map((g) => (
            <button
              key={g}
              onClick={() => onGranularityChange(g)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${granularity === g ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {g === 'monthly' ? 'Monthly' : 'Weekly'}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-56 select-none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {gridSteps.map((g) => {
          const y = padT + plotH - g * plotH;
          return (
            <g key={g}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#e1e0d9" strokeWidth="1" />
              <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#898781">
                {formatCompact(niceMax * g)}
              </text>
            </g>
          );
        })}

        <path d={buildArea('purchases')} fill={SERIES_COLORS.purchases} opacity="0.1" stroke="none" />
        <path d={buildArea('sales')} fill={SERIES_COLORS.sales} opacity="0.1" stroke="none" />

        <path d={buildPath('purchases')} fill="none" stroke={SERIES_COLORS.purchases} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={buildPath('sales')} fill="none" stroke={SERIES_COLORS.sales} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <text key={`lbl-${i}`} x={xFor(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#898781">
            {p.label}
          </text>
        ))}

        {points.map((p, i) => (
          <g key={`dot-${i}`}>
            <circle cx={xFor(i)} cy={yFor(p.purchases)} r={hoverIdx === i ? 5 : 3.5} fill={SERIES_COLORS.purchases} stroke="#fff" strokeWidth="2" />
            <circle cx={xFor(i)} cy={yFor(p.sales)} r={hoverIdx === i ? 5 : 3.5} fill={SERIES_COLORS.sales} stroke="#fff" strokeWidth="2" />
          </g>
        ))}

        {hoverIdx !== null && hovered && (
          <>
            <line x1={xFor(hoverIdx)} x2={xFor(hoverIdx)} y1={padT} y2={padT + plotH} stroke="#c3c2b7" strokeWidth="1" strokeDasharray="3 3" />
            <g transform={`translate(${tipX}, ${tipY})`}>
              <rect width={tooltipW} height={tooltipH} rx="8" fill="#0b0b0b" opacity="0.92" />
              <text x="10" y="17" fontSize="9.5" fill="#c3c2b7">{hovered.label}</text>
              <rect x="10" y="24" width="8" height="2" fill={SERIES_COLORS.sales} />
              <text x="22" y="29" fontSize="9.5" fill="#c3c2b7">Sales</text>
              <text x={tooltipW - 10} y="29" textAnchor="end" fontSize="10.5" fontWeight="700" fill="#fff">{formatCurrency(hovered.sales)}</text>
              <rect x="10" y="40" width="8" height="2" fill={SERIES_COLORS.purchases} />
              <text x="22" y="45" fontSize="9.5" fill="#c3c2b7">Purchases</text>
              <text x={tooltipW - 10} y="45" textAnchor="end" fontSize="10.5" fontWeight="700" fill="#fff">{formatCurrency(hovered.purchases)}</text>
            </g>
          </>
        )}
      </svg>
    </div>
  );
}

// ---- Earnings: payment-method donut ---------------------------------------

function EarningsDonut({ breakdown, totalEarnings }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const SIZE = 180, CX = 90, CY = 90, R = 62, STROKE = 26;
  const CIRC = 2 * Math.PI * R;
  const GAP = 3;

  const colorFor = (paymentType) => PAYMENT_TYPE_COLORS[paymentType] || FALLBACK_SLICE_COLOR;

  // Each slice's start offset is the sum of every slice before it — computed
  // fresh per slice (n is at most a handful of payment methods) instead of a
  // running total mutated across the map, which render must stay pure of.
  const lengths = breakdown.map((b) => (b.percent / 100) * CIRC);
  const arcs = breakdown.map((b, i) => {
    const cursor = lengths.slice(0, i).reduce((sum, len) => sum + len, 0);
    const visible = Math.max(lengths[i] - GAP, 0);
    return { ...b, visible, dashoffset: -cursor, color: colorFor(b.paymentType) };
  });

  if (breakdown.length === 0) {
    return <div className="flex items-center justify-center h-48 text-sm text-gray-400">No earnings recorded yet</div>;
  }

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-40 h-40">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f1f0ed" strokeWidth={STROKE} />
        {arcs.map((a, i) => (
          <circle
            key={a.paymentType}
            cx={CX} cy={CY} r={R} fill="none"
            stroke={a.color}
            strokeWidth={hoverIdx === i ? STROKE + 4 : STROKE}
            strokeDasharray={`${a.visible} ${CIRC - a.visible}`}
            strokeDashoffset={a.dashoffset}
            transform={`rotate(-90 ${CX} ${CY})`}
            style={{ transition: 'stroke-width 120ms ease', cursor: 'pointer' }}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <title>{`${a.paymentType}: ${formatCurrency(a.total)} (${a.percent.toFixed(1)}%)`}</title>
          </circle>
        ))}
        <text x={CX} y={CY - 6} textAnchor="middle" fontSize="9.5" fill="#898781">Total Earnings</text>
        <text x={CX} y={CY + 14} textAnchor="middle" fontSize="16" fontWeight="700" fill="#0b0b0b">
          {formatCompact(totalEarnings)}
        </text>
      </svg>
      <div className="w-full mt-3 space-y-1">
        {breakdown.map((b, i) => (
          <div
            key={b.paymentType}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            className={`flex items-center justify-between text-xs px-1.5 py-1 rounded-md transition ${hoverIdx === i ? 'bg-gray-50' : ''}`}
          >
            <span className="flex items-center gap-1.5 text-gray-600 font-medium truncate">
              <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: colorFor(b.paymentType) }} />
              {b.paymentType}
            </span>
            <span className="text-gray-900 font-semibold shrink-0 ml-2">
              {formatCurrency(b.total)}
              <span className="text-gray-400 font-normal ml-1">{b.percent.toFixed(0)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Main component --------------------------------------------------

function Analytics() {
  const [period, setPeriod] = useState('month');
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  const [granularity, setGranularity] = useState('monthly');
  const [trendPoints, setTrendPoints] = useState([]);
  const [loadingTrend, setLoadingTrend] = useState(true);

  const [earnings, setEarnings] = useState(null);
  const [loadingEarnings, setLoadingEarnings] = useState(true);

  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsPages, setRecordsPages] = useState(1);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);

  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Debounce the search box so every keystroke doesn't fire its own request
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Changing what the records are filtered by should jump back to page 1
  useEffect(() => {
    setRecordsPage(1);
  }, [typeFilter, search]);

  useEffect(() => {
    let cancelled = false;
    setLoadingSummary(true);
    Promise.allSettled([analyticsApi.getSummary(period), analyticsApi.getEarningsBreakdown(period)])
      .then(([summaryRes, earningsRes]) => {
        if (cancelled) return;
        if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value.data.data);
        if (earningsRes.status === 'fulfilled') setEarnings(earningsRes.value.data.data);
        setLastUpdated(new Date());
      })
      .finally(() => { if (!cancelled) { setLoadingSummary(false); setLoadingEarnings(false); } });
    return () => { cancelled = true; };
  }, [period, refreshTick]);

  useEffect(() => {
    let cancelled = false;
    setLoadingTrend(true);
    analyticsApi.getOrdersTrend(granularity)
      .then((res) => { if (!cancelled) setTrendPoints(res.data.data.points); })
      .catch((err) => console.error('Error fetching orders trend:', err))
      .finally(() => { if (!cancelled) setLoadingTrend(false); });
    return () => { cancelled = true; };
  }, [granularity, refreshTick]);

  useEffect(() => {
    let cancelled = false;
    setRecordsLoading(true);
    const params = { page: recordsPage, limit: RECORDS_LIMIT };
    if (typeFilter !== 'all') params.type = typeFilter;
    if (search) params.search = search;
    analyticsApi.getRecords(params)
      .then((res) => {
        if (cancelled) return;
        setRecords(res.data.data);
        setRecordsPages(res.data.pagination.pages);
        setRecordsTotal(res.data.pagination.total);
      })
      .catch((err) => console.error('Error fetching records:', err))
      .finally(() => { if (!cancelled) setRecordsLoading(false); });
    return () => { cancelled = true; };
  }, [recordsPage, typeFilter, search, refreshTick]);

  // A 5-minute fallback, not the primary refresh mechanism — a dropped
  // socket just means this dashboard is stale for up to 5 minutes instead
  // of instantly, an acceptable trade for not polling every tab every minute.
  useEffect(() => {
    const interval = setInterval(() => setRefreshTick((t) => t + 1), 300000);
    return () => clearInterval(interval);
  }, []);

  // Instant refresh on the mutations that actually move these numbers.
  const { subscribe } = useSocket();
  useEffect(() => {
    const unsubscribers = ['stock:updated', 'stock:created', 'stock:deleted', 'sale:created', 'purchase:created']
      .map((event) => subscribe(event, () => setRefreshTick((t) => t + 1)));
    return () => unsubscribers.forEach((unsub) => unsub());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compareLabel = PERIOD_COMPARE_LABEL[period];

  const heroCards = summary ? [
    {
      label: 'Total Revenue', value: formatCurrency(summary.sales.total), icon: DollarSign,
      iconBg: 'bg-blue-50', iconColor: 'text-blue-600', trend: summary.trends?.sales, trendMode: 'positive',
      subtext: `${summary.sales.count} sale${summary.sales.count === 1 ? '' : 's'}${compareLabel ? ` · ${compareLabel}` : ''}`,
    },
    {
      label: 'Total Purchases', value: formatCurrency(summary.purchases.total), icon: Truck,
      iconBg: 'bg-amber-50', iconColor: 'text-amber-600', trend: summary.trends?.purchases, trendMode: 'neutral',
      subtext: `${summary.purchases.count} purchase${summary.purchases.count === 1 ? '' : 's'}${compareLabel ? ` · ${compareLabel}` : ''}`,
    },
    {
      label: 'Total Expenses', value: formatCurrency(summary.expenses.total), icon: Receipt,
      iconBg: 'bg-orange-50', iconColor: 'text-orange-600', trend: summary.trends?.expenses, trendMode: 'negative',
      subtext: `${summary.expenses.count} expense${summary.expenses.count === 1 ? '' : 's'}${compareLabel ? ` · ${compareLabel}` : ''}`,
    },
    {
      // Same cash-basis figure Cashbook labels "Net Cash In-hand" — actual
      // cash from sales/payments in, minus cash paid out for purchases and
      // expenses, cumulative to date (not scoped to the period tabs above).
      label: 'Net Cash In-hand', value: formatCurrency(summary.netCashInHand), icon: Wallet,
      iconBg: summary.netCashInHand >= 0 ? 'bg-green-50' : 'bg-red-50', iconColor: summary.netCashInHand >= 0 ? 'text-green-600' : 'text-red-600',
      trend: summary.trends?.cashInHand, trendMode: 'positive', subtext: 'Cash-basis, all-time',
    },
  ] : [];

  const secondaryCards = summary ? [
    {
      label: 'Outstanding Debt', value: formatCurrency(summary.customerDebt), icon: HandCoins,
      iconBg: 'bg-red-50', iconColor: 'text-red-600', trend: summary.trends?.debt, trendMode: 'negative',
      subtext: `${summary.totalCustomers} customer${summary.totalCustomers === 1 ? '' : 's'}`,
    },
    {
      label: 'Payable to Sellers', value: formatCurrency(summary.payable), icon: Landmark,
      iconBg: 'bg-purple-50', iconColor: 'text-purple-600', trend: summary.trends?.payable, trendMode: 'negative',
      subtext: `${summary.totalSellers} seller${summary.totalSellers === 1 ? '' : 's'}`,
    },
    {
      label: 'Inventory Value', value: formatCurrency(summary.stock.totalValue), icon: Package,
      iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600', subtext: `${summary.stock.totalItems} items in stock`,
    },
    {
      label: 'Low Stock Items', value: summary.stock.lowStockCount, icon: AlertTriangle,
      iconBg: 'bg-red-50', iconColor: 'text-red-600', subtext: 'Need restocking',
    },
  ] : [];

  const initialLoad = summary === null && loadingSummary;

  return (
    <div className="flex flex-col gap-6">
      {/* Period selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3.5 py-1.5 rounded-lg font-semibold text-sm transition ${period === p.key ? 'bg-[var(--color-selected)] text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {initialLoad ? (
        <div className="flex flex-col gap-6">
          <SkeletonStatGrid count={4} />
          <SkeletonStatGrid count={4} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <SkeletonText width="w-36" height="h-5" className="mb-4" />
              <Skeleton className="w-full h-56 rounded-xl" />
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <SkeletonText width="w-24" height="h-5" className="mb-4" />
              <div className="flex justify-center py-2">
                <SkeletonCircle size="w-40 h-40" />
              </div>
            </div>
          </div>
          <SkeletonTable rows={6} columns={7} />
        </div>
      ) : (
        <div className={`flex flex-col gap-6 transition-opacity ${loadingSummary ? 'opacity-60' : 'opacity-100'}`}>
          {/* Hero KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {heroCards.map((c) => <StatCard key={c.label} {...c} />)}
          </div>

          {/* Secondary operational row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {secondaryCards.map((c) => <StatCard key={c.label} {...c} />)}
          </div>

          {/* Orders Analytics + Earnings */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-base font-bold text-gray-800 mb-3">Orders Analytics</h2>
              <div className={`transition-opacity ${loadingTrend ? 'opacity-60' : 'opacity-100'}`}>
                <OrdersTrendChart points={trendPoints} granularity={granularity} onGranularityChange={setGranularity} />
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-base font-bold text-gray-800 mb-3">Earnings</h2>
              <div className={`transition-opacity ${loadingEarnings ? 'opacity-60' : 'opacity-100'}`}>
                <EarningsDonut breakdown={earnings?.breakdown || []} totalEarnings={earnings?.totalEarnings || 0} />
              </div>
            </div>
          </div>

          {/* Records — every sale, purchase, expense and payment, unfiltered by default */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-gray-800">Records</h2>
                <p className="text-xs text-gray-400 mt-0.5">Every sale, purchase, expense and payment — {recordsTotal} total</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search party or reference..."
                    className="pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-text-accent)] w-48 sm:w-56"
                  />
                  {searchInput && (
                    <button onClick={() => setSearchInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-4">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setTypeFilter(f.key)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${typeFilter === f.key ? 'bg-[var(--color-selected)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className={`overflow-x-auto transition-opacity ${recordsLoading ? 'opacity-60' : 'opacity-100'}`}>
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="text-left py-2 px-3 font-semibold text-gray-500 text-xs">No.</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-500 text-xs">Type</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-500 text-xs">Date</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-500 text-xs">Party</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-500 text-xs">Reference</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 text-xs">Amount</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-500 text-xs">Status</th>
                    <th className="text-center py-2 px-3 font-semibold text-gray-500 text-xs">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 && !recordsLoading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-gray-400">No records found</td>
                    </tr>
                  ) : (
                    records.map((r, idx) => {
                      const meta = RECORD_TYPE_META[r.type] || { label: r.type, badge: 'bg-gray-100 text-gray-700' };
                      const inflow = INFLOW_TYPES.has(r.type);
                      return (
                        <tr key={r.key} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedRecord(r)}>
                          <td className="py-3 px-3 text-gray-400">{(recordsPage - 1) * RECORDS_LIMIT + idx + 1}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${meta.badge}`}>{meta.label}</span>
                          </td>
                          <td className="py-3 px-3 text-gray-500 whitespace-nowrap">{formatDateTime(r.occurredAt)}</td>
                          <td className="py-3 px-3 text-gray-800 font-medium">{r.party || '—'}</td>
                          <td className="py-3 px-3 text-gray-500">{r.reference || '—'}</td>
                          <td className={`py-3 px-3 text-right font-semibold whitespace-nowrap ${inflow ? 'text-green-700' : 'text-gray-800'}`}>
                            {inflow ? '+' : '−'} {formatCurrency(r.amount)}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize whitespace-nowrap ${statusBadgeClass(r.status)}`}>{r.status}</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedRecord(r); }}
                              className="text-gray-400 hover:text-[var(--color-text-accent)]"
                              title="View details"
                            >
                              <Eye className="w-4 h-4 inline" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {recordsPages > 1 && (
              <Pagination currentPage={recordsPage} totalPages={recordsPages} onPageChange={setRecordsPage} />
            )}
          </div>

          {lastUpdated && (
            <div className="text-center text-xs text-gray-400">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      {selectedRecord && (
        <Modal isOpen title={(RECORD_TYPE_META[selectedRecord.type]?.label || selectedRecord.type) + ' Details'} onClose={() => setSelectedRecord(null)} size="sm">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Reference</dt>
              <dd className="font-semibold text-gray-900 text-right">{selectedRecord.reference || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Party</dt>
              <dd className="font-semibold text-gray-900 text-right">{selectedRecord.party || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Date</dt>
              <dd className="font-semibold text-gray-900 text-right">{formatDateTime(selectedRecord.occurredAt)}</dd>
            </div>
            <div className="flex justify-between gap-4 items-center">
              <dt className="text-gray-500">Amount</dt>
              <dd className="font-bold text-gray-900 text-lg text-right">{formatCurrency(selectedRecord.amount)}</dd>
            </div>
            <div className="flex justify-between gap-4 items-center">
              <dt className="text-gray-500">Status</dt>
              <dd><span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${statusBadgeClass(selectedRecord.status)}`}>{selectedRecord.status}</span></dd>
            </div>
            {selectedRecord.paymentType && (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Payment Method</dt>
                <dd className="font-semibold text-gray-900 text-right">{selectedRecord.paymentType}</dd>
              </div>
            )}
          </dl>
        </Modal>
      )}
    </div>
  );
}

export default Analytics;
