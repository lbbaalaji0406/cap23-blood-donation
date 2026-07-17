import { useAuth } from '../../contexts/AuthProvider';

import { Activity, Clock, Calendar, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { requestService, type DonationRequest } from '../../services/requestService';
import { DonorHistoryView } from '../Users/DonorHistoryView';
import { ref, onValue } from 'firebase/database';
import { db } from '../../firebase';
import { Link } from 'react-router-dom';

export const DashboardScreen = () => {
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === 'Admin';
  
  const [requests, setRequests] = useState<DonationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCamp, setSelectedCamp] = useState<string>('all');
  const [activeMatch, setActiveMatch] = useState<{campId: string, requestId: string} | null>(null);

  useEffect(() => {
    const fetchDashboardRequests = async () => {
      try {
        if (!profile) return;
        if (profile.role === 'Manager' && !profile.campId) return;
        
        console.log(`[Dashboard] Firing RTDB query for role=${profile.role}, targetPath=/transactions/donation_request/${profile.role === 'Manager' ? profile.campId : 'Admin-Loop'}`);
        
        setLoading(true);
        const data = await requestService.getAllRequests(profile.role, profile.campId);
        setRequests(data);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardRequests();

    // ID-012: Fetch active donor match for User role
    if (profile?.role === 'User' && user?.uid) {
      const matchRef = ref(db, `active_donor_matches/${user.uid}`);
      const unsubscribe = onValue(matchRef, (snapshot) => {
        if (snapshot.exists()) {
          setActiveMatch(snapshot.val());
        } else {
          setActiveMatch(null);
        }
      });
      return () => unsubscribe();
    }
  }, [profile, user]);

  if (profile?.role === 'User') {
    return (
      <div className="flex flex-col h-full gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Donor Dashboard</h1>
            <p className="text-slate-500">Track your life-saving impact.</p>
          </div>
          <div className="bg-white px-4 py-3 rounded-lg shadow-sm border border-slate-200 flex flex-col items-end">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Your Donor ID</span>
            <span className="font-mono font-medium text-primary text-sm bg-indigo-50 px-2 py-1 rounded selection:bg-indigo-200">
              {user?.uid}
            </span>
          </div>
        </div>
        
        {activeMatch && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-indigo-100 p-3 rounded-full text-indigo-600">
                <Activity size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-indigo-900">You have an Active Match!</h3>
                <p className="text-indigo-700 text-sm">A patient currently needs your specific blood type.</p>
              </div>
            </div>
            <Link 
              to={`/requests/${activeMatch.campId}/${activeMatch.requestId}`}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              View Request Details
            </Link>
          </div>
        )}

        <DonorHistoryView targetDonorUid={user?.uid} />
      </div>
    );
  }
  
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
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 font-bold text-slate-900">
            Recent Donation Requests
          </div>
          {visibleRequests.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No donation requests found for this scope.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 flex-1 overflow-auto max-h-[300px]">
              {visibleRequests.slice(0, 5).map(req => (
                <div key={req.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                  <div>
                    <div className="font-medium text-slate-900">{req.recipientName}</div>
                    <div className="text-xs text-slate-500">{req.blood_groupId} • {req.unitsNeeded} units</div>
                  </div>
                  <div className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">
                    {req.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 font-bold text-slate-900">
            Status Distribution
          </div>
          {visibleRequests.length === 0 ? (
            <div className="p-8 flex-1 flex items-center justify-center text-slate-500 text-sm">
              Not enough data to display chart.
            </div>
          ) : (
            <div className="p-6 flex-1 flex flex-col gap-4">
              {Object.entries(
                visibleRequests.reduce((acc, req) => {
                  acc[req.status] = (acc[req.status] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              ).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{status}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full" 
                        style={{ width: `${(count / visibleRequests.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-slate-500 w-6 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
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
