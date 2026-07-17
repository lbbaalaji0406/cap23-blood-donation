import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthProvider';
import { reportService } from '../../services/reportService';
import type { SummaryStats } from '../../services/reportService';
import type { DonationRequest } from '../../services/requestService';
import type { AuditLog } from '../../services/auditLogService';
import { getCamps } from '../../services/masterService';
import type { Camp } from '../../services/masterService';

export const ReportsDashboard = () => {
  const { profile } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'summary' | 'status' | 'activity'>('summary');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  
  const [camps, setCamps] = useState<Record<string, Camp>>({});
  const [selectedCamp, setSelectedCamp] = useState(''); // Empty means all camps (for Admin)

  // Report Data
  const [summaryData, setSummaryData] = useState<SummaryStats | null>(null);
  const [statusData, setStatusData] = useState<DonationRequest[] | null>(null);
  const [activityData, setActivityData] = useState<AuditLog[] | null>(null);

  useEffect(() => {
    if (profile?.role === 'Admin') {
      getCamps().then(setCamps);
    }
  }, [profile]);

  const generateReport = async () => {
    if (!profile) return;
    setLoading(true);
    setError('');
    
    try {
      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime() + 86399999; // end of day
      
      const filterCampId = profile.role === 'Manager' ? profile.campId : selectedCamp;
      
      if (activeTab === 'summary') {
        const data = await reportService.getSummaryReport(profile.role, filterCampId || '', startMs, endMs);
        setSummaryData(data);
      } else if (activeTab === 'status') {
        const data = await reportService.getStatusReport(profile.role, filterCampId || '');
        setStatusData(data);
      } else if (activeTab === 'activity') {
        const data = await reportService.getActivityReport(profile.role, filterCampId || '', startMs, endMs);
        setActivityData(data);
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to generate report. You may lack permissions for this scope.');
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = () => {
    if (activeTab === 'summary' && summaryData) {
      const rows = [
        { Metric: 'Total Requests', Value: summaryData.totalRequests },
        { Metric: 'Total Units Needed', Value: summaryData.totalUnitsNeeded },
        ...Object.entries(summaryData.statusCounts).map(([k, v]) => ({ Metric: `Status: ${k}`, Value: v })),
        ...Object.entries(summaryData.bloodGroupCounts).map(([k, v]) => ({ Metric: `Blood Group: ${k}`, Value: v })),
      ];
      reportService.exportToExcel(rows, 'Summary_Report');
    } else if (activeTab === 'status' && statusData) {
      const rows = statusData.map(r => ({
        ID: r.id,
        Camp: camps[r.campId || '']?.name || r.campId,
        Recipient: r.recipientName,
        BloodGroup: r.blood_groupId,
        Units: r.unitsNeeded,
        Status: r.status,
        Created: new Date(r.createdAt).toLocaleString()
      }));
      reportService.exportToExcel(rows, 'Status_Report');
    } else if (activeTab === 'activity' && activityData) {
      const rows = activityData.map(a => ({
        RequestID: a.transactionId,
        Date: new Date(a.createdAt).toLocaleString(),
        Actor: a.actorName,
        Action: a.action,
        Outcome: a.outcome,
        Details: a.outcome === 'Success' ? `${a.beforeStatus || ''} -> ${a.afterStatus || ''}` : a.failureReason
      }));
      reportService.exportToExcel(rows, 'Activity_Report');
    }
  };

  const exportPDF = () => {
    if (activeTab === 'summary' && summaryData) {
      const data = [
        ['Total Requests', summaryData.totalRequests.toString()],
        ['Total Units Needed', summaryData.totalUnitsNeeded.toString()],
        ...Object.entries(summaryData.statusCounts).map(([k, v]) => [`Status: ${k}`, v.toString()]),
        ...Object.entries(summaryData.bloodGroupCounts).map(([k, v]) => [`Blood Group: ${k}`, v.toString()]),
      ];
      reportService.exportToPDF('Summary Report', ['Metric', 'Value'], data, 'Summary_Report');
    } else if (activeTab === 'status' && statusData) {
      const data = statusData.map(r => [
        r.id.slice(-6),
        camps[r.campId || '']?.name || r.campId || '',
        r.recipientName,
        r.blood_groupId,
        r.unitsNeeded.toString(),
        r.status,
        new Date(r.createdAt).toLocaleDateString()
      ]);
      reportService.exportToPDF('Status Report (Open Requests)', ['ID', 'Camp', 'Recipient', 'BG', 'Units', 'Status', 'Date'], data, 'Status_Report');
    } else if (activeTab === 'activity' && activityData) {
      const data = activityData.map(a => [
        a.transactionId.slice(-6),
        new Date(a.createdAt).toLocaleString(),
        a.actorName,
        a.action,
        a.outcome,
        a.outcome === 'Success' ? `${a.beforeStatus || ''} -> ${a.afterStatus || ''}` : (a.failureReason || '')
      ]);
      reportService.exportToPDF('Activity Audit Trail', ['Req ID', 'Date', 'Actor', 'Action', 'Outcome', 'Details'], data, 'Activity_Report');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
          <p className="text-slate-600 mt-1">Generate and export system reports</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-wrap gap-4 items-end mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Report Type</label>
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as any)}
              className="rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border py-2 px-3"
            >
              <option value="summary">Summary Report</option>
              <option value="status">Status Report (Open)</option>
              <option value="activity">Activity Audit Trail</option>
            </select>
          </div>

          {activeTab !== 'status' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border py-2 px-3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border py-2 px-3"
                />
              </div>
            </>
          )}

          {profile?.role === 'Admin' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Camp Filter</label>
              <select
                value={selectedCamp}
                onChange={(e) => setSelectedCamp(e.target.value)}
                className="rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border py-2 px-3"
              >
                <option value="">All Camps (System-wide)</option>
                {Object.entries(camps).map(([id, c]) => (
                  <option key={id} value={id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={generateReport}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 shadow-sm disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>

        {error && <div className="mb-4 text-rose-600 bg-rose-50 p-3 rounded">{error}</div>}

        {/* Action Bar for Exports */}
        <div className="flex gap-3 mb-4 justify-end">
          <button
            onClick={exportExcel}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 shadow-sm"
          >
            Export to Excel
          </button>
          <button
            onClick={exportPDF}
            className="px-4 py-2 bg-rose-600 text-white text-sm font-medium rounded-md hover:bg-rose-700 shadow-sm"
          >
            Export to PDF
          </button>
        </div>

        {/* Report Previews */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 min-h-[300px]">
          
          {activeTab === 'summary' && summaryData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded shadow-sm border border-slate-200">
                <div className="text-sm text-slate-500">Total Requests</div>
                <div className="text-2xl font-bold text-slate-900">{summaryData.totalRequests}</div>
              </div>
              <div className="bg-white p-4 rounded shadow-sm border border-slate-200">
                <div className="text-sm text-slate-500">Total Units Needed</div>
                <div className="text-2xl font-bold text-slate-900">{summaryData.totalUnitsNeeded}</div>
              </div>
            </div>
          )}

          {activeTab === 'status' && statusData && (
             <table className="min-w-full divide-y divide-slate-200 mt-4">
               <thead>
                 <tr>
                   <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase">ID</th>
                   <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase">Camp</th>
                   <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                 </tr>
               </thead>
               <tbody className="bg-white divide-y divide-slate-200">
                 {statusData.map(r => (
                   <tr key={r.id}>
                     <td className="px-3 py-4 whitespace-nowrap text-sm text-slate-900">{r.id.slice(-6)}</td>
                     <td className="px-3 py-4 whitespace-nowrap text-sm text-slate-500">{camps[r.campId||'']?.name || r.campId}</td>
                     <td className="px-3 py-4 whitespace-nowrap text-sm text-slate-500">{r.status}</td>
                   </tr>
                 ))}
               </tbody>
             </table>
          )}

          {activeTab === 'activity' && activityData && (
             <table className="min-w-full divide-y divide-slate-200 mt-4">
               <thead>
                 <tr>
                   <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                   <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase">Action</th>
                   <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase">Outcome</th>
                 </tr>
               </thead>
               <tbody className="bg-white divide-y divide-slate-200">
                 {activityData.map(a => (
                   <tr key={a.id}>
                     <td className="px-3 py-4 whitespace-nowrap text-sm text-slate-500">{new Date(a.createdAt).toLocaleString()}</td>
                     <td className="px-3 py-4 whitespace-nowrap text-sm text-slate-900">{a.action}</td>
                     <td className={`px-3 py-4 whitespace-nowrap text-sm font-medium ${a.outcome === 'Success' ? 'text-emerald-600' : 'text-rose-600'}`}>{a.outcome}</td>
                   </tr>
                 ))}
               </tbody>
             </table>
          )}

          {!summaryData && !statusData && !activityData && (
            <div className="flex items-center justify-center h-full text-slate-500">
              Select parameters and click Generate Report.
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
