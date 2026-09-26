import { useState, useEffect } from 'react';
import { auditLogService } from '../../services/auditLogService';
import type { AuditLog } from '../../services/auditLogService';

export const AuditLogList = ({ transactionId }: { transactionId: string }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const data = await auditLogService.getLogsForTransaction(transactionId);
        setLogs(data);
      } catch (err: any) {
        console.error(err);
        setError('Failed to load audit logs. You may not have permission.');
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [transactionId]);

  if (loading) return <div className="p-4 text-slate-500 dark:text-slate-400">Loading audit logs...</div>;
  if (error) return <div className="p-4 text-rose-600 bg-rose-50 rounded">{error}</div>;

  return (
    <div className="space-y-4">
      {logs.length === 0 ? (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
          No audit logs found for this request.
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />
          <ul className="space-y-6 relative">
            {logs.map((log) => (
              <li key={log.id} className="relative pl-10">
                <div className={`absolute left-0 w-8 h-8 rounded-full flex items-center justify-center border-2 border-white ring-4 ring-slate-50 ${
                  log.status === 'Success' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                }`}>
                  {log.status === 'Success' ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{log.action}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>
                  
                  <div className="text-sm text-slate-600 mb-2">
                    <span className="font-medium">{log.actorName}</span> ({log.actorUid.slice(0,6)}...)
                  </div>
                  
                  {log.status === 'Success' ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                      {log.beforeStatus && <span>{log.beforeStatus} &rarr;</span>}
                      {log.afterStatus && <span className="font-medium text-indigo-600">{log.afterStatus}</span>}
                    </div>
                  ) : (
                    <div className="text-sm text-rose-600 mt-2 p-2 bg-rose-50 rounded border border-rose-100">
                      <span className="font-medium">Failed: </span>{log.failureReason || 'Permission Denied'}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
