import { useRTDB } from '../../hooks/useRTDB';
import type { BloodGroup } from '../../services/masterService';
import { CheckCircle2, XCircle } from 'lucide-react';

export const BloodGroupList = () => {
  const { data, loading, error } = useRTDB<Record<string, BloodGroup>>('masters/blood_group');

  const groups = data ? Object.entries(data).map(([id, val]) => ({ id, ...val })) : [];
  
  // Sort by createdAt or just name
  groups.sort((a, b) => a.code.localeCompare(b.code));

  if (loading) return <div className="p-6 text-slate-500 dark:text-slate-400">Loading...</div>;
  if (error) return <div className="p-6 text-red-500">Error: {error}</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Blood Groups</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage blood group types and compatibility.</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-6">
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Compatible With</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    No blood groups found.
                  </td>
                </tr>
              ) : groups.map((bg) => (
                <tr key={bg.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">{bg.code}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{bg.name}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {bg.compatibleRecipients?.join(', ') || 'None'}
                  </td>
                  <td className="px-4 py-3">
                    {bg.active ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 size={14} /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        <XCircle size={14} /> Inactive
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
