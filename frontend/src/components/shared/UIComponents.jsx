import React from 'react';

export const Button = ({ type = 'button', variant = 'primary', size = 'md', className = '', children, ...props }) => {
  const baseStyles = 'font-semibold rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    success: 'bg-gray-700 hover:bg-gray-800 text-white',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      type={type}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export const Input = ({ label, error, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <input
        className={`border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-text-accent)] ${error ? 'border-red-500' : ''} ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
};

export const Select = ({ label, options, error, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <select
        className={`border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-text-accent)] ${error ? 'border-red-500' : ''} ${className}`}
        {...props}
      >
        <option value="">Select an option</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name || opt.type_name}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
};

export const Card = ({ title, children, className = '' }) => {
  return (
    <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
      {title && <h2 className="text-xl font-bold mb-4 text-gray-800">{title}</h2>}
      {children}
    </div>
  );
};

export const Modal = ({ isOpen, title, onClose, children, size = 'md' }) => {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-3xl',
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`bg-white rounded-lg shadow-lg ${sizes[size]} w-full mx-4 max-h-[85vh] flex flex-col`}>
        <div className="flex justify-between items-center p-6 border-b shrink-0">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">
            ×
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const Table = ({ columns, data, loading, onEdit, onDelete }) => {
  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (data.length === 0) {
    return <div className="text-center py-8 text-gray-500">No data found</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm text-gray-700">
        <thead className="bg-gray-100 border-b">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-6 py-3 text-left font-semibold">
                {col.label}
              </th>
            ))}
            <th className="px-6 py-3 text-left font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id} className="border-b hover:bg-gray-50">
              {columns.map((col) => (
                <td key={col.key} className="px-6 py-4">
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
              <td className="px-6 py-4 flex gap-2">
                <button
                  onClick={() => onEdit(row)}
                  className="text-[var(--color-text-accent)] hover:opacity-75 font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(row.id)}
                  className="text-red-600 hover:text-red-800 font-medium"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  const pages = [];
  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  // data-guest-allow: paging through a list is still just "viewing" — the
  // Layout-level guest click-blocker (see components/Layout.jsx) exempts
  // anything carrying this attribute.
  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <button
        data-guest-allow="true"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
      >
        Previous
      </button>

      {startPage > 1 && (
        <>
          <button data-guest-allow="true" onClick={() => onPageChange(1)} className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-100">
            1
          </button>
          {startPage > 2 && <span className="px-2">...</span>}
        </>
      )}

      {pages.map((page) => (
        <button
          key={page}
          data-guest-allow="true"
          onClick={() => onPageChange(page)}
          className={`px-3 py-1 border rounded ${currentPage === page ? 'bg-[var(--color-text-accent)] text-white border-[var(--color-text-accent)]' : 'border-gray-300 hover:bg-gray-100'}`}
        >
          {page}
        </button>
      ))}

      {endPage < totalPages && (
        <>
          {endPage < totalPages - 1 && <span className="px-2">...</span>}
          <button data-guest-allow="true" onClick={() => onPageChange(totalPages)} className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-100">
            {totalPages}
          </button>
        </>
      )}

      <button
        data-guest-allow="true"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
      >
        Next
      </button>
    </div>
  );
};

export const FilterBar = ({ filters, onFilterChange, onSearch }) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filters.map((filter) => {
          if (filter.type === 'text') {
            return (
              <Input
                key={filter.key}
                type="text"
                label={filter.label}
                placeholder={filter.label}
                value={filter.value}
                onChange={(e) => onFilterChange(filter.key, e.target.value)}
              />
            );
          } else if (filter.type === 'date') {
            return (
              <Input
                key={filter.key}
                type="date"
                label={filter.label}
                value={filter.value}
                onChange={(e) => onFilterChange(filter.key, e.target.value)}
              />
            );
          } else if (filter.type === 'select') {
            return (
              <Select
                key={filter.key}
                label={filter.label}
                value={filter.value}
                options={filter.options}
                onChange={(e) => onFilterChange(filter.key, e.target.value)}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
};

export const Alert = ({ type = 'info', message, onClose }) => {
  const colors = {
    success: 'bg-gray-100 text-gray-900 border-gray-400',
    error: 'bg-red-100 text-red-800 border-red-400',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-400',
    info: 'bg-red-50 text-red-900 border-red-200',
  };

  return (
    <div className={`border ${colors[type]} rounded p-4 mb-4 flex justify-between items-center`}>
      <span>{message}</span>
      {onClose && (
        <button data-guest-allow="true" onClick={onClose} className="font-bold text-lg">
          ×
        </button>
      )}
    </div>
  );
};
