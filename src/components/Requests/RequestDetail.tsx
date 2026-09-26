import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { requestService } from '../../services/requestService';
import type { DonationRequest, RequestStatus } from '../../services/requestService';
import { getCamps, getHospitals, getBloodGroups, getCompatibleDonorGroups } from '../../services/masterService';
import type { Camp, Hospital, BloodGroup } from '../../services/masterService';
import { useAuth } from '../../contexts/AuthProvider';
import { workflowService } from '../../services/workflowService';
import { db } from '../../firebase';
import { ref, get } from 'firebase/database';

import { CommentsThread } from './CommentsThread';
import { AttachmentsList } from './AttachmentsList';
import { AuditLogList } from './AuditLogList';

const statusFlow = ['Registered', 'Verified', 'Matched', 'Donated', 'Closed'];
const unfulfilledState = 'Unfulfilled';

export const RequestDetail = () => {
  const { campId, id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  
  const [request, setRequest] = useState<DonationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [camps, setCamps] = useState<Record<string, Camp>>({});
  const [hospitals, setHospitals] = useState<Record<string, Hospital>>({});
  const [bloodGroups, setBloodGroups] = useState<Record<string, BloodGroup>>({});
  
  const [activeTab, setActiveTab] = useState<'details'|'comments'|'attachments'|'audit'>('details');

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [donorUidToMatch, setDonorUidToMatch] = useState('');
  const [showMatchPrompt, setShowMatchPrompt] = useState(false);
  
  const [showDonatedPrompt, setShowDonatedPrompt] = useState(false);
  const [donatedVolume, setDonatedVolume] = useState(1);
  const [matchedDonorProfile, setMatchedDonorProfile] = useState<any>(null);
  const [loadingDonor, setLoadingDonor] = useState(false);
  const [confirmedBloodGroup, setConfirmedBloodGroup] = useState('');

  const fetchAll = async () => {
    try {
      if (!id || !campId) return;
      const req = await requestService.getRequest(campId, id);
      if (!req) {
        setError('Donation Request not found.');
        setLoading(false);
        return;
      }

      const [cData, hData, bgData] = await Promise.all([
        getCamps(),
        getHospitals(),
        getBloodGroups()
      ]);
      
      setCamps(cData);
      setHospitals(hData);
      setBloodGroups(bgData);
      setRequest(req);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Access Denied or Failed to load request.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [id, campId]);

  const handleStatusChange = async (newStatus: RequestStatus) => {
    if (!request || !user || !profile || !campId) return;
    
    // Prevent skipping steps or reverse
    
    if (newStatus === 'Matched' && request.status === 'Verified') {
      setShowMatchPrompt(true);
      return;
    }

    if (newStatus === 'Donated' && request.status === 'Matched') {
      if (request.matchedDonorId) {
        setLoadingDonor(true);
        setShowDonatedPrompt(true);
        try {
          const snapshot = await get(ref(db, `users/${request.matchedDonorId}`));
          if (snapshot.exists()) {
            const data = snapshot.val();
            setMatchedDonorProfile(data);
            setConfirmedBloodGroup(data.bloodGroup || '');
          }
        } catch (err) {
          console.error("Failed to fetch donor profile", err);
        } finally {
          setLoadingDonor(false);
        }
      } else {
        setShowDonatedPrompt(true);
      }
      return;
    }

    if (newStatus === 'Unfulfilled' && profile.role !== 'Admin') {
      setError('Only Admins can mark a request as Unfulfilled.');
      return;
    }
    
    if (newStatus === 'Closed' && profile.role !== 'Admin') {
      setError('Only Admins can Close a request.');
      return;
    }

    setUpdatingStatus(true);
    setError('');
    try {
      await workflowService.updateStatus(
        campId,
        request.id,
        request.status,
        newStatus,
        user.uid,
        profile.name,
        request.matchedDonorId // Pass donor to clean up lock if needed
      );
      await fetchAll();
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const [matchWarning, setMatchWarning] = useState<string | null>(null);

  const handleMatchDonor = async (overrideWarning = false) => {
    if (!request || !user || !profile || !campId || !donorUidToMatch.trim()) return;
    
    if (!overrideWarning) {
      setUpdatingStatus(true);
      setError('');
      setMatchWarning(null);
      try {
        const donorSnap = await get(ref(db, `users/${donorUidToMatch.trim()}`));
        if (!donorSnap.exists()) {
          throw new Error('Donor profile not found.');
        }
        const donorData = donorSnap.val();
        if (donorData.role !== 'Donor') {
          throw new Error('User is not a Donor.');
        }

        const compatibleDonors = getCompatibleDonorGroups(request.blood_groupId);
        if (!donorData.bloodGroup || !compatibleDonors.includes(donorData.bloodGroup)) {
          throw new Error(`Donor's blood group (${bloodGroups[donorData.bloodGroup]?.name || 'Unknown'}) is physically INCOMPATIBLE with the recipient's required blood group (${bloodGroups[request.blood_groupId]?.name}).`);
        }

        if (!donorData.bloodGroupVerified) {
          setMatchWarning("WARNING: This donor's blood type is unverified. Proceed only if they can verify on-site.");
          setUpdatingStatus(false);
          return; // Stop and wait for user to accept warning
        }
      } catch (err: any) {
        setError(err.message || 'Validation failed.');
        setUpdatingStatus(false);
        return;
      }
    }

    setUpdatingStatus(true);
    setError('');
    setMatchWarning(null);
    try {
      await workflowService.matchDonor(
        campId,
        request.id,
        donorUidToMatch.trim(),
        user.uid,
        profile.name
      );
      setShowMatchPrompt(false);
      setDonorUidToMatch('');
      await fetchAll();
    } catch (err: any) {
      setError(err.message || 'Failed to match donor.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleConfirmDonated = async () => {
    if (!request || !user || !profile || !campId) return;
    setUpdatingStatus(true);
    setError('');
    try {
      await workflowService.updateStatus(
        campId,
        request.id,
        request.status,
        'Donated',
        request.matchedDonorId,
        donatedVolume,
        confirmedBloodGroup
      );
      setShowDonatedPrompt(false);
      await fetchAll();
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;

  if (error && !request) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
        <button onClick={() => navigate('/requests')} className="text-indigo-600 hover:text-indigo-900 font-medium">
          &larr; Back to Requests
        </button>
      </div>
    );
  }

  if (!request) return null;

  const currentIndex = statusFlow.indexOf(request.status);
  const isUnfulfilled = request.status === unfulfilledState;
  const isTerminal = request.status === 'Closed' || isUnfulfilled;

  // Determine allowed next states based on current state
  const allowedNextStates: RequestStatus[] = [];
  if (!isTerminal) {
    if (request.status === 'Registered') {
      allowedNextStates.push('Verified');
      if (profile?.role === 'Admin') allowedNextStates.push('Unfulfilled');
    } else if (request.status === 'Verified') {
      allowedNextStates.push('Matched');
      if (profile?.role === 'Admin') allowedNextStates.push('Unfulfilled');
    } else if (request.status === 'Matched') {
      allowedNextStates.push('Donated');
    } else if (request.status === 'Donated') {
      if (profile?.role === 'Admin') allowedNextStates.push('Closed');
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/requests')} className="text-slate-400 hover:text-slate-600">
            &larr; Back
          </button>
          <h1 className="text-2xl font-bold text-slate-900">Request {request.id.slice(-6)}</h1>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-rose-600 text-sm font-medium">{error}</span>}
          
          {!isTerminal && allowedNextStates.length > 0 && (
            <select
              disabled={updatingStatus}
              onChange={(e) => handleStatusChange(e.target.value as RequestStatus)}
              value={request.status}
              className="px-4 py-2 border border-indigo-300 text-indigo-700 font-medium rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-indigo-50 cursor-pointer disabled:opacity-50"
            >
              <option value={request.status} disabled>
                {updatingStatus ? 'Updating...' : `Transition from ${request.status}...`}
              </option>
              {allowedNextStates.map(st => (
                <option key={st} value={st}>
                  {`Mark as ${st}`}
                </option>
              ))}
            </select>
          )}

          <button 
            onClick={() => navigate(`/requests/${request.campId}/${request.id}/edit`)}
            disabled={isTerminal}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm shadow-sm disabled:opacity-50"
            title={isTerminal ? 'Cannot edit terminal request' : ''}
          >
            Edit Fields
          </button>
        </div>
      </div>

      {/* Match Donor Prompt Modal/Inline */}
      {showMatchPrompt && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-6 shadow-sm mt-4">
          <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-300 mb-2">Match Donor</h3>
          <p className="text-sm text-indigo-700 dark:text-indigo-400 mb-4">
            Enter the Donor UID you wish to match to this request. This action is atomic and prevents double-booking.
          </p>
          
          {matchWarning && (
            <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 p-4 rounded-lg shadow-sm">
              <p className="font-bold mb-2 flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                {matchWarning}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <input 
              type="text" 
              value={donorUidToMatch}
              onChange={(e) => {
                setDonorUidToMatch(e.target.value);
                setMatchWarning(null);
              }}
              placeholder="Donor UID"
              className="flex-1 rounded-md border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-4 py-2 border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              disabled={updatingStatus}
            />
            {matchWarning ? (
              <button 
                onClick={() => handleMatchDonor(true)}
                disabled={updatingStatus || !donorUidToMatch.trim()}
                className="px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 shadow-sm disabled:opacity-50"
              >
                {updatingStatus ? 'Acquiring lock...' : 'Proceed Anyway'}
              </button>
            ) : (
              <button 
                onClick={() => handleMatchDonor(false)}
                disabled={updatingStatus || !donorUidToMatch.trim()}
                className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 shadow-sm disabled:opacity-50"
              >
                {updatingStatus ? 'Acquiring lock...' : 'Confirm Match'}
              </button>
            )}
            <button 
              onClick={() => {
                setShowMatchPrompt(false);
                setDonorUidToMatch('');
                setMatchWarning(null);
              }}
              disabled={updatingStatus}
              className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 font-medium disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Donated Prompt Modal/Inline */}
      {showDonatedPrompt && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6 shadow-sm mt-4">
          <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-300 mb-2">Donation-Day Verification</h3>
          <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-4">
            Verify the donor's blood group and enter the volume donated.
          </p>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-emerald-800 dark:text-emerald-400 mb-1">
                Donor's Blood Group
              </label>
              {loadingDonor ? (
                <div className="text-sm text-emerald-600">Loading donor profile...</div>
              ) : (
                <div className="flex items-center gap-3">
                  <select
                    value={confirmedBloodGroup}
                    onChange={(e) => setConfirmedBloodGroup(e.target.value)}
                    disabled={updatingStatus}
                    className="flex-1 rounded-md border-emerald-300 dark:border-emerald-700 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm px-4 py-2 border bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="" disabled>Select Blood Group</option>
                    {Object.entries(bloodGroups).map(([id, bg]) => (
                      <option key={id} value={id}>{bg.name}</option>
                    ))}
                  </select>
                  {matchedDonorProfile?.bloodGroupVerified && (
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-1 rounded-full uppercase tracking-wide">
                      Already Verified
                    </span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-emerald-800 dark:text-emerald-400 mb-1">
                Actual Volume Donated (units)
              </label>
              <input 
                type="number" 
                min="1"
                value={donatedVolume}
                onChange={(e) => setDonatedVolume(Number(e.target.value) || 1)}
                className="w-24 rounded-md border-emerald-300 dark:border-emerald-700 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm px-4 py-2 border bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                disabled={updatingStatus}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={handleConfirmDonated}
              disabled={updatingStatus || donatedVolume < 1 || !confirmedBloodGroup}
              className="px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 shadow-sm disabled:opacity-50"
            >
              {updatingStatus ? 'Updating...' : 'Confirm Donation & Verify'}
            </button>
            <button 
              onClick={() => {
                setShowDonatedPrompt(false);
                setDonatedVolume(1);
                setConfirmedBloodGroup('');
              }}
              disabled={updatingStatus}
              className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 font-medium disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Status Timeline Visualization */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-4">Workflow Status</h3>
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 z-0 rounded"></div>
          {/* Main flow */}
          {statusFlow.map((s, idx) => {
            let stateClass = "bg-slate-100 text-slate-400 border-2 border-white";
            if (s === request.status) {
              stateClass = "bg-indigo-600 text-white shadow-md ring-4 ring-indigo-50";
            } else if (!isUnfulfilled && currentIndex >= idx) {
              stateClass = "bg-indigo-100 text-indigo-600 border-2 border-white";
            }
            return (
              <div key={s} className={`relative z-10 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${stateClass}`}>
                {s}
              </div>
            );
          })}
        </div>
        {isUnfulfilled && (
          <div className="mt-4 flex justify-center">
             <div className="bg-rose-600 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-md">
                Unfulfilled
             </div>
          </div>
        )}
      </div>

      {isUnfulfilled && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl shadow-sm mt-4 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <h3 className="font-bold mb-1">No Eligible Donors Found</h3>
            <p className="text-sm">This request was closed because no compatible, eligible donors could be found in time.</p>
          </div>
        </div>
      )}


      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[500px]">
        <div className="border-b border-slate-200 flex">
          {['details', 'comments', 'attachments', 'audit'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-6 py-4 text-sm font-medium capitalize ${
                activeTab === tab 
                  ? 'border-b-2 border-indigo-600 text-indigo-600' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'audit' && profile?.role !== 'Admin' ? null : tab}
            </button>
          ))}
        </div>

        <div className="p-6 flex-1 flex flex-col">
          {activeTab === 'details' && (
            <div className="grid grid-cols-2 gap-y-6 gap-x-8">
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Recipient Name</label>
                <div className="text-base font-medium text-slate-900">{request.recipientName}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Camp</label>
                <div className="text-base text-slate-900">{camps[request.campId || '']?.name || request.campId}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Blood Group</label>
                <div className="text-base font-medium text-indigo-700 bg-indigo-50 inline-block px-2 py-0.5 rounded">
                  {bloodGroups[request.blood_groupId]?.name || request.blood_groupId}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Units Needed</label>
                <div className="text-base text-slate-900">{request.unitsNeeded}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Urgency</label>
                <div className="text-base text-slate-900">{request.urgency}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Hospital</label>
                <div className="text-base text-slate-900">{hospitals[request.recipientHospitalId]?.name || request.recipientHospitalId}</div>
              </div>
              {request.matchedDonorId && (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-emerald-600 uppercase tracking-wider mb-1">Matched Donor UID</label>
                  <div className="text-base font-bold text-slate-900 bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                    {request.matchedDonorId}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'comments' && (
             <div className="flex-1 h-full">
               <CommentsThread transactionId={request.id} campId={request.campId || ''} />
             </div>
          )}

          {activeTab === 'attachments' && (
             <div className="flex-1 h-full">
               <AttachmentsList transactionId={request.id} campId={request.campId || ''} />
             </div>
          )}

          {activeTab === 'audit' && profile?.role === 'Admin' && (
             <div className="flex-1 h-full">
               <AuditLogList transactionId={request.id} />
             </div>
          )}
        </div>
      </div>
    </div>
  );
};
