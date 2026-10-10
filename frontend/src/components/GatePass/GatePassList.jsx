import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import * as gatePassApi from '../../api/gatePassApi';
import { Pagination } from '../shared/UIComponents';
import { SkeletonTable } from '../shared/Skeleton';
import GatePassModal from './GatePassModal';

const LIMIT = 15;

const KINDS = [
  { kind: '', label: 'All Gate Passes' },
  { kind: 'order', label: 'Outward (Orders)', icon: ArrowUpRight },
  { kind: 'received', label: 'Inward (Received)', icon: ArrowDownLeft },
];

// History of generated gate passes. Kind, search and page live in the URL
// (same as OrdersList) so a filtered view can be linked/bookmarked; clicking
// a row reopens the pass in GatePassModal to reprint or save as PDF.
function GatePassList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedKind = searchParams.get('kind') || '';
  const kind = KINDS.some((k) => k.kind === requestedKind) ? requestedKind : '';
  const search = searchParams.get('search') || '';
  const page = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);

  const [searchInput, setSearchInput] = useState(search);
  const [viewId, setViewId] = useState(null);

  const queryKey = `${kind}|${search}|${page}`;
  const [result, setResult] = useState({ key: null, passes: [], pages: 1, total: 0, error: '' });
  const loading = result.key !== queryKey;
  const { passes, pages, total, error } = result;

  const updateParams = (next) => {
    const merged = { kind, search, page: 1, ...next };
    const params = {};
    if (merged.kind) params.kind = merged.kind;
    if (merged.search) params.search = merged.search;
    if (merged.page > 1) params.page = String(merged.page);
    setSearchParams(params);
  };

  // Debounce typing into the URL; a new search starts on page 1
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === search) return;
    const t = setTimeout(() => updateParams({ search: trimmed }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    gatePassApi.getAllGatePasses({ page, limit: LIMIT, kind: kind || undefined, search: search || undefined })
      .then((res) => {
        if (cancelled) return;
        setResult({
          key: queryKey,
          passes: res.data.data || [],
          pages: res.data.pagination?.pages || 1,
          total: res.data.pagination?.total || 0,
          error: ''
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Error fetching gate passes:', err);
        setResult({ key: queryKey, passes: [], pages: 1, total: 0, error: err.response?.data?.error || 'Error loading gate passes' });
      });
    return () => { cancelled = true; };
  }, [kind, search, page, queryKey]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-4 sm:px-8 py-4 sm:py-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gate Passes</h1>
        <p className="text-gray-600 mt-2">Previously generated gate passes — click one to view, print or save as PDF</p>
      </div>

      <div className="px-4 sm:px-8 py-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
          {/* Kind tabs — data-guest-allow: filtering is just viewing */}
          <div className="flex flex-wrap gap-2">
            {KINDS.map(({ kind: k, label, icon: Icon }) => {
              const active = k === kind;
              return (
                <button
                  key={k || 'all'}
                  data-guest-allow="true"
                  onClick={() => updateParams({ kind: k })}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold border transition ${
                    active ? 'text-white shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  style={active ? { backgroundColor: 'var(--color-gatepass)', borderColor: 'var(--color-gatepass)' } : undefined}
                >
                  {Icon && <Icon className="w-4 h-4" style={active ? undefined : { color: 'var(--color-gatepass)' }} />}
                  {label}
                </button>
              );
            })}
          </div>

          <div className="relative lg:ml-auto lg:w-80">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-accent)]"
              placeholder="Search pass no, party, phone, vehicle…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <p className="text-sm text-gray-500 mb-4">
            {loading ? 'Loading…' : `${total} gate pass${total === 1 ? '' : 'es'}`}
          </p>

          {error ? (
            <p className="text-red-600 font-semibold py-6 text-center">{error}</p>
          ) : loading ? (
            <SkeletonTable rows={6} columns={7} bordered />
          ) : passes.length === 0 ? (
            <p className="text-center py-10 text-gray-500">No gate passes found</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm text-gray-700 min-w-[760px]">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Gate Pass #</th>
                    <th className="px-4 py-3 text-left font-semibold">Type</th>
                    <th className="px-4 py-3 text-left font-semibold">Party</th>
                    <th className="px-4 py-3 text-left font-semibold">Sale / Purchase #</th>
                    <th className="px-4 py-3 text-left font-semibold">Vehicle / Driver</th>
                    <th className="px-4 py-3 text-left font-semibold">Issued by</th>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {passes.map((gp) => (
                    <tr
                      key={gp.id}
                      onClick={() => setViewId(gp.id)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-semibold text-gray-800">{gp.gate_pass_no}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={{
                            color: 'color-mix(in srgb, var(--color-gatepass) 70%, black)',
                            backgroundColor: 'color-mix(in srgb, var(--color-gatepass) 14%, white)'
                          }}
                        >
                          {gp.kind === 'order' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                          {gp.kind === 'order' ? 'Outward' : 'Inward'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-800">{gp.party_name}</div>
                        {gp.phone && <div className="text-xs text-gray-500">{gp.phone}</div>}
                      </td>
                      <td className="px-4 py-3">{gp.ref_no || '—'}</td>
                      <td className="px-4 py-3">
                        <div>{gp.vehicle_no || '—'}</div>
                        {gp.driver_name && <div className="text-xs text-gray-500">{gp.driver_name}</div>}
                      </td>
                      <td className="px-4 py-3">{gp.created_by_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(gp.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && pages > 1 && (
            <Pagination currentPage={page} totalPages={pages} onPageChange={(p) => updateParams({ page: p })} />
          )}
        </div>
      </div>

      {viewId && <GatePassModal passId={viewId} onClose={() => setViewId(null)} />}
    </div>
  );
}

export default GatePassList;
