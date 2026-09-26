import { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthProvider';
import { useRTDB } from '../../hooks/useRTDB';
import { updateUserRoleAndCamp } from '../../services/userService';
import type { Role } from '../../contexts/AuthProvider';
import type { Camp, Hospital } from '../../services/masterService';
import { Shield, Edit2, X, Plus } from 'lucide-react';
import { orderByChild, equalTo } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: Role;
  campId?: string;
  hospitalId?: string;
  createdAt: string;
}

const EligibilityBadge = ({ uid }: { uid: string }) => {
  const { data, loading } = useRTDB<{ lastDonationDate: number }>(`donor_eligibility/${uid}`);

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
        <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-50 dark:bg-slate-800/500"></span>
        Unknown
      </span>
    );
  }

  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  // If data doesn't exist, donor has never donated, so they are eligible.
  const isEligible = !data || !data.lastDonationDate || (Date.now() - data.lastDonationDate >= ninetyDaysMs);

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
      isEligible ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800' 
                 : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800'
    }`}>
      <span className={`w-2 h-2 rounded-full ${isEligible ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
      {isEligible ? 'Eligible' : 'Cooldown'}
    </span>
  );
};

export const UsersScreen = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'Admin';
  const isManager = profile?.role === 'Manager';
  const hasAccess = isAdmin || isManager;
  
  const queryConstraints = useMemo(() => {
    if (isManager && profile?.campId) {
      return [orderByChild('campId'), equalTo(profile.campId)];
    }
    return [];
  }, [isManager, profile?.campId]);

  const { data: usersData, loading: usersLoading, error: usersError } = useRTDB<Record<string, Omit<UserProfile, 'uid'>>>('users', queryConstraints as any);
  const { data: campsData } = useRTDB<Record<string, Camp>>('masters/camp');
  const { data: hospitalsData } = useRTDB<Record<string, Hospital>>('masters/hospital');

  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role>('Donor' as Role);
  const [selectedCampId, setSelectedCampId] = useState<string>('');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('');
  
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<Role>('Donor' as Role);
  const [addCampId, setAddCampId] = useState<string>('');
  const [addHospitalId, setAddHospitalId] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasAccess) {
    return <div className="p-6 text-red-500 font-medium">Access Denied. Admins and Managers only.</div>;
  }

  const users = usersData ? Object.entries(usersData).map(([uid, val]) => ({ uid, ...val })) : [];
  users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const camps = campsData ? Object.entries(campsData).map(([id, val]) => ({ id, ...val })) : [];
  const hospitals = hospitalsData ? Object.entries(hospitalsData).map(([id, val]) => ({ id, ...val })) : [];

  const handleEditClick = (user: UserProfile) => {
    setEditingUser(user);
    setSelectedRole(user.role || 'Donor');
    setSelectedCampId(user.campId || '');
    setSelectedHospitalId(user.hospitalId || '');
    setError(null);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (selectedRole === 'Manager' && !selectedCampId) {
      setError('A Camp must be selected for Managers.');
      return;
    }
    if (selectedRole === 'Hospital' && !selectedHospitalId) {
      setError('A Hospital must be selected for Hospital users.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateUserRoleAndCamp(
        editingUser.uid,
        selectedRole,
        selectedRole === 'Manager' ? selectedCampId : undefined,
        selectedRole === 'Hospital' ? selectedHospitalId : undefined
      );
      setEditingUser(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addRole === 'Manager' && !addCampId) {
      setError('A Camp must be selected for Managers.');
      return;
    }
    if (addRole === 'Hospital' && !addHospitalId) {
      setError('A Hospital must be selected for Hospital users.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const createUserByAdmin = httpsCallable(functions, 'createUserByAdmin');
      const targetCampId = isManager ? profile?.campId : addCampId;
      await createUserByAdmin({
        name: addName,
        email: addEmail,
        role: addRole,
        campId: (addRole === 'Manager' || addRole === 'Donor') ? targetCampId : undefined,
        hospitalId: addRole === 'Hospital' ? addHospitalId : undefined
      });
      setIsAddingUser(false);
      setAddName('');
      setAddEmail('');
      setAddRole('Donor' as Role);
      setAddCampId('');
      setAddHospitalId('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (usersLoading) return <div className="p-6 text-slate-500 dark:text-slate-400">Loading...</div>;
  if (usersError) return <div className="p-6 text-red-500">Error: {usersError}</div>;

  return (
    <div className="flex flex-col h-full gap-4 relative">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">User Management</h1>
          <p className="text-slate-500 dark:text-slate-400">
            {isAdmin ? 'Manage system users, roles, and camp assignments.' : 'Manage Donors in your camp.'}
          </p>
        </div>
        <button
          onClick={() => { setIsAddingUser(true); setError(null); }}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition-colors font-medium text-sm"
        >
          <Plus size={18} />
          Add User
        </button>
      </div>

      <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-auto h-full p-6">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Eligibility</th>
                <th className="px-4 py-3 font-medium">Camp Assignment</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    No users found.
                  </td>
                </tr>
              ) : users.map((user) => (
                <tr key={user.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    <div>{user.name}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5" title="User UID">{user.uid}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
                      user.role === 'Admin' ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                      user.role === 'Manager' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      user.role === 'Hospital' ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' :
                      'bg-slate-100 text-slate-700 dark:text-slate-300 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      <Shield size={14} /> {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <EligibilityBadge uid={user.uid} />
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {user.role === 'Manager' ? (
                      user.campId ? <span className="font-medium">{user.campId}</span> : <span className="text-red-500">Unassigned</span>
                    ) : user.role === 'Hospital' ? (
                      user.hospitalId ? <span className="font-medium text-teal-700 dark:text-teal-400">Hosp: {user.hospitalId}</span> : <span className="text-red-500">Unassigned</span>
                    ) : (
                      <span className="text-slate-400">N/A</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleEditClick(user)}
                        className="inline-flex p-1.5 text-slate-400 hover:text-primary rounded hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors"
                        title="Edit Role"
                      >
                        <Edit2 size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal Overlay */}
      {editingUser && isAdmin && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Edit User Role</h3>
              <button 
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-700 dark:text-slate-300"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveRole} className="p-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{editingUser.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{editingUser.email}</p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Role</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as Role)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="Donor">Donor</option>
                  <option value="Manager">Manager</option>
                  <option value="Hospital">Hospital</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

              {selectedRole === 'Manager' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Assign Camp</label>
                  <select
                    required
                    value={selectedCampId}
                    onChange={(e) => setSelectedCampId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">-- Select a Camp --</option>
                    {camps.map(camp => (
                      <option key={camp.id} value={camp.id}>{camp.name} ({camp.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedRole === 'Hospital' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Affiliated Hospital</label>
                  <select
                    required
                    value={selectedHospitalId}
                    onChange={(e) => setSelectedHospitalId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">-- Select a Hospital --</option>
                    {hospitals.map(hosp => (
                      <option key={hosp.id} value={hosp.id}>{hosp.name} ({hosp.code})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
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

      {/* Add User Modal */}
      {isAddingUser && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Add New User</h3>
              <button 
                onClick={() => setIsAddingUser(false)}
                className="text-slate-400 hover:text-slate-700 dark:text-slate-300"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAddUser} className="p-4 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
                <input
                  type="text"
                  required
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Full Name"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                <input
                  type="email"
                  required
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="user@example.com"
                />
              </div>

              {isAdmin && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Role</label>
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value as Role)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="Donor">Donor</option>
                    <option value="Manager">Manager</option>
                    <option value="Hospital">Hospital</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
              )}

              {isAdmin && addRole === 'Manager' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Assign Camp</label>
                  <select
                    required
                    value={addCampId}
                    onChange={(e) => setAddCampId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">-- Select a Camp --</option>
                    {camps.map(camp => (
                      <option key={camp.id} value={camp.id}>{camp.name} ({camp.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {isAdmin && addRole === 'Hospital' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Affiliated Hospital</label>
                  <select
                    required
                    value={addHospitalId}
                    onChange={(e) => setAddHospitalId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">-- Select a Hospital --</option>
                    {hospitals.map(hosp => (
                      <option key={hosp.id} value={hosp.id}>{hosp.name} ({hosp.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {isManager && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  You are adding a Donor to your currently assigned camp.
                </p>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddingUser(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
