import React, { useState, useEffect, useCallback } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Receipt, Wallet, ArrowUpDown, X, HandCoins, Landmark } from 'lucide-react';
import * as cashbookApi from '../api/cashbookApi';
import expenseAPI from '../api/expenseApi';
import { Pagination } from './shared/UIComponents';

const LIMIT = 25;

const EMPTY_FILTERS = {
  startDate: '',
  endDate: '',
  types: [],
  categoryId: '',
  paymentType: '',
  search: ''
};

const TYPE_OPTIONS = [
  { value: 'sale', label: 'Sales' },
  { value: 'purchase', label: 'Purchases' },
  { value: 'expense', label: 'Expenses' }
];

const TYPE_BADGE = {
  sale: 'bg-[var(--color-accent-soft)] text-[var(--color-sale)]',
  purchase: 'bg-amber-100 text-[var(--color-purchase)]',
  expense: 'bg-orange-100 text-[var(--color-payment)]'
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 })
    .format(Number(amount) || 0);

// entry_date arrives as a plain 'YYYY-MM-DD' string — parse the parts rather
// than new Date(str), which would treat it as UTC and shift the day
const formatDate = (value) => {
  if (!value) return '-';
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
};

function Cashbook() {
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState(null);
  const [balances, setBalances] = useState(null);
  const [categories, setCategories] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [order, setOrder] = useState('DESC');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEntries, setTotalEntries] = useState(0);

  // Feed the typed search into the query a beat later, so every keystroke
  // doesn't fire its own request
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const loadOptions = async () => {
      const [cats, types] = await Promise.allSettled([
        expenseAPI.getCategories(),
        cashbookApi.getPaymentTypes()
      ]);
      if (cats.status === 'fulfilled') setCategories(cats.value.data.data || []);
      if (types.status === 'fulfilled') setPaymentTypes(types.value.data.data || []);
    };
    loadOptions();
  }, []);

  const fetchCashbook = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: LIMIT, sortBy, order };
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.types.length > 0) params.type = filters.types.join(',');
      if (filters.categoryId) params.categoryId = filters.categoryId;
      if (filters.paymentType) params.paymentType = filters.paymentType;
      if (filters.search) params.search = filters.search;

      const response = await cashbookApi.getCashbook(params);
      setEntries(response.data.data || []);
      setTotals(response.data.totals || null);
      setBalances(response.data.balances || null);
      setTotalPages(response.data.pagination?.pages || 1);
      setTotalEntries(response.data.pagination?.total || 0);
    } catch (err) {
      console.error('Error fetching cashbook:', err);
      setError(err.response?.data?.error || 'Failed to load the cashbook');
      setEntries([]);
      setTotals(null);
      setBalances(null);
    } finally {
      setLoading(false);
    }
  }, [filters, sortBy, order, page]);

  useEffect(() => {
    fetchCashbook();
  }, [fetchCashbook]);

  // Any filter or sort change puts us back on the first page, otherwise a
  // narrower result set can leave you stranded on an empty page
  const updateFilter = (patch) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const toggleType = (value) => {
    setPage(1);
    setFilters((prev) => ({
      ...prev,
      types: prev.types.includes(value)
        ? prev.types.filter((t) => t !== value)
        : [...prev.types, value]
    }));
  };

  const handleSort = (column) => {
    setPage(1);
    if (sortBy === column) {
      setOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(column);
      setOrder('DESC');
    }
  };

  const resetFilters = () => {
    setPage(1);
    setSearchInput('');
    setFilters(EMPTY_FILTERS);
  };

  const hasFilters =
    filters.startDate || filters.endDate || filters.types.length > 0 ||
    filters.categoryId || filters.paymentType || filters.search;

  // Class names are spelled out rather than interpolated — Tailwind only
  // generates classes it can find literally in the source
  const SortHeader = ({ column, label, align = 'left' }) => (
    <th className={`py-3 px-6 font-semibold text-gray-700 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => handleSort(column)}
        className={`inline-flex items-center gap-1 hover:text-[var(--color-text-accent)] transition ${
          sortBy === column ? 'text-[var(--color-text-accent)]' : ''
        }`}
      >
        {label}
        <ArrowUpDown size={14} className={sortBy === column ? 'opacity-100' : 'opacity-40'} />
        {sortBy === column && <span className="text-xs">{order === 'ASC' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );

  const SummaryCard = ({ icon, label, value, tone, count }) => (
    <div className="bg-white rounded-lg shadow-md p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-600">{label}</p>
        {icon}
      </div>
      <p className={`text-2xl font-bold mt-2 ${tone.text}`}>{formatCurrency(value)}</p>
      {count !== undefined && (
        <p className="text-xs text-gray-500 mt-1">{count} {count === 1 ? 'entry' : 'entries'}</p>
      )}
    </div>
  );

  // Balances are a position, not a flow, so they only follow the end date —
  // "as of" that day, or right now when no end date is set
  const BalanceCard = ({ icon, label, sublabel, value, parties, partyNoun, background }) => (
    <div className={`rounded-lg shadow-md p-5 ${background}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="text-xs text-white/80">{sublabel}</p>
        </div>
        {icon}
      </div>
      <p className="text-3xl font-bold mt-3 text-white">{formatCurrency(value)}</p>
      <p className="text-xs text-white/80 mt-1">
        across {parties ?? 0} {parties === 1 ? partyNoun : `${partyNoun}s`}
        {' · as of '}
        {filters.endDate ? formatDate(filters.endDate) : 'today'}
      </p>
    </div>
  );

  const net = totals?.net ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      {/* <div className="bg-white shadow-sm border-b border-gray-200 px-8 py-6">
        <h1 className="text-3xl font-bold text-gray-800">Cashbook</h1>
      </div> */}

      <div className="px-8 py-6">
        {/* Summary cards — these always reflect the active filters across the
            whole result set, never just the page on screen */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard
            icon={<ArrowDownCircle size={20} className="text-[var(--color-sale)]" />}
            label="Cash In — Sales"
            value={totals?.salesIn}
            count={totals?.counts?.sales}
            tone={{ text: 'text-[var(--color-sale)]' }}
          />
          <SummaryCard
            icon={<ArrowUpCircle size={20} className="text-[var(--color-purchase)]" />}
            label="Cash Out — Purchases"
            value={totals?.purchasesOut}
            count={totals?.counts?.purchases}
            tone={{ text: 'text-[var(--color-purchase)]' }}
          />
          <SummaryCard
            icon={<Receipt size={20} className="text-[var(--color-payment)]" />}
            label="Cash Out — Expenses"
            value={totals?.expensesOut}
            count={totals?.counts?.expenses}
            tone={{ text: 'text-[var(--color-payment)]' }}
          />
          <div className={`rounded-lg shadow-md p-5 ${net >= 0 ? 'bg-gray-800' : 'bg-red-600'}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white/90">Net Cash In-hand</p>
              <Wallet size={20} className="text-white/90" />
            </div>
            <p className="text-2xl font-bold mt-2 text-white">{formatCurrency(net)}</p>
            <p className="text-xs text-white/80 mt-1">
              {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'} in view
            </p>
          </div>
        </div>

        {/* Outstanding position. Unlike the cards above — which measure money
            that moved during the filtered period — these are balances that
            stand until someone pays, so they ignore every filter but the date. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <BalanceCard
            icon={<HandCoins size={24} className="text-white/90" />}
            label="Receivable"
            sublabel="Customers owe us"
            value={balances?.receivable}
            parties={balances?.customersOwing}
            partyNoun="customer"
            background="bg-[var(--color-sale)]"
          />
          <BalanceCard
            icon={<Landmark size={24} className="text-white/90" />}
            label="Payable"
            sublabel="We owe sellers"
            value={balances?.payable}
            parties={balances?.sellersOwed}
            partyNoun="seller"
            background="bg-[var(--color-purchase)]"
          />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => updateFilter({ startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-text-accent)] focus:border-[var(--color-text-accent)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => updateFilter({ endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-text-accent)] focus:border-[var(--color-text-accent)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expense Category</label>
              <select
                value={filters.categoryId}
                onChange={(e) => updateFilter({ categoryId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-text-accent)] focus:border-[var(--color-text-accent)]"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Type</label>
              <select
                value={filters.paymentType}
                onChange={(e) => updateFilter({ paymentType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-text-accent)] focus:border-[var(--color-text-accent)]"
              >
                <option value="">All payment types</option>
                {paymentTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Party, reference or note"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-text-accent)] focus:border-[var(--color-text-accent)]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="text-sm font-medium text-gray-700 mr-1">Show:</span>
            {TYPE_OPTIONS.map((opt) => {
              const active = filters.types.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => toggleType(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                    active
                      ? 'bg-[var(--color-selected)] text-white border-[var(--color-selected)]'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
            {filters.types.length === 0 && (
              <span className="text-xs text-gray-500">(all types)</span>
            )}

            {hasFilters && (
              <button
                onClick={resetFilters}
                className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50"
              >
                <X size={14} /> Reset filters
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
            {error}
          </div>
        )}

        {/* Entries */}
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)]"></div>
            <p className="mt-2 text-gray-600">Loading cashbook...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-600">
              {hasFilters
                ? 'No cash movements match these filters'
                : 'No cash movements recorded yet'}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100 border-b border-gray-200">
                    <tr>
                      <SortHeader className="py-3 px-6 text-left font-semibold text-gray-700" column="date" label="Date" />
                      <SortHeader column="type" label="Type" />
                      <SortHeader column="party" label="Party" />
                      <th className="py-3 px-6 text-left font-semibold text-gray-700">Reference</th>
                      <th className="py-3 px-6 text-left font-semibold text-gray-700">Note</th>
                      <th className="py-3 px-6 text-left font-semibold text-gray-700">Payment</th>
                      <SortHeader column="amount" label="Amount" align="right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {entries.map((entry) => (
                      <tr
                        key={`${entry.entry_type}-${entry.direction}-${entry.source_id}-${entry.reference}`}
                        className="hover:bg-gray-50 transition"
                      >
                        <td className="py-4 px-6 text-gray-700 whitespace-nowrap">
                          {formatDate(entry.entry_date)}
                        </td>
                        <td className="py-4 px-6">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${TYPE_BADGE[entry.entry_type]}`}>
                            {entry.entry_type}
                          </span>
                        </td>
                        <td className="py-4 px-6 font-semibold text-gray-800">{entry.party || '-'}</td>
                        <td className="py-4 px-6 text-gray-500 text-sm">{entry.reference || '-'}</td>
                        <td className="py-4 px-6 text-gray-600 text-sm max-w-xs truncate" title={entry.note}>
                          {entry.note || '-'}
                        </td>
                        <td className="py-4 px-6 text-gray-600 text-sm capitalize">
                          {entry.payment_type || '-'}
                        </td>
                        <td className={`py-4 px-6 text-right font-bold whitespace-nowrap ${
                          entry.direction === 'in' ? 'text-gray-800' : 'text-red-600'
                        }`}>
                          {entry.direction === 'in' ? '+' : '−'}{formatCurrency(entry.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {totalPages > 1 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Cashbook;
