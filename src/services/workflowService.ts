import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export const workflowService = {
  matchDonor: async (
    campId: string,
    requestId: string,
    donorUid: string
  ): Promise<boolean> => {
    try {
      const processWorkflowState = httpsCallable(functions, 'processWorkflowState');
      await processWorkflowState({
        action: 'MATCH_DONOR',
        campId,
        requestId,
        donorUid
      });
      return true;
    } catch (error: any) {
      console.error("Match donor failed:", error);
      throw new Error(error.message || "Failed to update request status. Match aborted.");
    }
  },
  
    updateStatus: async (
    campId: string,
    requestId: string,
    currentStatus: string,
    newStatus: string,
    donorUid?: string,
    volume?: number,
    bloodGroup?: string
  ): Promise<void> => {
    try {
      const processWorkflowState = httpsCallable(functions, 'processWorkflowState');
      await processWorkflowState({
        action: 'UPDATE_STATUS',
        campId,
        requestId,
        currentStatus,
        newStatus,
        donorUid,
        volume,
        bloodGroup
      });
    } catch (error: any) {
      console.error("Update status failed:", error);
      throw new Error(error.message || "Status transition denied.");
    }
  }
};

