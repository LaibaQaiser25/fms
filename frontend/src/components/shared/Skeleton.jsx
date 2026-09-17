import React from 'react';

// The single primitive every skeleton below composes — a pulsing gray block.
// Pass Tailwind sizing/spacing classes via `className` to shape it.
export const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse rounded bg-gray-200 ${className}`} aria-hidden="true" />
);

export const SkeletonText = ({ width = 'w-full', height = 'h-4', className = '' }) => (
  <Skeleton className={`${width} ${height} ${className}`} />
);

export const SkeletonCircle = ({ size = 'w-10 h-10', className = '' }) => (
  <Skeleton className={`${size} rounded-full ${className}`} />
);

// Mimics the StatCard anatomy used on Analytics/dashboards: icon badge in
// one corner, a label, a big value, and a subtext/trend line underneath.
export const SkeletonStatCard = () => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonText width="w-20" height="h-3" />
        <SkeletonText width="w-28" height="h-6" />
      </div>
      <SkeletonCircle size="w-10 h-10 sm:w-11 sm:h-11" className="!rounded-xl shrink-0" />
    </div>
    <SkeletonText width="w-24" height="h-3" />
  </div>
);

// A row of N stat cards — the common "top row" shape shared by most pages.
export const SkeletonStatGrid = ({ count = 4, className = '' }) => (
  <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
    {Array.from({ length: count }).map((_, i) => <SkeletonStatCard key={i} />)}
  </div>
);

// Mimics a data table: a header row of column labels, then N body rows.
// `columns` can be a number (evenly-ish sized cells) or an array of width
// classes when a page's real columns are noticeably uneven (e.g. a wide
// "Name" column next to narrow numeric ones).
// `bordered` matches shared/UIComponents.jsx's `Table` — a plain
// `border border-gray-200` box with no shadow, for use inside something
// that already supplies its own white background (e.g. `Card`). The
// default (unbordered) shape is the free-standing white+shadow card most
// hand-rolled page tables already use.
export const SkeletonTable = ({ rows = 6, columns = 5, bordered = false }) => {
  const widths = Array.isArray(columns)
    ? columns
    : Array.from({ length: columns }).map((_, i) => (i === 0 ? 'w-10' : 'w-20'));

  return (
    <div className={bordered ? 'rounded-lg border border-gray-200 overflow-hidden' : 'bg-white rounded-lg shadow-md overflow-hidden'}>
      <div className={`border-b border-gray-200 px-4 sm:px-6 py-3 flex gap-6 ${bordered ? 'bg-gray-100' : ''}`}>
        {widths.map((w, i) => <SkeletonText key={i} width={w} height="h-3" />)}
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-4 sm:px-6 py-4 flex gap-6 items-center">
            {widths.map((w, c) => <SkeletonText key={c} width={w} height="h-3.5" />)}
          </div>
        ))}
      </div>
    </div>
  );
};

// A generic content card — form panels, detail/summary blocks, anything
// that's just a stack of label/value or label/input lines.
export const SkeletonCard = ({ lines = 4, title = true, className = '' }) => (
  <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
    {title && <SkeletonText width="w-40" height="h-5" className="mb-4" />}
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonText key={i} width={i % 3 === 0 ? 'w-2/3' : 'w-full'} height="h-4" />
      ))}
    </div>
  </div>
);

// A grid of card tiles — for pages that lay records out as cards instead of
// table rows (e.g. product/asset grids).
export const SkeletonCardGrid = ({ count = 6, columns = 'sm:grid-cols-2 lg:grid-cols-3' }) => (
  <div className={`grid grid-cols-1 ${columns} gap-4`}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-white rounded-lg shadow-md p-5 space-y-3">
        <SkeletonText width="w-2/3" height="h-4" />
        <SkeletonText width="w-1/3" height="h-3" />
        <div className="flex justify-between pt-2">
          <SkeletonText width="w-16" height="h-3" />
          <SkeletonText width="w-16" height="h-3" />
        </div>
      </div>
    ))}
  </div>
);

// The common full-page shape: header row + optional stat cards + a table.
// Most list-style pages (Stock, Products, Expenses, Assets, Employees,
// Ledgers) can render this straight from their `loading` branch. Pages with
// a different shape (a big form, a queue/kanban board) should compose the
// primitives above directly instead.
export const SkeletonPage = ({ statCards = 0, tableRows = 6, tableColumns = 5, showToolbar = true }) => (
  <div className="flex flex-col gap-6">
    {showToolbar && (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SkeletonText width="w-40" height="h-6" />
        <SkeletonText width="w-56" height="h-9" className="rounded-lg" />
      </div>
    )}
    {statCards > 0 && <SkeletonStatGrid count={statCards} />}
    <SkeletonTable rows={tableRows} columns={tableColumns} />
  </div>
);
