import { ref, get, onValue } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import type { DonationRequest, UrgencyLevel } from './requestService';

export interface SubmitHospitalRequisitionPayload {
  recipientName: string;
  blood_groupId: string;
  componentType: 'WholeBlood' | 'Platelets' | 'Plasma';
  unitsNeeded: number;
  urgency: UrgencyLevel;
  campId: string;
  notes?: string;
  patientId?: string;
}

export interface HospitalRequisitionRecord extends DonationRequest {
  patientId?: string;
  notes?: string;
  cancellationReason?: string;
}

export const hospitalService = {
  submitRequisition: async (payload: SubmitHospitalRequisitionPayload): Promise<{ success: boolean; requestId: string; campId: string }> => {
    const submitFn = httpsCallable<SubmitHospitalRequisitionPayload, { success: boolean; requestId: string; campId: string }>(
      functions,
      'submitHospitalRequisition'
    );
    const result = await submitFn(payload);
    return result.data;
  },

  cancelRequisition: async (campId: string, requestId: string, reason?: string): Promise<{ success: boolean }> => {
    const cancelFn = httpsCallable<{ campId: string; requestId: string; reason?: string }, { success: boolean }>(
      functions,
      'cancelHospitalRequisition'
    );
    const result = await cancelFn({ campId, requestId, reason });
    return result.data;
  },

  subscribeToRequisitions: (
    hospitalId: string,
    callback: (requests: HospitalRequisitionRecord[]) => void
  ): (() => void) => {
    const hospitalReqRef = ref(db, `hospital_requests/${hospitalId}`);
    return onValue(hospitalReqRef, (snapshot) => {
      const records: HospitalRequisitionRecord[] = [];
      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          records.push({ id: child.key, ...child.val() } as HospitalRequisitionRecord);
        });
      }
      // Sort newest first
      records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(records);
    });
  },

  getHospitalInfo: async (hospitalId: string) => {
    const hospRef = ref(db, `masters/hospital/${hospitalId}`);
    const snap = await get(hospRef);
    if (snap.exists()) {
      return snap.val();
    }
    return null;
  }
};
