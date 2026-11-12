import { useAuth } from '../../contexts/AuthProvider';

import { Activity, Clock, Calendar, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { requestService, type DonationRequest } from '../../services/requestService';
import { DonorHistoryView } from '../Users/DonorHistoryView';
import { ref, onValue, get } from 'firebase/database';
import { db } from '../../firebase';
import { Link } from 'react-router-dom';
import { HospitalDashboard } from '../Hospital/HospitalDashboard';
import { workflowService } from '../../services/workflowService';

export const DashboardScreen = () => {
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === 'Admin';
  
  const [requests, setRequests] = useState<DonationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCamp, setSelectedCamp] = useState<string>('all');
  const [activeMatch, setActiveMatch] = useState<{campId: string, requestId: string, expiresAt?: number} | null>(null);
  const [matchDetails, setMatchDetails] = useState<any>(null);
  const [responding, setResponding] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [responseSuccess, setResponseSuccess] = useState<string | null>(null);

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

    // ID-012: Fetch active donor match for Donor role
    if (profile?.role === 'Donor' && user?.uid) {
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

  useEffect(() => {
    if (activeMatch?.campId && activeMatch?.requestId) {
      const reqRef = ref(db, `transactions/donation_request/${activeMatch.campId}/${activeMatch.requestId}`);
      get(reqRef).then(snap => {
        if (snap.exists()) setMatchDetails(snap.val());
      }).catch(err => console.error("Error fetching match request details:", err));
    } else {
      setMatchDetails(null);
    }
  }, [activeMatch]);

  const handleRespond = async (response: 'accept' | 'decline') => {
    if (!activeMatch || !user?.uid) return;
    setResponding(true);
    setResponseError(null);
    setResponseSuccess(null);
    try {
      await workflowService.respondToMatch(activeMatch.campId, activeMatch.requestId, user.uid, response);
      if (response === 'accept') {
        setResponseSuccess("Thank you! You have accepted this donation match. Please report to the camp or coordinate with staff.");
      } else {
        setResponseSuccess("You have declined this match. Your match reservation has been released.");
      }
    } catch (err: any) {
      setResponseError(err.message || `Failed to ${response} match.`);
    } finally {
      setResponding(false);
    }
  };

  if (profile?.role === 'Hospital') {
    return <HospitalDashboard />;
  }

  if (profile?.role === 'Donor') {
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
        
        {!profile.bloodGroup && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-2xl">ΓÜá∩╕Å</span>
              <div>
                <h3 className="font-bold text-amber-900">Missing Blood Group</h3>
                <p className="text-sm text-amber-800">Please update your profile with your blood group to receive accurate donation matches.</p>
              </div>
            </div>
            <Link 
              to="/profile"
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              Update Profile
            </Link>
          </div>
        )}

        {activeMatch && (
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/70 dark:from-indigo-950/40 dark:to-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-indigo-200/60 dark:border-indigo-800/60">
              <div className="flex items-center gap-3.5">
                <div className="bg-indigo-600 p-3 rounded-xl text-white shadow-xs">
                  <Activity size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-indigo-950 dark:text-indigo-200">Active Match Request</h3>
                    <span className="px-2.5 py-0.5 text-xs font-semibold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 rounded-full border border-amber-200 dark:border-amber-800">
                      Response Required
                    </span>
                  </div>
                  <p className="text-indigo-800 dark:text-indigo-300 text-sm mt-0.5">
                    A patient at <span className="font-semibold">{matchDetails?.recipientHospitalId || 'Hospital'}</span> urgently needs your <span className="font-semibold">{matchDetails?.blood_groupId || profile.bloodGroup}</span> donation.
                  </p>
                </div>
              </div>
              <Link 
                to={`/requests/${activeMatch.campId}/${activeMatch.requestId}`}
                className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-200 underline flex items-center gap-1"
              >
                View Full Details &rarr;
              </Link>
            </div>

            {matchDetails && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 text-xs">
                <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-800/60">
                  <span className="text-slate-500 dark:text-slate-400 block uppercase font-medium">Patient</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{matchDetails.recipientName || 'Clinical Patient'}</span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-800/60">
                  <span className="text-slate-500 dark:text-slate-400 block uppercase font-medium">Component</span>
                  <span className="font-bold text-indigo-700 dark:text-indigo-400">{matchDetails.componentType || 'Whole Blood'}</span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-800/60">
                  <span className="text-slate-500 dark:text-slate-400 block uppercase font-medium">Camp</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{matchDetails.campId}</span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-800/60">
                  <span className="text-slate-500 dark:text-slate-400 block uppercase font-medium">Urgency</span>
                  <span className={`font-bold ${matchDetails.urgency === 'Critical' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {matchDetails.urgency || 'Routine'}
                  </span>
                </div>
              </div>
            )}

            {responseError && (
              <div className="my-3 p-3 bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 rounded-lg text-xs font-medium">
                {responseError}
              </div>
            )}

            {responseSuccess ? (
              <div className="mt-3 p-4 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300 rounded-xl text-sm font-medium flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                <span>{responseSuccess}</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleRespond('accept')}
                  disabled={responding}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 size={16} />
                  {responding ? 'Confirming...' : 'Accept & Confirm Donation'}
                </button>
                <button
                  type="button"
                  onClick={() => handleRespond('decline')}
                  disabled={responding}
                  className="px-5 py-2.5 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {responding ? 'Processing...' : 'Decline'}
                </button>
              </div>
            )}
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
