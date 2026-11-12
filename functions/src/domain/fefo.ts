import { BloodComponentType } from './types';

export interface StorageUnitSummary {
  unitId: string;
  bagBarcode: string;
  bloodGroup: string;
  componentType: BloodComponentType;
  expiryDate: string | number;
  status: string;
}

/**
 * Standard statutory shelf life in days based on component and preservative.
 * Sourced from DGHS Transfusion Medicine Technical Manual & Schedule F Part XII-B.
 */
export const SHELF_LIFE_DAYS = {
  PRBC_CPDA1: 35,
  PRBC_SAGM: 42,
  PLATELETS_ROOM_TEMP_AGITATED: 5,
  FFP_MINUS_18C: 90,   // 3 months
  FFP_MINUS_30C: 365   // 12 months
};

/**
 * Sorts storage units strictly by earliest expiry date first (First-Expired, First-Out).
 */
export function sortUnitsByFEFO<T extends StorageUnitSummary>(units: T[]): T[] {
  return [...units].sort((a, b) => {
    const timeA = typeof a.expiryDate === 'number' ? a.expiryDate : new Date(a.expiryDate).getTime();
    const timeB = typeof b.expiryDate === 'number' ? b.expiryDate : new Date(b.expiryDate).getTime();
    return timeA - timeB;
  });
}
