import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as salesApi from '../../api/salesApi';
import { Pagination } from '../shared/UIComponents';
import { SkeletonTable } from '../shared/Skeleton';
import { ORDER_STATUSES, orderStatusMeta } from './orderStatuses';

const LIMIT = 15;

// Full list of sales orders, filterable by fulfilment status. The status
// lives in the URL (?status=pending) so the dashboard's status cards can
// deep-link straight to a filtered view.
function OrdersList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('status') || '';
  const status = ORDER_STATUSES.some((s) => s.status === requested) ? requested : '';
  const page = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);

  // The last response, tagged with the query it answers — anything else
  // means a fetch for the current status/page is still in flight.
  const queryKey = `${status}|${page}`;
  const [result, setResult] = useState({ key: null, orders: [], pages: 1, total: 0, error: '' });
  const loading = result.key !== queryKey;
  const { orders, pages, total, error } = result;

  useEffect(() => {
    let cancelled = false;
    salesApi.getAllSales(page, LIMIT, status)
      .then((res) => {
        if (cancelled) return;
        setResult({
          key: queryKey,
          orders: res.data.data || [],
          pages: res.data.pagination?.pages || 1,
          total: res.data.pagination?.total || 0,
          error: ''
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Error fetching orders:', err);
        setResult({ key: queryKey, orders: [], pages: 1, total: 0, error: err.response?.data?.error || 'Error loading orders' });
      });
    return () => { cancelled = true; };
  }, [status, page, queryKey]);

  // Changing status drops the page param, so a new filter starts on page 1
  const selectStatus = (next) => {
    setSearchParams(next ? { status: next } : {});
  };

  const setPage = (next) => {
    const params = {};
    if (status) params.status = status;
    if (next > 1) params.page = String(next);
    setSearchParams(params);
  };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(amount || 0);

  const tabs = [{ status: '', label: 'All Orders', accent: 'var(--color-accent)' }, ...ORDER_STATUSES];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-4 sm:px-8 py-4 sm:py-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Orders</h1>
        <p className="text-gray-600 mt-2">All sales orders by fulfilment status</p>
      </div>

      <div className="px-4 sm:px-8 py-6">
        {/* Status tabs — data-guest-allow: filtering is just viewing */}
        <div className="flex flex-wrap gap-2 mb-5">
          {tabs.map(({ status: s, label, icon: Icon, accent }) => {
            const active = s === status;
            return (
              <button
                key={s || 'all'}
                data-guest-allow="true"
                onClick={() => selectStatus(s)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold border transition ${
                  active ? 'text-white shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
                style={active ? { backgroundColor: accent, borderColor: accent } : undefined}
              >
                {Icon && <Icon className="w-4 h-4" style={active ? undefined : { color: accent }} />}
                {label}
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <p className="text-sm text-gray-500 mb-4">
            {loading ? 'Loading…' : `${total} order${total === 1 ? '' : 's'}`}
          </p>

          {error ? (
            <p className="text-red-600 font-semibold py-6 text-center">{error}</p>
          ) : loading ? (
            <SkeletonTable rows={6} columns={7} bordered />
          ) : orders.length === 0 ? (
            <p className="text-center py-10 text-gray-500">No orders found</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm text-gray-700 min-w-[720px]">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Order #</th>
                    <th className="px-4 py-3 text-left font-semibold">Customer</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    <th className="px-4 py-3 text-right font-semibold">Advance</th>
                    <th className="px-4 py-3 text-right font-semibold">Balance</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((order) => {
                    const meta = orderStatusMeta(order.status);
                    return (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold text-gray-800">{order.sale_no}</td>
                        <td className="px-4 py-3">
                          <div className="text-gray-800">{order.customer_name}</div>
                          {order.phone && <div className="text-xs text-gray-500">{order.phone}</div>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(order.total_amount)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(order.advance_paid)}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${Number(order.balance) > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                          {formatCurrency(order.balance)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                            style={{
                              color: `color-mix(in srgb, ${meta.accent} 70%, black)`,
                              backgroundColor: `color-mix(in srgb, ${meta.accent} 14%, white)`
                            }}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{new Date(order.created_at).toLocaleDateString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && pages > 1 && (
            <Pagination currentPage={page} totalPages={pages} onPageChange={setPage} />
          )}
        </div>
      </div>
    </div>
  );
}

export default OrdersList;
