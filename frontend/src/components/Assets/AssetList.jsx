import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Select, Alert, Table, Pagination, FilterBar } from '../shared/UIComponents';
import assetAPI from '../../api/assetApi';
import AssetForm from './AssetForm';

const AssetList = () => {
  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const [filters, setFilters] = useState({
    search: '',
    categoryId: '',
    status: '',
    startDate: '',
    endDate: '',
    sortBy: 'purchase_date',
    order: 'DESC',
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [filters, currentPage]);

  const fetchCategories = async () => {
    try {
      const response = await assetAPI.getCategories();
      setCategories(response.data.data);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const response = await assetAPI.getAll({
        ...filters,
        page: currentPage,
        limit: 10,
      });
      setAssets(response.data.data);
      setTotalPages(response.data.pagination.pages);
    } catch (err) {
      setError('Failed to fetch assets');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters({ ...filters, [key]: value });
    setCurrentPage(1);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure?')) return;
    try {
      await assetAPI.delete(id);
      setSuccess('Asset deleted successfully');
      fetchAssets();
    } catch (err) {
      setError('Failed to delete asset');
    }
  };

  const handleEditClick = (asset) => {
    setEditingAsset(asset);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingAsset(null);
  };

  const handleFormSubmit = () => {
    setSuccess(editingAsset ? 'Asset updated successfully' : 'Asset created successfully');
    handleFormClose();
    fetchAssets();
  };

  const columns = [
    { key: 'name', label: 'Asset Name' },
    { key: 'category_name', label: 'Category' },
    { key: 'purchase_cost', label: 'Purchase Cost', render: (val) => `PKR ${parseFloat(val).toFixed(2)}` },
    { key: 'current_value', label: 'Current Value', render: (val) => `PKR ${parseFloat(val).toFixed(2)}` },
    { key: 'status', label: 'Status', render: (val) => <span className={`px-2 py-1 rounded text-sm ${val === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{val}</span> },
  ];

  const filterOptions = [
    { type: 'text', key: 'search', label: 'Search', value: filters.search },
    { type: 'select', key: 'categoryId', label: 'Category', value: filters.categoryId, options: categories },
    { type: 'select', key: 'status', label: 'Status', value: filters.status, options: [{ id: 'active', name: 'Active' }, { id: 'inactive', name: 'Inactive' }] },
    { type: 'date', key: 'startDate', label: 'From Date', value: filters.startDate },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Assets</h1>
        <Button variant="primary" onClick={() => setShowForm(true)}>
          Add Asset
        </Button>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}

      <FilterBar filters={filterOptions} onFilterChange={handleFilterChange} />

      <Card>
        <Table
          columns={columns}
          data={assets}
          loading={loading}
          onEdit={handleEditClick}
          onDelete={handleDelete}
        />
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </Card>

      <AssetForm
        isOpen={showForm}
        onClose={handleFormClose}
        onSubmit={handleFormSubmit}
        asset={editingAsset}
        categories={categories}
      />
    </div>
  );
};

export default AssetList;
