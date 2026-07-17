import { ref, runTransaction, update, serverTimestamp, get, query, orderByChild, limitToLast } from 'firebase/database';
import { db as database } from '../firebase';
import { auditLogService } from './auditLogService';

export const workflowService = {
  matchDonor: async (
    campId: string,
    requestId: string,
    donorUid: string,
    actorUid: string,
    actorName: string
  ): Promise<boolean> => {
    // 0. Eligibility Check (90 days rule)
    const historyRef = ref(database, `donor_history/${donorUid}`);
    const q = query(historyRef, orderByChild('donationDate'), limitToLast(1));
    const historySnapshot = await get(q);
    if (historySnapshot.exists()) {
      let latestDate = 0;
      historySnapshot.forEach((child) => {
        const record = child.val();
        if (record.donationDate > latestDate) {
          latestDate = record.donationDate;
        }
      });
      const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;
      if (Date.now() - latestDate < ninetyDaysInMs) {
        const nextEligibleDate = new Date(latestDate + ninetyDaysInMs).toLocaleDateString();
        throw new Error(`This donor is not eligible. They must wait 90 days. Next eligible date: ${nextEligibleDate}`);
      }
    }

    const lockRef = ref(database, `active_donor_matches/${donorUid}`);
    
    // 1. Try to acquire lock atomically
    let lockAcquired = false;
    try {
      const transactionResult = await runTransaction(lockRef, (currentData) => {
        if (currentData === null) {
          // Lock is free, claim it
          return {
            requestId,
            campId,
            matchedAt: Date.now()
          };
        } else {
          // Already locked, abort transaction
          return undefined;
        }
      });
      lockAcquired = transactionResult.committed;
    } catch (error) {
      console.error("Transaction error:", error);
      lockAcquired = false;
    }

    if (!lockAcquired) {
      // Log the failure
      await auditLogService.logAction(requestId, actorUid, actorName, 'MATCH_DONOR', 'Failed', {
        failureReason: 'Race condition lost: Donor was matched to another request.'
      });
      throw new Error("This donor was just matched to another request. Please select a different donor.");
    }

    // 2. Update Request Status to Matched
    const requestRef = ref(database, `transactions/donation_request/${campId}/${requestId}`);
    try {
      await update(requestRef, {
        status: 'Matched',
        matchedDonorId: donorUid,
        updatedAt: serverTimestamp()
      });
      
      // Log success
      await auditLogService.logAction(requestId, actorUid, actorName, 'MATCH_DONOR', 'Success', {
        beforeStatus: 'Verified',
        afterStatus: 'Matched'
      });
      return true;
    } catch (updateError: any) {
      // 3. Cleanup on Failure (Orphaned lock mitigation)
      console.error("Failed to update status, attempting lock cleanup", updateError);
      try {
        await update(ref(database), {
          [`active_donor_matches/${donorUid}`]: null
        });
      } catch (cleanupError) {
        console.error("Failed to clean up lock. Lock is orphaned.", cleanupError);
      }
      
      await auditLogService.logAction(requestId, actorUid, actorName, 'MATCH_DONOR', 'Failed', {
        failureReason: updateError.message || 'Status update failed.'
      });
      throw new Error("Failed to update request status. Match aborted.");
    }
  },
  
  updateStatus: async (
    campId: string,
    requestId: string,
    currentStatus: string,
    newStatus: string,
    actorUid: string,
    actorName: string,
    donorUid?: string,
    volume?: number
  ): Promise<void> => {
    try {
      // If we are un-matching or moving past matched, we should clear the lock if we know the donorUid
      // RTDB multi-path update allows atomic updates across nodes.
      if (donorUid && (newStatus === 'Donated' || newStatus === 'Closed' || newStatus === 'Unfulfilled')) {
        const rootUpdates: any = {};
        rootUpdates[`transactions/donation_request/${campId}/${requestId}/status`] = newStatus;
        rootUpdates[`transactions/donation_request/${campId}/${requestId}/updatedAt`] = serverTimestamp();
        
        // Clear the global lock for this donor
        rootUpdates[`active_donor_matches/${donorUid}`] = null;
        
        if (newStatus === 'Donated') {
          rootUpdates[`donor_history/${donorUid}/${requestId}`] = {
            requestId,
            donationDate: serverTimestamp(),
            volume: volume || 1,
            campId,
            verifiedBy: actorUid
          };
          rootUpdates[`donor_eligibility/${donorUid}/lastDonationDate`] = serverTimestamp();
        }
        
        await update(ref(database), rootUpdates);
      } else {
        const requestRef = ref(database, `transactions/donation_request/${campId}/${requestId}`);
        await update(requestRef, {
          status: newStatus,
          updatedAt: serverTimestamp()
        });
      }
      
      await auditLogService.logAction(requestId, actorUid, actorName, 'UPDATE_STATUS', 'Success', {
        beforeStatus: currentStatus,
        afterStatus: newStatus
      });
    } catch (error: any) {
      await auditLogService.logAction(requestId, actorUid, actorName, 'UPDATE_STATUS', 'Failed', {
        failureReason: error.message || 'Status transition denied.'
      });
      throw error;
    }
  }
};
