// Shared by Cashbook.jsx and CashbookDetailModal.jsx

export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 })
    .format(Number(amount) || 0);

// entry_date arrives as a plain 'YYYY-MM-DD' string — parse the parts rather
// than new Date(str), which would treat it as UTC and shift the day
export const formatDate = (value) => {
  if (!value) return '-';
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
};

// The Cashbook's filters as query params — shared by the page and this modal
// so a card's details always match the figure on the card.
export const filterParams = (filters) => {
  const params = {};
  if (filters.startDate) params.startDate = filters.startDate;
  if (filters.endDate) params.endDate = filters.endDate;
  if (filters.types.length > 0) params.type = filters.types.join(',');
  if (filters.categoryId) params.categoryId = filters.categoryId;
  if (filters.paymentType) params.paymentType = filters.paymentType;
  if (filters.search) params.search = filters.search;
  return params;
};
