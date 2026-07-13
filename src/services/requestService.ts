import { ref, get, set, update, push, serverTimestamp, query, orderByChild, equalTo } from 'firebase/database';
import { db as database } from '../firebase';

export type UrgencyLevel = 'Routine' | 'Urgent' | 'Critical';
export type RequestStatus = 'Registered' | 'Verified' | 'Matched' | 'Donated' | 'Closed' | 'Unfulfilled';

export interface DonationRequest {
  id: string;
  recipientName: string;
  recipientHospitalId: string;
  blood_groupId: string;
  campId: string;
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
    const requestsRef = ref(database, 'transactions/donation_request');
    
    let q;
    if (role === 'Manager' && campId) {
      q = query(requestsRef, orderByChild('campId'), equalTo(campId));
    } else {
      q = query(requestsRef, orderByChild('createdAt'));
    }

    const snapshot = await get(q);
    
    if (!snapshot.exists()) return [];
    
    const results: DonationRequest[] = [];
    snapshot.forEach((child) => {
      results.push({ id: child.key, ...child.val() } as DonationRequest);
    });
    
    return results.reverse();
  },

  // Fetch a single request
  getRequest: async (id: string): Promise<DonationRequest | null> => {
    const requestRef = ref(database, `transactions/donation_request/${id}`);
    const snapshot = await get(requestRef);
    if (!snapshot.exists()) return null;
    return { id: snapshot.key, ...snapshot.val() } as DonationRequest;
  },

  // Save (Create or Update)
  saveDonationRequest: async (
    id: string | null,
    payload: Partial<DonationRequest>,
    uid: string,
    managerCampId?: string // Passed if user is Manager
  ): Promise<void> => {
    if (!id) {
      // CREATE flow
      const requestsRef = ref(database, 'transactions/donation_request');
      const newRef = push(requestsRef);
      
      const newRequest = {
        ...payload,
        // Enforce hardcoded fields for Create
        status: 'Registered',
        campId: managerCampId || payload.campId, // Manager gets forced to their campId, Admin relies on payload
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      await set(newRef, newRequest);
    } else {
      // EDIT flow
      const requestRef = ref(database, `transactions/donation_request/${id}`);
      
      // Explicitly protect non-editable fields by removing them from payload if they leaked in
      const updatePayload = { ...payload };
      delete updatePayload.campId; // CampId is immutable
      delete updatePayload.status; // Status is governed by Workflow, not simple edits
      delete updatePayload.id;
      delete updatePayload.createdBy;
      delete updatePayload.createdAt;

      updatePayload.updatedAt = serverTimestamp() as any;

      // Use update() to NOT wipe out the existing campId and status
      await update(requestRef, updatePayload);
    }
  }
};
