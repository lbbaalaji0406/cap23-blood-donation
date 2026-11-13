import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { requestService } from '../../services/requestService';
import type { DonationRequest, RequestStatus } from '../../services/requestService';
import { getCamps, getHospitals, getBloodGroups, getCompatibleDonorGroups } from '../../services/masterService';
import type { Camp, Hospital, BloodGroup } from '../../services/masterService';
import { useAuth } from '../../contexts/AuthProvider';
import { workflowService } from '../../services/workflowService';
import { storageService } from '../../services/storageService';
import { db } from '../../firebase';
import { ref, get } from 'firebase/database';
import { Activity, CheckCircle2, X, Package, Users, UserCheck } from 'lucide-react';

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
  
  const [donorMatchStatus, setDonorMatchStatus] = useState<'none' | 'pending_response' | 'accepted' | 'declined'>('none');
  const [respondingMatch, setRespondingMatch] = useState(false);
  const [donorActionMsg, setDonorActionMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  const [camps, setCamps] = useState<Record<string, Camp>>({});
  const [hospitals, setHospitals] = useState<Record<string, Hospital>>({});
  const [bloodGroups, setBloodGroups] = useState<Record<string, BloodGroup>>({});
  
  const [activeTab, setActiveTab] = useState<'details'|'comments'|'attachments'|'audit'>('details');

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [donorUidToMatch, setDonorUidToMatch] = useState('');
  const [showMatchPrompt, setShowMatchPrompt] = useState(false);
  
  interface AvailableDonor {
    uid: string;
    name: string;
    email: string;
    bloodGroup: string;
    bloodGroupName: string;
    bloodGroupVerified: boolean;
    isCompatible: boolean;
  }
  const [availableDonors, setAvailableDonors] = useState<AvailableDonor[]>([]);
  const [loadingDonorsList, setLoadingDonorsList] = useState(false);
  const [customUidMode, setCustomUidMode] = useState(false);
  
  const [showDonatedPrompt, setShowDonatedPrompt] = useState(false);
  const [donatedVolume, setDonatedVolume] = useState(1);
  const [matchedDonorProfile, setMatchedDonorProfile] = useState<any>(null);
  const [loadingDonor, setLoadingDonor] = useState(false);
  const [confirmedBloodGroup, setConfirmedBloodGroup] = useState('');

  interface MatchedDonorInfo {
    uid: string;
    status: string;
    name?: string;
    email?: string;
    bloodGroup?: string;
  }
  const [matchedDonors, setMatchedDonors] = useState<MatchedDonorInfo[]>([]);
  const [isReservingStock, setIsReservingStock] = useState(false);
  const [modeAMessage, setModeAMessage] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

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

      // Fetch matches subcollection
      try {
        const matchesSnap = await get(ref(db, `matches/${id}`));
        if (matchesSnap.exists()) {
          const list: MatchedDonorInfo[] = [];
          const entries = Object.entries<any>(matchesSnap.val());
          for (const [mUid, mData] of entries) {
            let uName = 'Donor';
            let uEmail = '';
            let uBg = '';
            try {
              const uSnap = await get(ref(db, `users/${mUid}`));
              if (uSnap.exists()) {
                const uVal = uSnap.val();
                uName = uVal.name || 'Donor';
                uEmail = uVal.email || '';
                uBg = uVal.bloodGroup || '';
              }
            } catch (err) {
              console.error('Error fetching donor user:', err);
            }
            list.push({
              uid: mUid,
              status: mData.status,
              name: uName,
              email: uEmail,
              bloodGroup: uBg
            });
          }
          setMatchedDonors(list);
        } else {
          setMatchedDonors([]);
        }
      } catch (e) {
        console.error('Error fetching matches:', e);
      }

      if (profile?.role === 'Donor' && user?.uid && id) {
        try {
          const matchSnap = await get(ref(db, `matches/${id}/${user.uid}`));
          if (matchSnap.exists()) {
            const m = matchSnap.val();
            setDonorMatchStatus(m.status || 'pending_response');
          } else {
            const activeSnap = await get(ref(db, `active_donor_matches/${user.uid}`));
            if (activeSnap.exists() && activeSnap.val().requestId === id) {
              setDonorMatchStatus('pending_response');
            } else {
              setDonorMatchStatus('none');
            }
          }
        } catch (e) {
          console.error("Error reading match status for donor:", e);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Access Denied or Failed to load request.');
    } finally {
      setLoading(false);
    }
  };

  const handleDonorResponse = async (response: 'accept' | 'decline') => {
    if (!id || !campId || !user?.uid) return;
    setRespondingMatch(true);
    setDonorActionMsg(null);
    try {
      await workflowService.respondToMatch(campId, id, user.uid, response);
      setDonorMatchStatus(response === 'accept' ? 'accepted' : 'declined');
      setDonorActionMsg({
        type: 'success',
        text: response === 'accept' 
          ? 'Thank you! You have confirmed your donation match.' 
          : 'You have declined this match. Your match reservation has been released.'
      });
      await fetchAll();
    } catch (err: any) {
      setDonorActionMsg({
        type: 'error',
        text: err.message || `Failed to ${response} match.`
      });
    } finally {
      setRespondingMatch(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [id, campId]);

  const fetchAvailableDonors = async () => {
    if (!request) return;
    setLoadingDonorsList(true);
    try {
      // 1. Fetch universal donors from users
      const snap = await get(ref(db, 'users'));

      // 2. Fetch existing matches for this request and global active locks
      const [matchesSnap, activeLocksSnap] = await Promise.all([
        get(ref(db, `matches/${request.id}`)),
        get(ref(db, 'active_donor_matches'))
      ]);

      const requestMatches = matchesSnap.exists() ? matchesSnap.val() : {};
      const activeLocks = activeLocksSnap.exists() ? activeLocksSnap.val() : {};

      if (snap.exists()) {
        const usersObj = snap.val();
        const compatibleGroups = getCompatibleDonorGroups(request.blood_groupId, request.componentType);
        const list: AvailableDonor[] = [];

        for (const [uid, u] of Object.entries<any>(usersObj)) {
          if (u.role === 'Donor') {
            // Check if donor is already matched/accepted/donated for this request
            const existingMatch = requestMatches[uid];
            if (existingMatch && (existingMatch.status === 'pending_response' || existingMatch.status === 'accepted' || existingMatch.status === 'donated')) {
              continue; // Exclude already matched donor
            }

            // Check if donor has an active lock with another request
            if (activeLocks[uid] && activeLocks[uid].requestId !== request.id) {
              continue; // Exclude locked donor
            }

            const bgKey = u.bloodGroup || '';
            const bgName = bloodGroups[bgKey]?.name || bloodGroups[bgKey]?.code || bgKey || 'Unknown';
            list.push({
              uid,
              name: u.name || 'Anonymous Donor',
              email: u.email || '',
              bloodGroup: bgKey,
              bloodGroupName: bgName,
              bloodGroupVerified: !!u.bloodGroupVerified,
              isCompatible: compatibleGroups.includes(bgKey)
            });
          }
        }
        list.sort((a, b) => (b.isCompatible ? 1 : 0) - (a.isCompatible ? 1 : 0));
        setAvailableDonors(list);
      }
    } catch (e) {
      console.error('Error fetching donors list:', e);
    } finally {
      setLoadingDonorsList(false);
    }
  };

  const handleInitiateDonation = async (donorUid: string) => {
    setLoadingDonor(true);
    setShowDonatedPrompt(true);
    try {
      const snapshot = await get(ref(db, `users/${donorUid}`));
      if (snapshot.exists()) {
        const data = snapshot.val();
        setMatchedDonorProfile({ ...data, uid: donorUid });
        setConfirmedBloodGroup(data.bloodGroup || '');
      }
    } catch (err) {
      console.error("Failed to fetch donor profile", err);
    } finally {
      setLoadingDonor(false);
    }
  };

  const handleModeAStockReservation = async () => {
    if (!request || !campId) return;
    setIsReservingStock(true);
    setModeAMessage(null);
    try {
      const unitsRemaining = (request.unitsNeeded || 1) - (request.unitsSecured || 0);
      const result = await storageService.reserveStock({
        requestId: request.id,
        campId: campId,
        recipientBloodGroupId: request.blood_groupId,
        componentType: request.componentType || 'WholeBlood',
        unitsNeeded: unitsRemaining > 0 ? unitsRemaining : 1
      });

      if (result.mode === 'Mode_A') {
        const barcodes = result.reservedUnits?.map((u: any) => u.bagBarcode).join(', ') || 'Certified Unit';
        setModeAMessage({
          type: 'success',
          text: `Mode A Stock Allocated! Unit(s) [${barcodes}] reserved under FEFO with 10-minute scan timer. Physical dispatch ready at cold storage dock.`
        });
        await fetchAll();
      } else {
        setModeAMessage({
          type: 'warning',
          text: `Insufficient certified stock on chiller shelf (${result.reservedUnits?.length || 0}/${unitsRemaining} available). Please mobilize registered donors via Mode B.`
        });
      }
    } catch (err: any) {
      console.error('Mode A Stock Reservation Failed:', err);
      setModeAMessage({
        type: 'error',
        text: err.message || 'Failed to allocate stock from cold storage.'
      });
    } finally {
      setIsReservingStock(false);
    }
  };

  const handleStatusChange = async (newStatus: RequestStatus) => {
    if (!request || !user || !profile || !campId) return;
    
    if (newStatus === 'Matched' && (request.status === 'Verified' || request.status === 'Partially Matched')) {
      setShowMatchPrompt(true);
      fetchAvailableDonors();
      return;
    }

    if (newStatus === 'Donated' && (request.status === 'Matched' || request.status === 'Partially Matched')) {
      let donorToUse = request.matchedDonorId;
      if (!donorToUse) {
        const accepted = matchedDonors.find(m => m.status === 'accepted');
        if (accepted) {
          donorToUse = accepted.uid;
        } else {
          try {
            const matchSnap = await get(ref(db, `matches/${request.id}`));
            if (matchSnap.exists()) {
              matchSnap.forEach(child => {
                if (child.val().status === 'accepted') {
                  donorToUse = child.key;
                }
              });
            }
          } catch (e) {
            console.error(e);
          }
        }
      }

      if (donorToUse) {
        await handleInitiateDonation(donorToUse);
      } else {
        setShowDonatedPrompt(true);
      }
      return;
    }

    if (newStatus === 'Unfulfilled' && profile.role !== 'Admin') {
      setError('Only Admins can mark a request as Unfulfilled.');
      return;
    }
    
    if (newStatus === 'Closed' && profile.role !== 'Admin' && profile.role !== 'Manager') {
      setError('Only Camp Managers or Admins can Close a request.');
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

        const compatibleDonors = getCompatibleDonorGroups(request.blood_groupId, request.componentType);
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
        donorUidToMatch.trim()
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
        matchedDonorProfile?.uid || request.matchedDonorId,
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
  const isPartiallyMatched = request.status === 'Partially Matched';
  const isUnfulfilled = request.status === unfulfilledState;
  const isTerminal = request.status === 'Closed' || isUnfulfilled;

  // Determine allowed next states based on current state
  const allowedNextStates: { status: RequestStatus; label: string }[] = [];
  const unitsCollected = request.unitsCollected || 0;
  const unitsNeeded = request.unitsNeeded || 1;
  const hasAcceptedDonors = matchedDonors.some(m => m.status === 'accepted');

  if (!isTerminal) {
    if (request.status === 'Registered') {
      allowedNextStates.push({ status: 'Verified', label: 'Mark as Verified' });
      if (profile?.role === 'Admin') allowedNextStates.push({ status: 'Unfulfilled', label: 'Mark as Unfulfilled' });
    } else if (request.status === 'Verified') {
      allowedNextStates.push({ status: 'Matched', label: 'Match Donor' });
      if (profile?.role === 'Admin') allowedNextStates.push({ status: 'Unfulfilled', label: 'Mark as Unfulfilled' });
    } else if (request.status === 'Partially Matched' || request.status === 'Matched') {
      // 1. Can match additional donors if needed units not fully collected
      if (unitsCollected < unitsNeeded) {
        allowedNextStates.push({
          status: 'Matched',
          label: `Match Additional Donor (${unitsCollected}/${unitsNeeded} Collected)`
        });
      }
      // 2. Can proceed to record donation if there is an accepted donor waiting
      if (hasAcceptedDonors) {
        allowedNextStates.push({
          status: 'Donated',
          label: `Proceed to Donated (Verify Collection)`
        });
      }
      // 3. If all units collected, can mark as Closed
      if (unitsCollected >= unitsNeeded && (profile?.role === 'Admin' || profile?.role === 'Manager')) {
        allowedNextStates.push({ status: 'Closed', label: 'Mark as Closed' });
      }
    } else if (request.status === 'Donated') {
      if (unitsCollected < unitsNeeded) {
        allowedNextStates.push({
          status: 'Matched',
          label: `Match Remaining Donor (${unitsCollected}/${unitsNeeded} Collected)`
        });
      }
      if (profile?.role === 'Admin' || profile?.role === 'Manager') {
        allowedNextStates.push({ status: 'Closed', label: 'Mark as Closed' });
      }
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
          {request.componentType === 'Platelets' && (
            <span className="text-xs font-bold uppercase tracking-wider bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full border border-purple-200">
              Platelets
            </span>
          )}
          {request.componentType === 'Plasma' && (
            <span className="text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200">
              Plasma
            </span>
          )}
          {(!request.componentType || request.componentType === 'WholeBlood') && (
            <span className="text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full border border-blue-200">
              Whole Blood
            </span>
          )}
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
                <option key={st.status} value={st.status}>
                  {st.label}
                </option>
              ))}
            </select>
          )}

          {profile?.role !== 'Donor' && (
            <button 
              onClick={() => navigate(`/requests/${request.campId}/${request.id}/edit`)}
              disabled={isTerminal}
              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm shadow-sm disabled:opacity-50"
              title={isTerminal ? 'Cannot edit terminal request' : ''}
            >
              Edit Fields
            </button>
          )}
        </div>
      </div>

      {/* Donor Match Consent Card */}
      {profile?.role === 'Donor' && donorMatchStatus === 'pending_response' && (
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 text-white p-6 rounded-2xl shadow-lg border border-indigo-500 my-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm">
                <Activity size={26} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">Match Response Required</h2>
                  <span className="bg-amber-400 text-amber-950 font-bold text-xs uppercase px-2.5 py-0.5 rounded-full">
                    Pending Your Consent
                  </span>
                </div>
                <p className="text-indigo-100 text-sm mt-1">
                  You have been matched as a compatible donor for this clinical requisition. Please confirm your availability to donate.
                </p>
              </div>
            </div>
          </div>

          {donorActionMsg && (
            <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${
              donorActionMsg.type === 'success' 
                ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-100' 
                : 'bg-red-500/20 border border-red-400 text-red-100'
            }`}>
              {donorActionMsg.text}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-5">
            <button
              onClick={() => handleDonorResponse('accept')}
              disabled={respondingMatch}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl shadow-md transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer text-sm"
            >
              <CheckCircle2 size={18} />
              {respondingMatch ? 'Confirming...' : 'Accept Match & Confirm Donation'}
            </button>
            <button
              onClick={() => handleDonorResponse('decline')}
              disabled={respondingMatch}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/30 font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50 cursor-pointer text-sm"
            >
              {respondingMatch ? 'Processing...' : 'Decline Match'}
            </button>
          </div>
        </div>
      )}

      {profile?.role === 'Donor' && donorMatchStatus === 'accepted' && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-sm my-4">
          <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Match Accepted</h3>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
              You have confirmed your availability for this donation request. Please proceed to the camp or contact the camp coordinator.
            </p>
          </div>
        </div>
      )}

      {profile?.role === 'Donor' && donorMatchStatus === 'declined' && (
        <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl flex items-center gap-3 my-4">
          <X size={20} className="text-slate-500 shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Match Declined</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              You declined this match. Your match reservation was released and the system is finding a replacement donor.
            </p>
          </div>
        </div>
      )}

      {/* Fulfillment Dispatch Console: Mode A (Chiller Stock) & Mode B (Volunteer Donors) */}
      {(profile?.role === 'Manager' || profile?.role === 'Admin' || profile?.role === 'Storage') &&
        (request?.status === 'Verified' || request?.status === 'Partially Matched') && (
          <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-6 shadow-sm space-y-4 my-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Package size={20} className="text-indigo-600" />
                  <span>Fulfillment Dispatch Console</span>
                  <span className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 font-bold px-2.5 py-0.5 rounded-full">
                    {Math.max(0, (request.unitsNeeded || 1) - (request.unitsSecured || 0))} unit(s) remaining
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Select fulfillment strategy: allocate directly from certified cold storage stock (Mode A) or match registered camp donors (Mode B).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Mode A Option Card */}
              <div className="border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-sm">
                    <Package size={17} />
                    <span>Mode A: Chiller Stock Fulfillment</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                    Atomically allocates certified units from cold storage chillers under FEFO (First-Expiry-First-Out). Starts the 10-minute dispatch countdown timer.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleModeAStockReservation}
                  disabled={isReservingStock}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isReservingStock ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      <span>Checking Shelves & Reserving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Allocate from Chiller Stock (Mode A)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Mode B Option Card */}
              <div className="border border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/20 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 font-bold text-sm">
                    <Users size={17} />
                    <span>Mode B: Live Volunteer Match</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                    Query the registered donor directory to match compatible donors and dispatch an automated match response notification.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowMatchPrompt(true);
                    fetchAvailableDonors();
                  }}
                  className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserCheck size={16} />
                  <span>Match Volunteer Donor (Mode B)</span>
                </button>
              </div>
            </div>

            {modeAMessage && (
              <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 ${
                modeAMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
              }`}>
                <span>{modeAMessage.type === 'success' ? '✅' : '⚠️'}</span>
                <span>{modeAMessage.text}</span>
              </div>
            )}
          </div>
        )}

      {/* Match Donor Prompt Modal/Inline */}
      {showMatchPrompt && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-6 shadow-sm mt-4">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-300">Match Donor</h3>
              <p className="text-sm text-indigo-700 dark:text-indigo-400">
                Select a compatible donor from the registered camp directory, or enter a UID manually. This action acquires an atomic lock to prevent double-booking.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCustomUidMode(!customUidMode);
                setMatchWarning(null);
              }}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-md border border-indigo-200 dark:border-indigo-700 shadow-xs"
            >
              {customUidMode ? '📋 Switch to Dropdown' : '⌨️ Enter UID Manually'}
            </button>
          </div>
          
          {matchWarning && (
            <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 p-4 rounded-lg shadow-sm">
              <p className="font-bold mb-2 flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                {matchWarning}
              </p>
            </div>
          )}

          {/* Quick Select Dropdown */}
          {!customUidMode ? (
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                Compatible Registered Donors:
              </label>
              <select
                value={donorUidToMatch}
                onChange={(e) => {
                  setDonorUidToMatch(e.target.value);
                  setMatchWarning(null);
                }}
                disabled={updatingStatus || loadingDonorsList}
                className="w-full rounded-lg border-indigo-300 dark:border-indigo-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm px-3.5 py-2.5 border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="">
                  {loadingDonorsList ? 'Loading donor directory...' : availableDonors.length === 0 ? '-- No registered donors found --' : '-- Choose a registered donor --'}
                </option>
                {availableDonors.map((d) => (
                  <option key={d.uid} value={d.uid} disabled={!d.isCompatible}>
                    {d.name} ({d.bloodGroupName}) — {d.isCompatible ? '✓ Compatible' : '✗ Incompatible'} {!d.bloodGroupVerified ? '⚠️ (Unverified)' : ''}
                  </option>
                ))}
              </select>
              {availableDonors.length === 0 && !loadingDonorsList && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  No registered donors found in database. Use "Enter UID Manually" to input an external donor ID.
                </p>
              )}
            </div>
          ) : (
            /* Manual UID input mode */
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                Manual Donor UID:
              </label>
              <input 
                type="text" 
                value={donorUidToMatch}
                onChange={(e) => {
                  setDonorUidToMatch(e.target.value);
                  setMatchWarning(null);
                }}
                placeholder="Paste 28-character Firebase Donor UID"
                className="w-full rounded-lg border-indigo-300 dark:border-indigo-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm px-3.5 py-2.5 border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
                disabled={updatingStatus}
              />
            </div>
          )}

          {donorUidToMatch && (
            <div className="mb-4 text-xs text-indigo-700 dark:text-indigo-300 font-mono bg-indigo-100/60 dark:bg-indigo-950/40 px-3 py-1.5 rounded border border-indigo-200 dark:border-indigo-800">
              Selected UID: <span className="font-bold">{donorUidToMatch}</span>
            </div>
          )}

          <div className="flex gap-3">
            {matchWarning ? (
              <button 
                onClick={() => handleMatchDonor(true)}
                disabled={updatingStatus || !donorUidToMatch.trim()}
                className="px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 shadow-sm disabled:opacity-50 text-sm"
              >
                {updatingStatus ? 'Acquiring lock...' : 'Proceed Anyway'}
              </button>
            ) : (
              <button 
                onClick={() => handleMatchDonor(false)}
                disabled={updatingStatus || !donorUidToMatch.trim()}
                className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 shadow-sm disabled:opacity-50 text-sm"
              >
                {updatingStatus ? 'Acquiring lock...' : 'Confirm Match'}
              </button>
            )}
            <button 
              onClick={() => {
                setShowMatchPrompt(false);
                setDonorUidToMatch('');
                setMatchWarning(null);
                setCustomUidMode(false);
              }}
              disabled={updatingStatus}
              className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 font-medium disabled:opacity-50 text-sm"
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
            Verify the donor's identity, blood group, and enter the collection volume.
          </p>

          {matchedDonorProfile && (
            <div className="mb-4 p-3 bg-white dark:bg-slate-800 rounded-lg border border-emerald-200 dark:border-emerald-700 text-sm">
              <div className="font-semibold text-slate-800 dark:text-slate-100">{matchedDonorProfile.name || 'Matched Donor'}</div>
              <div className="text-xs text-slate-500 font-mono mt-0.5">{matchedDonorProfile.email} &bull; UID: {matchedDonorProfile.uid}</div>
            </div>
          )}

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
            let label = s;
            const isMatchStep = s === 'Matched';

            if (s === request.status) {
              stateClass = "bg-indigo-600 text-white shadow-md ring-4 ring-indigo-50";
            } else if (isMatchStep && isPartiallyMatched) {
              stateClass = "bg-amber-500 text-white shadow-md ring-4 ring-amber-100";
              label = `Partially Matched (${request.unitsSecured || 1}/${request.unitsNeeded || 2})`;
            } else if (!isUnfulfilled && (currentIndex >= idx || (isPartiallyMatched && idx <= 1))) {
              stateClass = "bg-indigo-100 text-indigo-600 border-2 border-white";
            }
            return (
              <div key={s} className={`relative z-10 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${stateClass}`}>
                {label}
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
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Blood Group & Component</label>
                <div className="flex items-center gap-2">
                  <div className="text-base font-medium text-indigo-700 bg-indigo-50 inline-block px-2 py-0.5 rounded">
                    {bloodGroups[request.blood_groupId]?.name || request.blood_groupId}
                  </div>
                  {request.componentType === 'Platelets' && (
                    <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                      Platelets
                    </span>
                  )}
                  {request.componentType === 'Plasma' && (
                    <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      Plasma
                    </span>
                  )}
                  {(!request.componentType || request.componentType === 'WholeBlood') && (
                    <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      Whole Blood
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Units (Needed / Secured / Collected)</label>
                <div className="text-base text-slate-900 flex items-center gap-2">
                  <span className="font-semibold">{request.unitsNeeded} needed</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {request.unitsSecured || 0} secured
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    (request.unitsCollected || 0) >= request.unitsNeeded 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : (request.unitsCollected || 0) > 0 
                        ? 'bg-amber-100 text-amber-800' 
                        : 'bg-slate-100 text-slate-700'
                  }`}>
                    {request.unitsCollected || 0} collected
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Urgency</label>
                <div className="text-base text-slate-900">{request.urgency}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Hospital</label>
                <div className="text-base text-slate-900">{hospitals[request.recipientHospitalId]?.name || request.recipientHospitalId}</div>
              </div>

              {/* Matched Donors Section */}
              {matchedDonors.length > 0 && (
                <div className="col-span-2 mt-2">
                  <label className="block text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-2">
                    Matched Donors ({matchedDonors.length})
                  </label>
                  <div className="space-y-2">
                    {matchedDonors.map((md) => (
                      <div key={md.uid} className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/80">
                        <div>
                          <div className="font-semibold text-slate-900 text-sm">{md.name}</div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">{md.email} &bull; UID: {md.uid}</div>
                        </div>
                        <div className="flex items-center gap-2.5">
                          {md.bloodGroup && (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {bloodGroups[md.bloodGroup]?.name || md.bloodGroup}
                            </span>
                          )}
                          <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                            md.status === 'donated'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : md.status === 'accepted'
                                ? 'bg-teal-100 text-teal-800 border border-teal-200'
                                : md.status === 'pending_response'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-slate-200 text-slate-700'
                          }`}>
                            {md.status === 'donated' ? '✓ Donated & Verified' : md.status === 'accepted' ? '✓ Accepted' : md.status === 'pending_response' ? '⏳ Pending Response' : md.status}
                          </span>
                          {md.status === 'accepted' && (profile?.role === 'Manager' || profile?.role === 'Admin') && (
                            <button
                              type="button"
                              onClick={() => handleInitiateDonation(md.uid)}
                              disabled={updatingStatus}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                            >
                              Record Donation
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {request.matchedDonorId && !matchedDonors.some(m => m.uid === request.matchedDonorId) && (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-emerald-600 uppercase tracking-wider mb-1">Matched Donor UID</label>
                  <div className="text-base font-bold text-slate-900 bg-emerald-50 p-3 rounded-lg border border-emerald-200 font-mono">
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
