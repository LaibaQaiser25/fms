import React, { useState, useEffect } from 'react';
import { ClipboardList } from 'lucide-react';
import * as rawMaterialsApi from '../../api/rawMaterialsApi';
import ConsumptionLogModal from './ConsumptionLogModal';

function RawMaterialsList() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(10);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [showLogModal, setShowLogModal] = useState(false);

  useEffect(() => {
    fetchMaterials();
  }, [page]);

  const fetchMaterials = async () => {
    try {
      setLoading(true);
      const response = await rawMaterialsApi.getAllRawMaterials(page, limit);
      setMaterials(response.data.data || []);
      setTotal(response.data.pagination?.total || 0);
    } catch (error) {
      console.error('Error fetching raw materials:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const handleLogUsage = (material) => {
    setSelectedMaterial(material);
    setShowLogModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-8 py-6">
        <h1 className="text-3xl font-bold text-gray-800">Raw Materials</h1>
        <p className="text-gray-600 mt-2">Track raw material inventory and log production usage</p>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading raw materials...</p>
          </div>
        ) : materials.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-600">No raw materials yet — they're created automatically from raw-material purchases</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-6 text-left font-semibold text-gray-700">Name</th>
                    <th className="py-3 px-6 text-right font-semibold text-gray-700">Quantity</th>
                    <th className="py-3 px-6 text-right font-semibold text-gray-700">Unit Price (pkr)</th>
                    <th className="py-3 px-6 text-right font-semibold text-gray-700">Minimum Stock</th>
                    <th className="py-3 px-6 text-center font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {materials.map((material) => {
                    const isLow = Number(material.quantity) <= Number(material.minimum_stock);
                    return (
                      <tr key={material.id} className="hover:bg-gray-50 transition">
                        <td className="py-4 px-6">
                          <p className="font-semibold text-gray-800">{material.name}</p>
                          {material.category && <p className="text-xs text-gray-500">{material.category}</p>}
                        </td>
                        <td className={`py-4 px-6 text-right font-bold ${isLow ? 'text-red-600' : 'text-gray-700'}`}>
                          {Number(material.quantity).toLocaleString()} {material.unit || ''}
                          {isLow && (
                            <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                              Low Stock
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right text-gray-700">
                          {material.unit_price ? Number(material.unit_price).toLocaleString() : '-'}
                        </td>
                        <td className="py-4 px-6 text-right text-gray-700">
                          {Number(material.minimum_stock).toLocaleString()} {material.unit || ''}
                        </td>
                        <td className="py-4 px-6 text-center">
                          <button
                            onClick={() => handleLogUsage(material)}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition font-semibold text-sm"
                          >
                            <ClipboardList className="w-4 h-4" />
                            Log Usage
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} materials
                </p>
                <div className="flex gap-2">
                  <button
                    data-guest-allow="true"
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
                    data-guest-allow="true"
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

      {/* Consumption Log Modal */}
      {showLogModal && selectedMaterial && (
        <ConsumptionLogModal
          material={selectedMaterial}
          onClose={() => setShowLogModal(false)}
          onSuccess={fetchMaterials}
        />
      )}
    </div>
  );
}

export default RawMaterialsList;
