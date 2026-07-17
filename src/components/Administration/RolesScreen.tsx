import React, { useState, useEffect } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../../firebase';
import { Shield, Save, Loader2, AlertCircle } from 'lucide-react';

interface RoleData {
  perms: string[];
}

export const RolesScreen: React.FC = () => {
  const [roles, setRoles] = useState<Record<string, RoleData>>({});
  const [editingRoles, setEditingRoles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const rolesRef = ref(db, 'roles');
    const unsubscribe = onValue(rolesRef, (snapshot) => {
      const defaultRoles = {
        Admin: { perms: ['ALL'] },
        Manager: { perms: ['MANAGE_REQUESTS'] },
        User: { perms: ['VIEW_OWN'] }
      };

      const data = snapshot.exists() ? snapshot.val() : {};
      
      // Merge DB data with defaults to ensure all 3 roles always appear
      const mergedRoles: Record<string, RoleData> = { ...defaultRoles };
      if (data.Admin) mergedRoles.Admin = data.Admin;
      if (data.Manager) mergedRoles.Manager = data.Manager;
      if (data.User) mergedRoles.User = data.User;

      setRoles(mergedRoles);
      
      const initialEditing: Record<string, string> = {};
      Object.keys(mergedRoles).forEach(key => {
        initialEditing[key] = mergedRoles[key].perms?.join(', ') || '';
      });
      setEditingRoles(initialEditing);
      setLoading(false);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSave = async (roleKey: string) => {
    setSaving(true);
    setError(null);
    try {
      const permsString = editingRoles[roleKey] || '';
      const permsArray = permsString.split(',').map(s => s.trim()).filter(s => s.length > 0);
      
      await update(ref(db), {
        [`roles/${roleKey}/perms`]: permsArray
      });
    } catch (err: any) {
      setError(err.message || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-rose-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" />
            Role Management
          </h1>
          <p className="text-slate-500 mt-1">Manage permission sets for system roles.</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid gap-6">
        {Object.keys(roles).map((roleKey) => (
          <div key={roleKey} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">{roleKey}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Permissions (Comma-separated)
                </label>
                <textarea
                  value={editingRoles[roleKey] || ''}
                  onChange={(e) => setEditingRoles({ ...editingRoles, [roleKey]: e.target.value })}
                  className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  rows={3}
                  placeholder="e.g. MANAGE_USERS, VIEW_REPORTS"
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => handleSave(roleKey)}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Permissions
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
