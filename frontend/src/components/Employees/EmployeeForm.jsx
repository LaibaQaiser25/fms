import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Select, Alert } from '../shared/UIComponents';
import { employeeAPI } from '../../services/apiService';

const EmployeeForm = ({ isOpen, onClose, onSubmit, employee, employeeTypes }) => {
  const [formData, setFormData] = useState({
    employeeTypeId: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    position: '',
    salary: '',
    hireDate: new Date().toISOString().split('T')[0],
    status: 'active',
    department: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (employee) {
      setFormData({
        employeeTypeId: employee.employee_type_id,
        firstName: employee.first_name,
        lastName: employee.last_name,
        email: employee.email || '',
        phone: employee.phone || '',
        position: employee.position || '',
        salary: employee.salary,
        hireDate: employee.hire_date,
        status: employee.status,
        department: employee.department || '',
      });
    } else {
      setFormData({
        employeeTypeId: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        position: '',
        salary: '',
        hireDate: new Date().toISOString().split('T')[0],
        status: 'active',
        department: '',
      });
    }
  }, [employee, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (employee) {
        await employeeAPI.update(employee.id, formData);
      } else {
        await employeeAPI.create(formData);
      }
      onSubmit();
      setFormData({
        employeeTypeId: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        position: '',
        salary: '',
        hireDate: new Date().toISOString().split('T')[0],
        status: 'active',
        department: '',
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save employee');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title={employee ? 'Edit Employee' : 'Add Employee'} onClose={onClose} size="lg">
      {error && <Alert type="error" message={error} />}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Employee Type"
            name="employeeTypeId"
            value={formData.employeeTypeId}
            options={employeeTypes}
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
            label="First Name"
            type="text"
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
            placeholder="Enter first name"
            required
          />

          <Input
            label="Last Name"
            type="text"
            name="lastName"
            value={formData.lastName}
            onChange={handleChange}
            placeholder="Enter last name"
            required
          />

          <Input
            label="Email"
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Enter email"
          />

          <Input
            label="Phone"
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            placeholder="Enter phone"
          />

          <Input
            label="Position"
            type="text"
            name="position"
            value={formData.position}
            onChange={handleChange}
            placeholder="Enter position"
          />

          <Input
            label="Salary"
            type="number"
            name="salary"
            value={formData.salary}
            onChange={handleChange}
            placeholder="Enter salary"
            step="0.01"
            required
          />

          <Input
            label="Hire Date"
            type="date"
            name="hireDate"
            value={formData.hireDate}
            onChange={handleChange}
            required
          />

          <Input
            label="Department"
            type="text"
            name="department"
            value={formData.department}
            onChange={handleChange}
            placeholder="Enter department"
          />
        </div>

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

export default EmployeeForm;
