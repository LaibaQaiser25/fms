import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Select, Alert, Modal } from '../shared/UIComponents';
import { useAuth } from '../../context/AuthContext';
import * as usersApi from '../../api/usersApi';

const ROLE_OPTIONS = [
  { id: 'Owner', name: 'Owner' },
  { id: 'Manager', name: 'Manager' },
  { id: 'Guest', name: 'Guest' },
];

export default function Privacy() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [createForm, setCreateForm] = useState({ username: '', email: '', password: '', role: '' });
  const [creating, setCreating] = useState(false);

  const [ownPasswordForm, setOwnPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [changingOwnPassword, setChangingOwnPassword] = useState(false);

  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ username: '', email: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const [passwordTargetUser, setPasswordTargetUser] = useState(null);
  const [newUserPassword, setNewUserPassword] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await usersApi.getAllUsers();
      setUsers(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  // The logged-in Owner manages their own password through the dedicated
  // card above, not through the "other users" table.
  const otherUsers = users.filter((u) => u.id !== user?.id);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!createForm.username || !createForm.email || !createForm.password || !createForm.role) {
      setError('All fields are required to create a user');
      return;
    }
    setCreating(true);
    try {
      await usersApi.createUser(createForm);
      setSuccess(`User "${createForm.username}" created successfully`);
      setCreateForm({ username: '', email: '', password: '', role: '' });
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleChangeOwnPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const { currentPassword, newPassword, confirmPassword } = ownPasswordForm;
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All password fields are required');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }
    setChangingOwnPassword(true);
    try {
      await usersApi.changeOwnPassword({ currentPassword, newPassword });
      setSuccess('Your password was changed successfully');
      setOwnPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setChangingOwnPassword(false);
    }
  };

  const openEditModal = (u) => {
    setEditingUser(u);
    setEditForm({ username: u.username, email: u.email });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!editForm.username || !editForm.email) {
      setError('Username and email are required');
      return;
    }
    setSavingEdit(true);
    try {
      await usersApi.updateUser(editingUser.id, editForm);
      setSuccess(`Updated "${editForm.username}"`);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user');
    } finally {
      setSavingEdit(false);
    }
  };

  const openPasswordModal = (u) => {
    setPasswordTargetUser(u);
    setNewUserPassword('');
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!newUserPassword || newUserPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setSettingPassword(true);
    try {
      await usersApi.setUserPassword(passwordTargetUser.id, newUserPassword);
      setSuccess(`Password reset for "${passwordTargetUser.username}"`);
      setPasswordTargetUser(null);
      setNewUserPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set password');
    } finally {
      setSettingPassword(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Privacy</h1>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card title="Change Your Password">
          <form onSubmit={handleChangeOwnPassword} className="flex flex-col gap-4">
            <Input
              type="password"
              label="Current Password"
              value={ownPasswordForm.currentPassword}
              onChange={(e) => setOwnPasswordForm({ ...ownPasswordForm, currentPassword: e.target.value })}
            />
            <Input
              type="password"
              label="New Password"
              value={ownPasswordForm.newPassword}
              onChange={(e) => setOwnPasswordForm({ ...ownPasswordForm, newPassword: e.target.value })}
            />
            <Input
              type="password"
              label="Confirm New Password"
              value={ownPasswordForm.confirmPassword}
              onChange={(e) => setOwnPasswordForm({ ...ownPasswordForm, confirmPassword: e.target.value })}
            />
            <Button type="submit" variant="primary" disabled={changingOwnPassword}>
              {changingOwnPassword ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </Card>

        <Card title="Create New User">
          <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
            <Input
              label="Username"
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
            />
            <Input
              type="email"
              label="Email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
            />
            <Input
              type="password"
              label="Password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            />
            <Select
              label="Role"
              value={createForm.role}
              options={ROLE_OPTIONS}
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
            />
            <Button type="submit" variant="success" disabled={creating}>
              {creating ? 'Creating...' : 'Create User'}
            </Button>
          </form>
        </Card>
      </div>

      <Card title="Manage Users">
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : otherUsers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No other users yet</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm text-gray-700">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold">Username</th>
                  <th className="px-6 py-3 text-left font-semibold">Email</th>
                  <th className="px-6 py-3 text-left font-semibold">Role</th>
                  <th className="px-6 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {otherUsers.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4">{u.username}</td>
                    <td className="px-6 py-4">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded text-xs font-semibold bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]">{u.role}</span>
                    </td>
                    <td className="px-6 py-4 flex gap-3">
                      <button onClick={() => openEditModal(u)} className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] font-medium">
                        Edit
                      </button>
                      <button onClick={() => openPasswordModal(u)} className="text-orange-600 hover:text-orange-800 font-medium">
                        Reset Password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal isOpen={!!editingUser} title={`Edit ${editingUser?.username || ''}`} onClose={() => setEditingUser(null)}>
        <form onSubmit={handleSaveEdit} className="flex flex-col gap-4">
          <Input
            label="Username"
            value={editForm.username}
            onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
          />
          <Input
            type="email"
            label="Email"
            value={editForm.email}
            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
          />
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={savingEdit}>
              {savingEdit ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!passwordTargetUser}
        title={`Reset Password for ${passwordTargetUser?.username || ''}`}
        onClose={() => setPasswordTargetUser(null)}
      >
        <form onSubmit={handleSetPassword} className="flex flex-col gap-4">
          <Input
            type="password"
            label="New Password"
            value={newUserPassword}
            onChange={(e) => setNewUserPassword(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={() => setPasswordTargetUser(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={settingPassword}>
              {settingPassword ? 'Saving...' : 'Set Password'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
