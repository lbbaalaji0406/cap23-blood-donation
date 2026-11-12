export type BloodComponentType = 'WholeBlood' | 'Platelets' | 'Plasma';

export type BloodGroupId =
  | 'A_plus'
  | 'A_minus'
  | 'B_plus'
  | 'B_minus'
  | 'AB_plus'
  | 'AB_minus'
  | 'O_plus'
  | 'O_minus';

export type Clock = () => number;
export type Rng = () => number;

export interface HospitalFacilityInfo {
  hospitalId: string;
  name: string;
  latitude: number;
  longitude: number;
  hasCollectionLicense: boolean;
  collectionFacilityId?: string;
}

export interface DonorCooldownRecord {
  donationDate: string | number;
  componentType?: BloodComponentType;
}

export interface DonorEligibilityResult {
  isEligible: boolean;
  reason?: string;
  nextEligibleDate?: string;
}
