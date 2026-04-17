import React, { useState, useEffect } from 'react';
import { CheckCircle, Clock, AlertCircle, Trash2 } from 'lucide-react';
import * as productionApi from '../api/productionApi';

function ProductionList() {
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(10);

  useEffect(() => {
    fetchData();
  }, [filter, page]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [queueRes, statsRes] = await Promise.all([
        productionApi.getQueue(filter || '', page, limit),
        productionApi.getStats()
      ]);
      setQueue(queueRes.data.data || []);
      setTotal(queueRes.data.pagination?.total || 0);
      setStats(statsRes.data.data);
    } catch (error) {
      console.error('Error fetching production data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await productionApi.updateProductionStatus(id, newStatus);
      fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'low':
        return 'bg-green-100 text-green-800';
      case 'normal':
        return 'bg-yellow-100 text-yellow-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'urgent':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5" />;
      case 'in_progress':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return null;
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-8 py-6">
        <h1 className="text-3xl font-bold text-gray-800">Production Queue</h1>
        <p className="text-gray-600 mt-2">Manage production orders and track progress</p>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="px-8 py-6 grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
            <p className="text-gray-600 text-sm font-semibold">Pending</p>
            <p className="text-3xl font-bold text-gray-800">{stats.pending_count}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
            <p className="text-gray-600 text-sm font-semibold">In Progress</p>
            <p className="text-3xl font-bold text-gray-800">{stats.in_progress_count}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
            <p className="text-gray-600 text-sm font-semibold">Completed</p>
            <p className="text-3xl font-bold text-gray-800">{stats.completed_count}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-gray-500">
            <p className="text-gray-600 text-sm font-semibold">Total</p>
            <p className="text-3xl font-bold text-gray-800">{stats.total_count}</p>
          </div>
        </div>
      )}

      {/* Filter Buttons */}
      <div className="px-8 py-4 bg-white border-b border-gray-200">
        <div className="flex gap-2">
          {['pending', 'in_progress', 'completed', 'cancelled'].map(status => (
            <button
              key={status}
              onClick={() => {
                setFilter(status);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                filter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              {status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
          <button
            onClick={() => {
              setFilter('');
              setPage(1);
            }}
            className={`px-4 py-2 rounded-lg font-semibold transition ${
              filter === ''
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading production queue...</p>
          </div>
        ) : queue.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-600">No production orders in this category</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-6 text-left font-semibold text-gray-700">#</th>
                    <th className="py-3 px-6 text-left font-semibold text-gray-700">Product</th>
                    <th className="py-3 px-6 text-center font-semibold text-gray-700">Quantity</th>
                    <th className="py-3 px-6 text-left font-semibold text-gray-700">Priority</th>
                    <th className="py-3 px-6 text-left font-semibold text-gray-700">Status</th>
                    <th className="py-3 px-6 text-left font-semibold text-gray-700">Created</th>
                    <th className="py-3 px-6 text-center font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {queue.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition">
                      <td className="py-4 px-6 text-gray-700 font-semibold">{(page - 1) * limit + idx + 1}</td>
                      <td className="py-4 px-6">
                        <p className="font-semibold text-gray-800">{item.product_name}</p>
                        {item.notes && <p className="text-xs text-gray-600">{item.notes}</p>}
                      </td>
                      <td className="py-4 px-6 text-center text-gray-700 font-semibold">{item.required_quantity}</td>
                      <td className="py-4 px-6">
                        <span className={`px-3 py-1 rounded text-xs font-semibold ${getPriorityColor(item.priority)}`}>
                          {item.priority ? item.priority.charAt(0).toUpperCase() + item.priority.slice(1) : 'Normal'}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <select
                          value={item.status}
                          onChange={(e) => handleStatusChange(item.id, e.target.value)}
                          className={`px-3 py-1 rounded text-sm font-semibold border-0 cursor-pointer ${
                            item.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : item.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-800'
                              : item.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-600">
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-6 text-center">
                        {item.completed_at && (
                          <p className="text-xs text-green-600 font-semibold">
                            ✓ {new Date(item.completed_at).toLocaleDateString()}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} items
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 text-gray-700 font-semibold">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductionList;
