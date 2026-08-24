import React, { useState } from 'react';
import { X } from 'lucide-react';
import * as rawMaterialConsumptionApi from '../../api/rawMaterialConsumptionApi';
import { useAuth } from '../../context/AuthContext';

function ConsumptionLogModal({ material, onClose, onSuccess }) {
  const { user } = useAuth();
  const [quantityUsed, setQuantityUsed] = useState('');
  const [consumptionDate, setConsumptionDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const availableQuantity = Number(material.quantity) || 0;

  const handleSubmit = async () => {
    const qty = Number(quantityUsed) || 0;
    if (qty <= 0) {
      return alert('⚠️ Please enter a valid quantity');
    }
    if (qty > availableQuantity) {
      return alert(`⚠️ Quantity used exceeds available stock of ${availableQuantity} ${material.unit || ''}`);
    }

    setLoading(true);
    try {
      await rawMaterialConsumptionApi.logConsumption({
        raw_material_id: material.id,
        quantity_used: qty,
        user_id: user?.id || null,
        logged_by_name: user?.username || null,
        notes: notes || null,
        consumption_date: consumptionDate
      });

      alert('✅ Consumption logged successfully!');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('❌ Error:', err.response?.data || err.message);
      alert('❌ Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex z-50 overflow-y-auto p-4">
      <div className="bg-white w-full max-w-md h-fit max-h-screen flex flex-col mx-auto my-auto rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white z-10">
          <h2 className="text-xl font-extrabold text-gray-800">Log Usage</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 flex-1 overflow-y-auto">
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-lg font-bold text-gray-800">{material.name}</p>
            <p className="text-sm text-gray-600">
              Available: <span className="font-semibold">{availableQuantity} {material.unit || ''}</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Quantity Used *</label>
            <input
              type="number"
              placeholder="Enter quantity"
              value={quantityUsed}
              onChange={(e) => setQuantityUsed(e.target.value)}
              onWheel={(e) => e.target.blur()}
              className={inp}
              min="0"
              max={availableQuantity}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={consumptionDate}
              onChange={(e) => setConsumptionDate(e.target.value)}
              className={inp}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Used for production batch #..."
              className={`${inp} resize-none`}
              rows="2"
            />
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleSubmit}
            disabled={loading || !quantityUsed}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-sm hover:bg-blue-700 transition disabled:bg-gray-300"
          >
            {loading ? 'Saving...' : 'Log Usage'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConsumptionLogModal;
