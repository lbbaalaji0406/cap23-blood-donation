import { useAuth } from '../../contexts/AuthProvider';
import { useRTDB } from '../../hooks/useRTDB';
import { Activity, Clock, Calendar, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

export const DashboardScreen = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'Admin';
  
  // Later we'll fetch actual requests. For now just to show zero state handling.
  const { data: requestsData, loading } = useRTDB<Record<string, any>>('requests');
  const [selectedCamp, setSelectedCamp] = useState<string>('all');

  const requests = requestsData ? Object.entries(requestsData).map(([id, val]) => ({ id, ...val })) : [];
  
  // Filter by camp if manager, or if admin selected a camp
  const visibleRequests = requests.filter(req => {
    if (profile?.role === 'Manager') {
      return req.campId === profile.campId;
    }
    if (isAdmin && selectedCamp !== 'all') {
      return req.campId === selectedCamp;
    }
    return true;
  });

  const kpis = {
    total: visibleRequests.length,
    pending: visibleRequests.filter(r => ['Registered', 'Verified', 'Matched'].includes(r.status)).length,
    thisWeek: 0, // Mocked for zero state
    closed: visibleRequests.filter(r => r.status === 'Closed' || r.status === 'Donated').length,
  };

  if (loading) return <div className="p-6 text-slate-500">Loading dashboard...</div>;

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">
            {profile?.role === 'Manager' 
              ? `Overview for Camp: ${profile.campId || 'Unassigned'}` 
              : 'System-wide overview'}
          </p>
        </div>
        
        {isAdmin && (
          <div>
            <select
              value={selectedCamp}
              onChange={(e) => setSelectedCamp(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All Camps</option>
              {/* In a real app we'd fetch camp list here. Left simple for zero-state Day 2 scope. */}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Requests" value={kpis.total} icon={<Activity className="text-blue-500" />} />
        <KPICard title="Pending" value={kpis.pending} icon={<Clock className="text-amber-500" />} />
        <KPICard title="This Week" value={kpis.thisWeek} icon={<Calendar className="text-purple-500" />} />
        <KPICard title="Closed" value={kpis.closed} icon={<CheckCircle2 className="text-emerald-500" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-bold text-slate-900">
            Recent Donation Requests
          </div>
          <div className="p-8 text-center text-slate-500 text-sm">
            No donation requests found for this scope.
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 font-bold text-slate-900">
            Status Distribution
          </div>
          <div className="p-8 flex-1 flex items-center justify-center text-slate-500 text-sm">
            Not enough data to display chart.
          </div>
        </div>
      </div>
    </div>
  );
};

const KPICard = ({ title, value, icon }: { title: string, value: number, icon: React.ReactNode }) => (
  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
    <div className="p-3 bg-slate-50 rounded-lg">
      {icon}
    </div>
    <div>
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
    </div>
  </div>
);
