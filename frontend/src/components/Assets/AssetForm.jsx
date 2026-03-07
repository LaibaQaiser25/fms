import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Select, Alert } from '../shared/UIComponents';
import { assetAPI } from '../../services/apiService';

const AssetForm = ({ isOpen, onClose, onSubmit, asset, categories }) => {
  const [formData, setFormData] = useState({
    categoryId: '',
    name: '',
    description: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    purchaseCost: '',
    currentValue: '',
    depreciationRate: '',
    status: 'active',
    location: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (asset) {
      setFormData({
        categoryId: asset.category_id,
        name: asset.name,
        description: asset.description || '',
        purchaseDate: asset.purchase_date,
        purchaseCost: asset.purchase_cost,
        currentValue: asset.current_value,
        depreciationRate: asset.depreciation_rate || '',
        status: asset.status,
        location: asset.location || '',
      });
    } else {
      setFormData({
        categoryId: '',
        name: '',
        description: '',
        purchaseDate: new Date().toISOString().split('T')[0],
        purchaseCost: '',
        currentValue: '',
        depreciationRate: '',
        status: 'active',
        location: '',
      });
    }
  }, [asset, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (asset) {
        await assetAPI.update(asset.id, formData);
      } else {
        await assetAPI.create(formData);
      }
      onSubmit();
      setFormData({
        categoryId: '',
        name: '',
        description: '',
        purchaseDate: new Date().toISOString().split('T')[0],
        purchaseCost: '',
        currentValue: '',
        depreciationRate: '',
        status: 'active',
        location: '',
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save asset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title={asset ? 'Edit Asset' : 'Add Asset'} onClose={onClose} size="lg">
      {error && <Alert type="error" message={error} />}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Category"
            name="categoryId"
            value={formData.categoryId}
            options={categories}
            onChange={handleChange}
            required
          />

          <Input
            label="Status"
            type="select"
            name="status"
            value={formData.status}
            onChange={handleChange}
            required
          />

          <Input
            label="Asset Name"
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Enter asset name"
            required
          />

          <Input
            label="Location"
            type="text"
            name="location"
            value={formData.location}
            onChange={handleChange}
            placeholder="Location"
          />

          <Input
            label="Purchase Date"
            type="date"
            name="purchaseDate"
            value={formData.purchaseDate}
            onChange={handleChange}
            required
          />

          <Input
            label="Purchase Cost"
            type="number"
            name="purchaseCost"
            value={formData.purchaseCost}
            onChange={handleChange}
            placeholder="Enter cost"
            step="0.01"
            required
          />

          <Input
            label="Current Value"
            type="number"
            name="currentValue"
            value={formData.currentValue}
            onChange={handleChange}
            placeholder="Enter current value"
            step="0.01"
          />

          <Input
            label="Depreciation Rate (%)"
            type="number"
            name="depreciationRate"
            value={formData.depreciationRate}
            onChange={handleChange}
            placeholder="Enter rate"
            step="0.01"
          />
        </div>

        <Input
          label="Description"
          type="text"
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Enter asset description"
        />

        <div className="flex gap-3 justify-end pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AssetForm;
