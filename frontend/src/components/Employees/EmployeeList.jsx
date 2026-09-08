import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Select, Alert, Table, Pagination, FilterBar } from '../shared/UIComponents';
import employeeAPI from '../../api/employeeApi';
import EmployeeForm from './EmployeeForm';

const EmployeeList = () => {
  const [employees, setEmployees] = useState([]);
  const [employeeTypes, setEmployeeTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const [filters, setFilters] = useState({
    search: '',
    typeId: '',
    status: '',
    startDate: '',
    endDate: '',
    sortBy: 'hire_date',
    order: 'DESC',
  });

  useEffect(() => {
    fetchEmployeeTypes();
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [filters, currentPage]);

  const fetchEmployeeTypes = async () => {
    try {
      const response = await employeeAPI.getTypes();
      setEmployeeTypes(response.data.data);
    } catch (err) {
      console.error('Error fetching employee types:', err);
    }
  };

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const response = await employeeAPI.getAll({
        ...filters,
        page: currentPage,
        limit: 10,
      });
      setEmployees(response.data.data);
      setTotalPages(response.data.pagination.pages);
    } catch (err) {
      setError('Failed to fetch employees');
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
      await employeeAPI.delete(id);
      setSuccess('Employee deleted successfully');
      fetchEmployees();
    } catch (err) {
      setError('Failed to delete employee');
    }
  };

  const handleEditClick = (employee) => {
    setEditingEmployee(employee);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingEmployee(null);
  };

  const handleFormSubmit = () => {
    setSuccess(editingEmployee ? 'Employee updated successfully' : 'Employee created successfully');
    handleFormClose();
    fetchEmployees();
  };

  const columns = [
    { key: 'first_name', label: 'Name', render: (val, row) => `${row.first_name} ${row.last_name}` },
    { key: 'type_name', label: 'Type' },
    { key: 'email', label: 'Email' },
    { key: 'salary', label: 'Salary', render: (val) => `PKR ${parseFloat(val).toFixed(2)}` },
    { key: 'status', label: 'Status', render: (val) => <span className={`px-2 py-1 rounded text-sm ${val === 'active' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'}`}>{val}</span> },
  ];

  const filterOptions = [
    { type: 'text', key: 'search', label: 'Search', value: filters.search },
    { type: 'select', key: 'typeId', label: 'Type', value: filters.typeId, options: employeeTypes },
    { type: 'select', key: 'status', label: 'Status', value: filters.status, options: [{ id: 'active', name: 'Active' }, { id: 'inactive', name: 'Inactive' }] },
    { type: 'date', key: 'startDate', label: 'From Date', value: filters.startDate },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Employees</h1>
        <Button variant="primary" onClick={() => setShowForm(true)}>
          Add Employee
        </Button>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}

      <FilterBar filters={filterOptions} onFilterChange={handleFilterChange} />

      <Card>
        <Table
          columns={columns}
          data={employees}
          loading={loading}
          onEdit={handleEditClick}
          onDelete={handleDelete}
        />
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </Card>

      <EmployeeForm
        isOpen={showForm}
        onClose={handleFormClose}
        onSubmit={handleFormSubmit}
        employee={editingEmployee}
        employeeTypes={employeeTypes}
      />
    </div>
  );
};

export default EmployeeList;
