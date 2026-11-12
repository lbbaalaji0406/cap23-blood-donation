import { ref, push, serverTimestamp, get, set, onValue } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import type { BloodComponentType } from './masterService';

export interface Attachment {
  id?: string;
  fileName: string;
  storageUrl: string;
  size: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: number;
}

const CLOUD_NAME = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_CLOUDINARY_CLOUD_NAME) || '';
const UPLOAD_PRESET = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_CLOUDINARY_UPLOAD_PRESET) || '';

export type StorageUnitStatus =
  | 'Quarantined'
  | 'Certified'
  | 'Stock_Reserved'
  | 'ISSUE_UNCONFIRMED'
  | 'Dispatched'
  | 'Transfused'
  | 'Returned'
  | 'Discarded'
  | 'RECALLED';

export interface StorageUnit {
  unitId: string;
  bagBarcode: string;
  bloodGroup: string;
  componentType: BloodComponentType;
  volumeMl: number;
  collectionDate: string;
  expiryDate: string;
  preservativeSolution: 'CPDA-1' | 'SAGM' | 'None';
  storageTemperatureCelsius: number;
  status: StorageUnitStatus;
  storageLocation: string;
  sourceCampId?: string;
  sourceBatchId?: string;
  enteredBy?: string;
  certifiedBy?: string;
  certifiedAt?: string;
  lateScan?: boolean;
}

export const storageService = {
  // --- File Attachments (Cloudinary & RTDB) ---
  subscribeToAttachments: (transactionId: string, onUpdate: (attachments: Attachment[]) => void) => {
    const attachmentsRef = ref(db, `attachments/${transactionId}/items`);
    return onValue(attachmentsRef, (snapshot) => {
      const results: Attachment[] = [];
      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          results.push({ id: child.key, ...child.val() } as Attachment);
        });
      }
      onUpdate(results);
    });
  },

  uploadAttachment: async (
    transactionId: string,
    file: File,
    userUid: string
  ): Promise<Attachment> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', `cap23_requests/${transactionId}`);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Cloudinary upload failed.');
    }

    const data = await res.json();
    const itemRef = push(ref(db, `attachments/${transactionId}/items`));
    const attachmentData: Attachment = {
      fileName: file.name,
      storageUrl: data.secure_url,
      size: file.size,
      mimeType: file.type,
      uploadedBy: userUid,
      uploadedAt: Date.now(),
    };

    await set(itemRef, {
      ...attachmentData,
      uploadedAt: serverTimestamp(),
    });

    return { ...attachmentData, id: itemRef.key! };
  },

  uploadFile: async (transactionId: string, _campId: string, file: File, userUid: string): Promise<Attachment> => {
    return storageService.uploadAttachment(transactionId, file, userUid);
  },

  // --- Blood Bank Central Cold Storage ---
  getInventoryUnits: async (): Promise<StorageUnit[]> => {
    const snapshot = await get(ref(db, 'inventory/units'));
    if (!snapshot.exists()) return [];
    const units: StorageUnit[] = [];
    snapshot.forEach((child) => {
      units.push({ unitId: child.key!, ...child.val() });
    });
    return units;
  },

  subscribeToInventoryUnits: (callback: (units: StorageUnit[]) => void) => {
    const inventoryRef = ref(db, 'inventory/units');
    return onValue(inventoryRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      const units: StorageUnit[] = [];
      snapshot.forEach((child) => {
        units.push({ unitId: child.key!, ...child.val() });
      });
      callback(units);
    });
  },

  intakeUnit: async (data: {
    bagBarcode: string;
    bloodGroup: string;
    componentType: BloodComponentType;
    volumeMl: number;
    preservativeSolution: 'CPDA-1' | 'SAGM' | 'None';
    storageTemperatureCelsius: number;
    storageLocation: string;
    sourceCampId?: string;
    donorRef?: string;
  }) => {
    const intakeFn = httpsCallable(functions, 'intakeStorageUnit');
    const result = await intakeFn(data);
    return result.data as { success: boolean; unitId: string; status: string; expiryDate: string };
  },

  certifyUnit: async (data: {
    unitId: string;
    bagBarcode?: string;
    labConfirmedBloodGroup: string;
    rhTyping: 'Positive' | 'Negative';
    ttiLotNumbers: {
      hivLot: string;
      hbvLot: string;
      hcvLot: string;
      malariaLot: string;
      syphilisLot: string;
    };
    isReactive?: boolean;
    reactiveReason?: string;
  }) => {
    const certifyFn = httpsCallable(functions, 'certifyStorageUnit');
    const result = await certifyFn(data);
    return result.data as { success: boolean; status: string };
  },

  reserveStock: async (data: {
    requestId: string;
    recipientBloodGroupId: string;
    componentType: BloodComponentType;
    unitsNeeded: number;
    allowCompatibleSubstitution?: boolean;
  }) => {
    const reserveFn = httpsCallable(functions, 'reserveStockUnits');
    const result = await reserveFn(data);
    return result.data as { success: boolean; reservedUnits: StorageUnit[]; mode: 'Mode_A' | 'Mode_B_Required' };
  },

  confirmDispatchScan: async (data: {
    requestId?: string;
    bagBarcode: string;
    unitId: string;
    hospitalId?: string;
  }) => {
    const confirmFn = httpsCallable(functions, 'confirmBarcodeDispatch');
    const result = await confirmFn(data);
    return result.data as { success: boolean; lateScan: boolean };
  },

  processReturn: async (data: {
    unitId: string;
    coldChainIntact: boolean;
    returnTempCelsius: number;
    notes?: string;
  }) => {
    const returnFn = httpsCallable(functions, 'processUnitReturn');
    const result = await returnFn(data);
    return result.data as { success: boolean; status: string; elapsedMinutes: number };
  },

  sweepScanTimeouts: async (simulatedNow?: number) => {
    const sweepFn = httpsCallable(functions, 'sweepScanTimeouts');
    const result = await sweepFn({ simulatedNow });
    return result.data as { success: boolean; processedCount: number; timedOutUnits: string[] };
  },

  reconcileUnconfirmed: async (data: {
    unitId: string;
    physicalCheckPassed: boolean;
    reason: string;
  }) => {
    const reconcileFn = httpsCallable(functions, 'reconcileUnconfirmedUnit');
    const result = await reconcileFn(data);
    return result.data as { success: boolean; status: string };
  }
};
