import { BloodComponentType } from './types';

/**
 * Transfusion Medicine Compatibility Matrix:
 * 1. Fresh Frozen Plasma (FFP): Rh(D) is clinically irrelevant; ABO is the exact inverse of RBC.
 *    - AB is universal plasma donor (no anti-A or anti-B).
 *    - O is universal plasma recipient.
 * 2. Whole Blood / RBC / Platelets: Strict ABO and Rh matching.
 *    - O- is universal RBC donor; AB+ is universal RBC recipient.
 */
export const getCompatibleDonorGroups = (
  recipientBloodGroupId: string,
  componentType: BloodComponentType = 'WholeBlood'
): string[] => {
  if (componentType === 'Plasma') {
    switch (recipientBloodGroupId) {
      case 'O_plus':
      case 'O_minus':
        return ['O_plus', 'O_minus', 'A_plus', 'A_minus', 'B_plus', 'B_minus', 'AB_plus', 'AB_minus'];
      case 'A_plus':
      case 'A_minus':
        return ['A_plus', 'A_minus', 'AB_plus', 'AB_minus'];
      case 'B_plus':
      case 'B_minus':
        return ['B_plus', 'B_minus', 'AB_plus', 'AB_minus'];
      case 'AB_plus':
      case 'AB_minus':
        return ['AB_plus', 'AB_minus'];
      default:
        return [];
    }
  }

  switch (recipientBloodGroupId) {
    case 'A_plus': return ['A_plus', 'A_minus', 'O_plus', 'O_minus'];
    case 'A_minus': return ['A_minus', 'O_minus'];
    case 'B_plus': return ['B_plus', 'B_minus', 'O_plus', 'O_minus'];
    case 'B_minus': return ['B_minus', 'O_minus'];
    case 'AB_plus': return ['A_plus', 'A_minus', 'B_plus', 'B_minus', 'AB_plus', 'AB_minus', 'O_plus', 'O_minus'];
    case 'AB_minus': return ['A_minus', 'B_minus', 'AB_minus', 'O_minus'];
    case 'O_plus': return ['O_plus', 'O_minus'];
    case 'O_minus': return ['O_minus'];
    default: return [];
  }
};

export const isBloodCompatible = (
  donorBloodGroupId: string,
  recipientBloodGroupId: string,
  componentType: BloodComponentType = 'WholeBlood'
): boolean => {
  const compatible = getCompatibleDonorGroups(recipientBloodGroupId, componentType);
  return compatible.includes(donorBloodGroupId);
};
