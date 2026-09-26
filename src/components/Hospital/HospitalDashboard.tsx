import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthProvider';
import { hospitalService, type HospitalRequisitionRecord } from '../../services/hospitalService';
import { getCamps, getHospitals, type Camp, type Hospital } from '../../services/masterService';
import { HospitalRequisitionForm } from './HospitalRequisitionForm';
import { 
  Building2, 
  Droplet, 
  Activity, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Phone, 
  AlertCircle,
  Search
} from 'lucide-react';

export const HospitalDashboard: React.FC = () => {
  const { profile } = useAuth();
  const hospitalId = profile?.hospitalId;

  const [requisitions, setRequisitions] = useState<HospitalRequisitionRecord[]>([]);
  const [camps, setCamps] = useState<Record<string, Camp>>({});
  const [hospitals, setHospitals] = useState<Record<string, Hospital>>({});
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'critical' | 'completed'>('active');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isNewRequisitionOpen, setIsNewRequisitionOpen] = useState(false);
  const [cancelModalItem, setCancelModalItem] = useState<HospitalRequisitionRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [contactModalCamp, setContactModalCamp] = useState<{ campName: string; campCode: string } | null>(null);

  useEffect(() => {
    const fetchMasters = async () => {
      try {
        const [cData, hData] = await Promise.all([getCamps(), getHospitals()]);
        setCamps(cData);
        setHospitals(hData);
      } catch (err) {
        console.error('Failed to load masters:', err);
      }
    };
    fetchMasters();
  }, []);

  useEffect(() => {
    if (!hospitalId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = hospitalService.subscribeToRequisitions(hospitalId, (records) => {
      setRequisitions(records);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [hospitalId]);

  const currentHospital = hospitalId ? hospitals[hospitalId] : null;
  const hospitalName = currentHospital?.name || hospitalId || 'Hospital Medical Desk';

  // KPI Calculations
  const activeReqs = requisitions.filter(
    (r) => r.status !== 'Closed' && r.status !== 'Donated' && r.status !== 'Unfulfilled'
  );
  const totalUnitsSecured = requisitions.reduce((acc, curr) => acc + (curr.unitsSecured || 0), 0);
  const criticalCount = requisitions.filter(
    (r) => (r.urgency === 'Critical' || r.urgency === 'Urgent') && r.status !== 'Closed' && r.status !== 'Donated'
  ).length;
  const donatedCount = requisitions.filter((r) => r.status === 'Donated').length;

  // Filtered List
  const filteredRequisitions = requisitions.filter((req) => {
    if (activeFilter === 'active') {
      if (req.status === 'Closed' || req.status === 'Donated' || req.status === 'Unfulfilled') return false;
    } else if (activeFilter === 'critical') {
      if (req.urgency !== 'Critical') return false;
    } else if (activeFilter === 'completed') {
      if (req.status !== 'Donated' && req.status !== 'Closed') return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const patientMatch = req.recipientName?.toLowerCase().includes(q);
      const bgMatch = req.blood_groupId?.toLowerCase().includes(q);
      const compMatch = req.componentType?.toLowerCase().includes(q);
      const idMatch = req.id?.toLowerCase().includes(q);
      return patientMatch || bgMatch || compMatch || idMatch;
    }

    return true;
  });

  const handleCancelRequisition = async () => {
    if (!cancelModalItem || !cancelModalItem.campId) return;

    try {
      setCancelLoading(true);
      setCancelError(null);
      await hospitalService.cancelRequisition(
        cancelModalItem.campId,
        cancelModalItem.id,
        cancelReason.trim() || 'Cancelled by Hospital Desk'
      );
      setCancelModalItem(null);
      setCancelReason('');
    } catch (err: any) {
      setCancelError(err.message || 'Failed to cancel requisition.');
    } finally {
      setCancelLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Registered':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 animate-pulse" />
            Registered
          </span>
        );
      case 'Verified':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            Verified
          </span>
        );
      case 'Partially Matched':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-1.5 animate-pulse" />
            Partially Matched
          </span>
        );
      case 'Matched':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 size={12} className="mr-1 text-emerald-600" />
            Donors Matched
          </span>
        );
      case 'Donated':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border border-green-300 dark:border-green-700">
            <CheckCircle2 size={12} className="mr-1 text-green-600" />
            Units Collected / Ready
          </span>
        );
      case 'Closed':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            Closed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            {status}
          </span>
        );
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'Critical':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-300">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600 mr-1 animate-ping" />
            CRITICAL
          </span>
        );
      case 'Urgent':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300">
            URGENT
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            ROUTINE
          </span>
        );
    }
  };

  const getComponentBadge = (comp?: string) => {
    switch (comp) {
      case 'Platelets':
        return <span className="px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 rounded">Platelets (Apheresis)</span>;
      case 'Plasma':
        return <span className="px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 rounded">Fresh Frozen Plasma</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 rounded">Whole Blood</span>;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Hospital Identity & Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-md border border-slate-700 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 text-white">
              <Building2 size={36} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/30">
                  Hospital Portal
                </span>
                <span className="text-xs text-slate-400">ID: {hospitalId || 'N/A'}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">{hospitalName}</h1>
              <p className="text-slate-300 text-sm mt-0.5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Blood Bank & Camp Requisition Link Active
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsNewRequisitionOpen(true)}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg hover:shadow-red-600/30 transition-all flex items-center justify-center gap-2.5 shrink-0 text-sm sm:text-base"
          >
            <Droplet size={18} className="fill-white" />
            New Blood Requisition
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Orders</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-xl">
              <Activity size={20} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-slate-900 dark:text-white">{activeReqs.length}</span>
            <span className="text-xs text-slate-500 block mt-0.5">Under camp processing</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Units Secured</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-xl">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-slate-900 dark:text-white">{totalUnitsSecured}</span>
            <span className="text-xs text-slate-500 block mt-0.5">Matched from donors</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">High Urgency</span>
            <div className="p-2 bg-red-50 dark:bg-red-900/30 text-red-600 rounded-xl">
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-red-600 dark:text-red-400">{criticalCount}</span>
            <span className="text-xs text-slate-500 block mt-0.5">Urgent or ICU requisitions</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Collected / Ready</span>
            <div className="p-2 bg-green-50 dark:bg-green-900/30 text-green-600 rounded-xl">
              <Droplet size={20} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-slate-900 dark:text-white">{donatedCount}</span>
            <span className="text-xs text-slate-500 block mt-0.5">Ready for hospital transport</span>
          </div>
        </div>
      </div>

      {/* Requisitions Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Controls Bar */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {(['active', 'critical', 'completed', 'all'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeFilter === tab
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab === 'active' && 'Active Orders'}
                {tab === 'critical' && 'Critical Urgency'}
                {tab === 'completed' && 'Completed'}
                {tab === 'all' && 'All Requisitions'}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search patient, blood type, ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Requisitions List */}
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
            Connecting to real-time hospital requisition feed...
          </div>
        ) : filteredRequisitions.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Droplet size={40} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-base font-semibold text-slate-700 dark:text-slate-300">No requisitions found</p>
            <p className="text-sm text-slate-500 mt-1">
              {searchQuery ? 'Try matching a different query or clearing filters.' : 'Submit a new requisition to mobilize donors.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRequisitions.map((req) => {
              const camp = req.campId ? camps[req.campId] : null;
              const campName = camp?.name || req.campId || 'Regional Camp';
              const unitsNeeded = req.unitsNeeded || 1;
              const unitsSecured = req.unitsSecured || 0;
              const progressPct = Math.min(100, Math.round((unitsSecured / unitsNeeded) * 100));

              return (
                <div key={req.id} className="p-5 sm:p-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Info */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {getUrgencyBadge(req.urgency)}
                        {getStatusBadge(req.status)}
                        <span className="text-xs font-mono text-slate-400">#{req.id.slice(-8)}</span>
                        {req.createdAt && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(req.createdAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                          {req.recipientName}
                        </h3>
                        {req.patientId && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            {req.patientId}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-semibold text-slate-900 dark:text-slate-200">
                          Blood Group: <span className="text-red-600 font-bold">{req.blood_groupId}</span>
                        </span>
                        <span>•</span>
                        {getComponentBadge(req.componentType)}
                        <span>•</span>
                        <span>Camp: <span className="font-medium text-slate-800 dark:text-slate-200">{campName}</span></span>
                      </div>

                      {req.notes && (
                        <p className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60 max-w-2xl">
                          <span className="font-medium text-slate-700 dark:text-slate-300">Notes:</span> {req.notes}
                        </p>
                      )}
                    </div>

                    {/* Right: Progress & Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-6 lg:self-center shrink-0">
                      {/* Units Progress Bar */}
                      <div className="w-48 space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-600 dark:text-slate-400">Fulfillment</span>
                          <span className={unitsSecured >= unitsNeeded ? 'text-emerald-600 font-bold' : 'text-slate-900 dark:text-white'}>
                            {unitsSecured} / {unitsNeeded} Units ({progressPct}%)
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              unitsSecured >= unitsNeeded
                                ? 'bg-emerald-500'
                                : unitsSecured > 0
                                ? 'bg-indigo-500'
                                : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="flex items-center gap-2">
                        {req.status === 'Registered' && (
                          <button
                            onClick={() => {
                              setCancelModalItem(req);
                              setCancelReason('');
                              setCancelError(null);
                            }}
                            className="px-3.5 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl transition-colors"
                          >
                            Cancel Requisition
                          </button>
                        )}

                        {(req.status === 'Verified' || req.status === 'Partially Matched' || req.status === 'Matched') && (
                          <button
                            onClick={() => setContactModalCamp({ campName, campCode: req.campId || '' })}
                            className="px-3.5 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 rounded-xl transition-colors flex items-center gap-1.5"
                          >
                            <Phone size={13} />
                            Camp Desk
                          </button>
                        )}

                        {req.status === 'Donated' && (
                          <span className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-1">
                            <CheckCircle2 size={14} /> Ready for Transport
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Requisition Modal */}
      {isNewRequisitionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-3xl my-8">
            <HospitalRequisitionForm
              isModal
              onCancel={() => setIsNewRequisitionOpen(false)}
              onSuccess={() => setIsNewRequisitionOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Cancel Requisition Confirmation Modal */}
      {cancelModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 bg-red-50 dark:bg-red-950/30 rounded-xl">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Cancel Requisition?</h3>
                <p className="text-xs text-slate-500">Order #{cancelModalItem.id.slice(-8)}</p>
              </div>
            </div>

            {cancelError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{cancelError}</span>
              </div>
            )}

            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to cancel the blood requisition for{' '}
              <strong className="text-slate-900 dark:text-white">{cancelModalItem.recipientName}</strong>? This requisition will be closed.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Reason for Cancellation
              </label>
              <input
                type="text"
                placeholder="e.g. Patient stabilized / blood arranged internally"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCancelModalItem(null)}
                disabled={cancelLoading}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-xl"
              >
                Keep Requisition
              </button>
              <button
                type="button"
                onClick={handleCancelRequisition}
                disabled={cancelLoading}
                className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
              >
                {cancelLoading ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camp Coordinator Contact Modal */}
      {contactModalCamp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-indigo-600">
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl">
                <Phone size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Camp Coordination Desk</h3>
                <p className="text-xs text-slate-500">{contactModalCamp.campName}</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-2 text-sm">
              <div>
                <span className="text-xs text-slate-500 block">Camp Location / Code</span>
                <span className="font-semibold text-slate-900 dark:text-white">{contactModalCamp.campCode}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Fulfillment Hotline</span>
                <span className="font-mono font-bold text-indigo-600">+91 44 2745 2270 (Ext. 402)</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Camp Coordinator Desk Email</span>
                <span className="font-mono text-xs text-slate-700 dark:text-slate-300">coordinator@{contactModalCamp.campCode.toLowerCase()}.bloodexchange.org</span>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              To expedite transport, arrange cold-chain ambulance pickup, or report patient updates, please call the coordination hotline directly with your Requisition ID.
            </p>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setContactModalCamp(null)}
                className="px-4 py-2 text-sm font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
