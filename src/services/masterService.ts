import { ref, set, remove, get } from 'firebase/database';
import { db } from '../firebase';

export interface BloodGroup {
  name: string;
  code: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
  compatibleRecipients: string[];
}

export const bloodGroupCodes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Generate ID from code safely (e.g. A+ -> A_plus)
export const sanitizeId = (code: string) => code.replace('+', '_plus').replace('-', '_minus');

export const saveBloodGroup = async (bg: BloodGroup) => {
  const id = sanitizeId(bg.code);
  await set(ref(db, `masters/blood_group/${id}`), bg);
};

export const deleteBloodGroup = async (code: string) => {
  // Guard check: is it referenced by any other blood group's compatibleRecipients?
  const snapshot = await get(ref(db, 'masters/blood_group'));
  if (snapshot.exists()) {
    const allGroups = snapshot.val() as Record<string, BloodGroup>;
    for (const [id, group] of Object.entries(allGroups)) {
      if (group.code !== code && group.compatibleRecipients && group.compatibleRecipients.includes(code)) {
        throw new Error(`Cannot delete: Blood Group ${code} is referenced by ${group.code}.`);
      }
    }
  }

  // Safe to delete permanently
  await remove(ref(db, `masters/blood_group/${sanitizeId(code)}`));
};
