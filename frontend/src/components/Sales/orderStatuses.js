import { Clock, CheckCircle2, Truck, XCircle } from 'lucide-react';

// Sale fulfilment statuses (sales.status). 'ready' — production finished,
// awaiting delivery — is presented to users as "Completed".
export const ORDER_STATUSES = [
  { status: 'pending', label: 'Pending', icon: Clock, accent: '#eab308' },
  { status: 'ready', label: 'Completed', icon: CheckCircle2, accent: 'var(--color-success)' },
  { status: 'delivered', label: 'Delivered', icon: Truck, accent: 'var(--color-gatepass)' },
  { status: 'cancelled', label: 'Cancelled', icon: XCircle, accent: '#9ca3af' }
];

export const orderStatusMeta = (status) =>
  ORDER_STATUSES.find((s) => s.status === status) || { status, label: status, accent: '#9ca3af' };
