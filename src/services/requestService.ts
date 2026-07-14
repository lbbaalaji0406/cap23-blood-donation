import { ref, get, set, update, push, serverTimestamp, query, orderByChild } from 'firebase/database';
import { db as database } from '../firebase';

export type UrgencyLevel = 'Routine' | 'Urgent' | 'Critical';
export type RequestStatus = 'Registered' | 'Verified' | 'Matched' | 'Donated' | 'Closed' | 'Unfulfilled';

export interface DonationRequest {
  id: string;
  campId?: string; // CampId is now structural, but we keep it here for UI convenience
  recipientName: string;
  recipientHospitalId: string;
  blood_groupId: string;
  unitsNeeded: number;
  urgency: UrgencyLevel;
  status: RequestStatus;
  
  unfulfillableFlag?: boolean;
  matchedDonorId?: string;
  assignedTo?: string;

  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export const requestService = {
  // Fetch all requests
  getAllRequests: async (role?: string, campId?: string): Promise<DonationRequest[]> => {
    if (role === 'Manager' && campId) {
      // Direct natively allowed read of the camp's subtree
      const campRequestsRef = ref(database, `transactions/donation_request/${campId}`);
      const q = query(campRequestsRef, orderByChild('createdAt'));
      const snapshot = await get(q);
      
      const results: DonationRequest[] = [];
      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          results.push({ id: child.key, campId, ...child.val() } as DonationRequest);
        });
      }
      return results.reverse();
    } else {
      // Admin: loop over all camps and merge
      const campsSnapshot = await get(ref(database, 'masters/camp'));
      if (!campsSnapshot.exists()) return [];
      
      const allCamps = campsSnapshot.val();
      const campIds = Object.keys(allCamps);
      
      const promises = campIds.map(async (cId) => {
        const campRef = ref(database, `transactions/donation_request/${cId}`);
        const snapshot = await get(campRef);
        const campResults: DonationRequest[] = [];
        if (snapshot.exists()) {
          snapshot.forEach((child) => {
            campResults.push({ id: child.key, campId: cId, ...child.val() } as DonationRequest);
          });
        }
        return campResults;
      });
      
      const allResultsArray = await Promise.all(promises);
      const allResults = allResultsArray.flat();
      
      // Sort by createdAt descending
      allResults.sort((a, b) => b.createdAt - a.createdAt);
      return allResults;
    }
  },

  // Fetch a single request
  getRequest: async (campId: string, id: string): Promise<DonationRequest | null> => {
    const requestRef = ref(database, `transactions/donation_request/${campId}/${id}`);
    const snapshot = await get(requestRef);
    if (!snapshot.exists()) return null;
    return { id: snapshot.key, campId, ...snapshot.val() } as DonationRequest;
  },

  // Save (Create or Update)
  saveDonationRequest: async (
    id: string | null,
    payload: Partial<DonationRequest>,
    uid: string,
    managerCampId?: string // Passed if user is Manager
  ): Promise<void> => {
    const targetCampId = managerCampId || payload.campId;
    if (!targetCampId) throw new Error("Camp ID is required");

    if (!id) {
      // CREATE flow
      const requestsRef = ref(database, `transactions/donation_request/${targetCampId}`);
      const newRef = push(requestsRef);
      
      const newRequest = {
        ...payload,
        status: 'Registered',
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      // Remove campId from body as it is now in the path
      delete newRequest.campId;
      
      await set(newRef, newRequest);
    } else {
      // EDIT flow
      const requestRef = ref(database, `transactions/donation_request/${targetCampId}/${id}`);
      
      const updatePayload = { ...payload };
      delete updatePayload.campId; // CampId is structural, shouldn't be in payload
      delete updatePayload.status; // Status is governed by Workflow, not simple edits
      delete updatePayload.id;
      delete updatePayload.createdBy;
      delete updatePayload.createdAt;

      updatePayload.updatedAt = serverTimestamp() as any;

      await update(requestRef, updatePayload);
    }
  }
};
