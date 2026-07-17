import { ref, push, serverTimestamp, get, query, orderByChild, equalTo } from 'firebase/database';
import { db as database } from '../firebase';

export interface AuditLog {
  id?: string;
  transactionId: string;
  actorUid: string;
  actorName: string;
  action: string;
  beforeStatus?: string;
  afterStatus?: string;
  outcome: 'Success' | 'Failed';
  failureReason?: string;
  createdAt: number;
}

export const auditLogService = {
  logAction: async (
    transactionId: string,
    actorUid: string,
    actorName: string,
    action: string,
    outcome: 'Success' | 'Failed',
    details?: {
      beforeStatus?: string;
      afterStatus?: string;
      failureReason?: string;
    }
  ): Promise<void> => {
    try {
      const logsRef = ref(database, 'auditLogs');
      
      const payload = {
        transactionId,
        actorUid,
        actorName,
        action,
        outcome,
        createdAt: serverTimestamp(),
        ...details
      };
      
      // We don't await this, we just fire and forget the log to avoid blocking the user
      await push(logsRef, payload);
    } catch (e) {
      console.error("Failed to write audit log:", e);
    }
  },

  getLogsForTransaction: async (transactionId: string): Promise<AuditLog[]> => {
    // Only Admins can read /auditLogs per security rules.
    const logsRef = ref(database, 'auditLogs');
    const qTransaction = query(logsRef, orderByChild('transactionId'), equalTo(transactionId));
    
    const snapshot = await get(qTransaction);
    const results: AuditLog[] = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        results.push({ id: child.key, ...child.val() } as AuditLog);
      });
    }
    
    // Sort descending
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }
};
