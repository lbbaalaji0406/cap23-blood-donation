import { HospitalFacilityInfo } from './types';

export interface ResolvedDispatchTarget {
  destinationId: string;
  destinationType: 'HOSPITAL_COLLECTION_CENTRE' | 'LINKED_BLOOD_BANK';
  latitude: number;
  longitude: number;
  isBSC: boolean;
}

/**
 * Validates whether a hospital can collect blood from live donors or is a Blood Storage Centre (BSC).
 * If the hospital is a BSC, routes the donor to the linked licensed blood bank facility.
 * Enforces DEC-017 & DEC-026 across all dispatch tiers.
 */
export function resolveCollectionDestination(
  hospital: HospitalFacilityInfo,
  allFacilitiesById: Record<string, HospitalFacilityInfo>
): ResolvedDispatchTarget {
  if (hospital.hasCollectionLicense) {
    return {
      destinationId: hospital.hospitalId,
      destinationType: 'HOSPITAL_COLLECTION_CENTRE',
      latitude: hospital.latitude,
      longitude: hospital.longitude,
      isBSC: false
    };
  }

  // Hospital is a Blood Storage Centre (BSC) only - must route to linked collection facility
  if (hospital.collectionFacilityId && allFacilitiesById[hospital.collectionFacilityId]) {
    const linked = allFacilitiesById[hospital.collectionFacilityId];
    if (linked.hasCollectionLicense) {
      return {
        destinationId: linked.hospitalId,
        destinationType: 'LINKED_BLOOD_BANK',
        latitude: linked.latitude,
        longitude: linked.longitude,
        isBSC: true
      };
    }
  }

  // Statutory Non-Compliance Guard (Schedule F Part XII-B / DEC-017 & DEC-026):
  // Never route live donors to an unlicensed facility.
  throw new Error(`NO_LICENSED_COLLECTION_FACILITY: Facility ${hospital.hospitalId} has no blood collection license and no valid licensed linked blood bank facility.`);
}
