import { useState } from 'react';
import { useAuth } from '../../contexts/AuthProvider';
import { useRTDB } from '../../hooks/useRTDB';
import { updateUserRoleAndCamp } from '../../services/userService';
import type { Role } from '../../contexts/AuthProvider';
import type { Camp } from '../../services/masterService';
import { Shield, Edit2, CheckCircle2, X } from 'lucide-react';

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: Role;
  campId?: string;
  createdAt: string;
}

export const UsersScreen = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'Admin';
  
  const { data: usersData, loading: usersLoading, error: usersError } = useRTDB<Record<string, Omit<UserProfile, 'uid'>>>('users');
  const { data: campsData } = useRTDB<Record<string, Camp>>('masters/camp');

  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role>('User');
  const [selectedCampId, setSelectedCampId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin) {
    return <div className="p-6 text-red-500 font-medium">Access Denied. Admins only.</div>;
  }

  const users = usersData ? Object.entries(usersData).map(([uid, val]) => ({ uid, ...val })) : [];
  users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const camps = campsData ? Object.entries(campsData).map(([id, val]) => ({ id, ...val })) : [];

  const handleEditClick = (user: UserProfile) => {
    setEditingUser(user);
    setSelectedRole(user.role || 'User');
    setSelectedCampId(user.campId || '');
    setError(null);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (selectedRole === 'Manager' && !selectedCampId) {
      setError('A Camp must be selected for Managers.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateUserRoleAndCamp(editingUser.uid, selectedRole, selectedRole === 'Manager' ? selectedCampId : undefined);
      setEditingUser(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (usersLoading) return <div className="p-6 text-slate-500">Loading...</div>;
  if (usersError) return <div className="p-6 text-red-500">Error: {usersError}</div>;

  return (
    <div className="flex flex-col h-full gap-4 relative">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
        <p className="text-slate-500">Manage system users, roles, and camp assignments.</p>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-auto h-full p-6">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Camp Assignment</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No users found.
                  </td>
                </tr>
              ) : users.map((user) => (
                <tr key={user.uid} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{user.name}</td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
                      user.role === 'Admin' ? 'bg-purple-50 text-purple-700' :
                      user.role === 'Manager' ? 'bg-blue-50 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      <Shield size={14} /> {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {user.role === 'Manager' ? (
                      user.campId ? <span className="font-medium">{user.campId}</span> : <span className="text-red-500">Unassigned</span>
                    ) : (
                      <span className="text-slate-400">N/A</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleEditClick(user)}
                      className="inline-flex p-1.5 text-slate-400 hover:text-primary rounded hover:bg-indigo-50 transition-colors"
                      title="Edit Role"
                    >
                      <Edit2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal Overlay */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-900">Edit User Role</h3>
              <button 
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveRole} className="p-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-900">{editingUser.name}</p>
                <p className="text-xs text-slate-500">{editingUser.email}</p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Role</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as Role)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="User">User</option>
                  <option value="Manager">Manager</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

              {selectedRole === 'Manager' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Assign Camp</label>
                  <select
                    required
                    value={selectedCampId}
                    onChange={(e) => setSelectedCampId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">-- Select a Camp --</option>
                    {camps.map(camp => (
                      <option key={camp.id} value={camp.id}>{camp.name} ({camp.code})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
