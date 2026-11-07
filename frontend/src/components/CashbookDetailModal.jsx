import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ExternalLink } from 'lucide-react';
import * as cashbookApi from '../api/cashbookApi';
import { Modal, Pagination } from './shared/UIComponents';
import { formatCurrency, formatDate, filterParams } from './cashbookUtils';

// What opens when a Cashbook summary card is clicked:
//   'sale' | 'purchase' | 'expense'  -> the cash entries behind that card
//   'net'                            -> how the net figure is worked out
//   'receivable' | 'payable'         -> who owes us / who we owe

const DETAIL_LIMIT = 10;

const FLOW = {
  sale: { title: 'Cash In — Sales', totalKey: 'salesIn', countKey: 'sales', sign: '+', tone: 'text-[var(--color-sale)]' },
  purchase: { title: 'Cash Out — Purchases', totalKey: 'purchasesOut', countKey: 'purchases', sign: '−', tone: 'text-[var(--color-purchase)]' },
  expense: { title: 'Cash Out — Expenses', totalKey: 'expensesOut', countKey: 'expenses', sign: '−', tone: 'text-[var(--color-payment)]' },
};

const BALANCE = {
  receivable: { title: 'Receivable — customers owe us', noun: 'customer', totalKey: 'receivable', ledger: (id) => `/ledger?customerId=${id}` },
  payable: { title: 'Payable — we owe sellers', noun: 'seller', totalKey: 'payable', ledger: (id) => `/purchase-ledger?sellerId=${id}` },
};

const periodLabel = (filters) => {
  if (filters.startDate && filters.endDate) return `${formatDate(filters.startDate)} – ${formatDate(filters.endDate)}`;
  if (filters.startDate) return `from ${formatDate(filters.startDate)}`;
  if (filters.endDate) return `up to ${formatDate(filters.endDate)}`;
  return 'all dates';
};

function Summary({ label, value, sub, tone = 'text-gray-900' }) {
  return (
    <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function FlowDetail({ kind, filters, totals }) {
  const meta = FLOW[kind];
  // A type filter that leaves this kind out means the card reads 0 — show
  // nothing rather than entries the card isn't counting.
  const excluded = filters.types.length > 0 && !filters.types.includes(kind);
  const [state, setState] = useState({ rows: [], pages: 1, loading: !excluded, error: '' });
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (excluded) return;
    let alive = true;
    cashbookApi.getCashbook({ ...filterParams(filters), type: kind, page, limit: DETAIL_LIMIT, sortBy: 'date', order: 'DESC' })
      .then((res) => alive && setState({ rows: res.data.data || [], pages: res.data.pagination?.pages || 1, loading: false, error: '' }))
      .catch((err) => alive && setState({ rows: [], pages: 1, loading: false, error: err.response?.data?.error || 'Failed to load entries' }));
    return () => { alive = false; };
  }, [kind, filters, page, excluded]);

  const count = totals?.counts?.[meta.countKey] ?? 0;
  return (
    <>
      <Summary
        label={`Total · ${periodLabel(filters)}`}
        value={formatCurrency(totals?.[meta.totalKey])}
        sub={`${count} ${count === 1 ? 'entry' : 'entries'} · ${kind === 'expense' ? 'every expense counts' : 'cash payments only'}`}
        tone={meta.tone}
      />
      {excluded ? (
        <p className="text-sm text-gray-500 text-center py-6">This type is hidden by the current Type filter.</p>
      ) : state.loading ? (
        <p className="text-sm text-gray-500 text-center py-6">Loading entries…</p>
      ) : state.error ? (
        <p className="text-sm text-red-600 text-center py-6">{state.error}</p>
      ) : state.rows.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">No entries for these filters.</p>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  <th className="py-2 px-3 text-left font-semibold">Date</th>
                  <th className="py-2 px-3 text-left font-semibold">{kind === 'expense' ? 'Paid for' : 'Party'}</th>
                  <th className="py-2 px-3 text-left font-semibold">Reference</th>
                  <th className="py-2 px-3 text-left font-semibold">Note</th>
                  <th className="py-2 px-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {state.rows.map((e) => (
                  <tr key={`${e.entry_type}-${e.direction}-${e.source_id}-${e.reference}`}>
                    <td className="py-2 px-3 whitespace-nowrap text-gray-700">{formatDate(e.entry_date)}</td>
                    <td className="py-2 px-3 font-medium text-gray-800">{e.party || '-'}</td>
                    <td className="py-2 px-3 text-gray-500">{e.reference || '-'}</td>
                    <td className="py-2 px-3 text-gray-600 max-w-[14rem] truncate" title={e.note}>{e.note || '-'}</td>
                    <td className={`py-2 px-3 text-right font-semibold whitespace-nowrap ${e.direction === 'in' ? 'text-gray-800' : 'text-red-600'}`}>
                      {e.direction === 'in' ? '+' : '−'}{formatCurrency(e.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.pages > 1 && <Pagination currentPage={page} totalPages={state.pages} onPageChange={setPage} />}
        </>
      )}
    </>
  );
}

function NetDetail({ filters, totals, onOpen }) {
  const rows = [
    { kind: 'sale', label: 'Cash in from sales', value: totals?.salesIn, sign: '+' },
    { kind: 'purchase', label: 'Cash out on purchases', value: totals?.purchasesOut, sign: '−' },
    { kind: 'expense', label: 'Cash out on expenses', value: totals?.expensesOut, sign: '−' },
  ];
  const net = totals?.net ?? 0;
  return (
    <>
      <p className="text-sm text-gray-600 mb-3">How the net figure is worked out for {periodLabel(filters)}:</p>
      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
        {rows.map((r) => (
          <button
            key={r.kind}
            type="button"
            onClick={() => onOpen(r.kind)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition"
          >
            <span className="text-gray-700">{r.label}</span>
            <span className="flex items-center gap-2 font-semibold text-gray-900">
              {r.sign} {formatCurrency(r.value)}
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </span>
          </button>
        ))}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-b-lg">
          <span className="font-semibold text-gray-800">Net cash in-hand</span>
          <span className={`text-lg font-bold ${net >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatCurrency(net)}</span>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Only cash counts here. Cheques and bank transfers on sales and purchases are left out until they
        are recorded as cash. Every expense is counted.
      </p>
    </>
  );
}

function BalanceDetail({ kind, filters, balances, onNavigate }) {
  const meta = BALANCE[kind];
  const [state, setState] = useState({ rows: [], loading: true, error: '' });

  useEffect(() => {
    let alive = true;
    cashbookApi.getBalanceDetails(kind, filters.endDate ? { asOf: filters.endDate } : {})
      .then((res) => alive && setState({ rows: res.data.data || [], loading: false, error: '' }))
      .catch((err) => alive && setState({ rows: [], loading: false, error: err.response?.data?.error || 'Failed to load balances' }));
    return () => { alive = false; };
  }, [kind, filters.endDate]);

  const n = state.rows.length;
  return (
    <>
      <Summary
        label={`Total · as of ${filters.endDate ? formatDate(filters.endDate) : 'today'}`}
        value={formatCurrency(balances?.[meta.totalKey])}
        sub={state.loading ? ' ' : `${n} ${n === 1 ? meta.noun : `${meta.noun}s`}`}
      />
      {state.loading ? (
        <p className="text-sm text-gray-500 text-center py-6">Loading…</p>
      ) : state.error ? (
        <p className="text-sm text-red-600 text-center py-6">{state.error}</p>
      ) : n === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">Nothing outstanding.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {state.rows.map((r) => (
            <Link
              key={r.partyId}
              to={meta.ledger(r.partyId)}
              onClick={onNavigate}
              title="Open in ledger"
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition"
            >
              <span className="min-w-0">
                <span className="block font-medium text-gray-800 truncate">{r.name || `#${r.partyId}`}</span>
                {r.phone && <span className="block text-xs text-gray-500">{r.phone}</span>}
              </span>
              <span className="flex items-center gap-2 shrink-0 font-semibold text-gray-900">
                {formatCurrency(r.balance)}
                <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function CashbookDetailModal({ kind, filters, totals, balances, onOpen, onClose }) {
  const title = FLOW[kind]?.title || BALANCE[kind]?.title || 'Net Cash In-hand';
  return (
    <Modal isOpen={!!kind} title={title} onClose={onClose} size="2xl">
      {FLOW[kind] && <FlowDetail key={kind} kind={kind} filters={filters} totals={totals} />}
      {kind === 'net' && <NetDetail filters={filters} totals={totals} onOpen={onOpen} />}
      {BALANCE[kind] && <BalanceDetail key={kind} kind={kind} filters={filters} balances={balances} onNavigate={onClose} />}
    </Modal>
  );
}
