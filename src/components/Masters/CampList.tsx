import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthProvider';
import { useRTDB } from '../../hooks/useRTDB';
import type { Camp } from '../../services/masterService';
import { deleteCamp } from '../../services/masterService';
import { Plus, Edit2, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';

export const CampList = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'Admin';
  const { data, loading, error } = useRTDB<Record<string, Camp>>('masters/camp');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const camps = data ? Object.entries(data).map(([id, val]) => ({ id, ...val })) : [];
  
  camps.sort((a, b) => a.name.localeCompare(b.name));

  const handleDelete = async (code: string) => {
    if (!confirm(`Are you sure you want to delete camp ${code}?`)) return;
    setDeleteError(null);
    try {
      await deleteCamp(code);
    } catch (err: any) {
      setDeleteError(err.message);
    }
  };

  if (loading) return <div className="p-6 text-slate-500">Loading...</div>;
  if (error) return <div className="p-6 text-red-500">Error: {error}</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Camps</h2>
          <p className="text-sm text-slate-500">Manage blood donation camp locations.</p>
        </div>
        {isAdmin && (
          <Link
            to="new"
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition-colors text-sm font-medium"
          >
            <Plus size={18} />
            Add Camp
          </Link>
        )}
      </div>
      
      {deleteError && (
        <div className="px-6 py-4 bg-red-50 text-red-600 border-b border-red-100 text-sm font-medium">
          {deleteError}
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {camps.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3} className="px-4 py-8 text-center text-slate-500">
                    No camps found.
                  </td>
                </tr>
              ) : camps.map((camp) => (
                <tr key={camp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-900">{camp.code}</td>
                  <td className="px-4 py-3 text-slate-700">{camp.name}</td>
                  <td className="px-4 py-3">
                    {camp.active ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700">
                        <CheckCircle2 size={14} /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                        <XCircle size={14} /> Inactive
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right space-x-2">
                      <Link
                        to={`${camp.id}`}
                        className="inline-flex p-1.5 text-slate-400 hover:text-primary rounded hover:bg-indigo-50 transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </Link>
                      <button
                        onClick={() => handleDelete(camp.code)}
                        className="inline-flex p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
