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

export const getCompatibleDonorGroups = (recipientBloodGroupId: string): string[] => {
  // Returns the list of donor blood group IDs that are compatible with the recipient
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

export const saveBloodGroup = async (bg: BloodGroup) => {
  const id = sanitizeId(bg.code);
  await set(ref(db, `masters/blood_group/${id}`), bg);
};

export const deleteBloodGroup = async (code: string) => {
  // Guard check: is it referenced by any other blood group's compatibleRecipients?
  const snapshot = await get(ref(db, 'masters/blood_group'));
  if (snapshot.exists()) {
    const allGroups = snapshot.val() as Record<string, BloodGroup>;
    for (const [, group] of Object.entries(allGroups)) {
      if (group.code !== code && group.compatibleRecipients && group.compatibleRecipients.includes(code)) {
        throw new Error(`Cannot delete: Blood Group ${code} is referenced by ${group.code}.`);
      }
    }
  }

  // Safe to delete permanently
  await remove(ref(db, `masters/blood_group/${sanitizeId(code)}`));
};

export const getBloodGroups = async (): Promise<Record<string, BloodGroup>> => {
  const snapshot = await get(ref(db, 'masters/blood_group'));
  return snapshot.exists() ? snapshot.val() : {};
};

export interface Camp {
  name: string;
  code: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
}

export const saveCamp = async (camp: Camp) => {
  const id = sanitizeId(camp.code);
  await set(ref(db, `masters/camp/${id}`), camp);
};

export const deleteCamp = async (code: string) => {
  const id = sanitizeId(code);
  
  // Guard check: is this camp referenced by any user?
  const snapshot = await get(ref(db, 'users'));
  if (snapshot.exists()) {
    const allUsers = snapshot.val();
    let count = 0;
    for (const [, user] of Object.entries(allUsers)) {
      if ((user as any).campId === id) {
        count++;
      }
    }
    if (count > 0) {
      throw new Error(`Cannot delete: ${count} user(s) are assigned to this camp.`);
    }
  }

  // Safe to delete permanently
  await remove(ref(db, `masters/camp/${id}`));
};

export const getCamps = async (): Promise<Record<string, Camp>> => {
  const snapshot = await get(ref(db, 'masters/camp'));
  return snapshot.exists() ? snapshot.val() : {};
};

export interface Hospital {
  name: string;
  code: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
  address: string;
}

export const saveHospital = async (hospital: Hospital) => {
  const id = sanitizeId(hospital.code);
  await set(ref(db, `masters/hospital/${id}`), hospital);
};

export const deleteHospital = async (code: string) => {
  const id = sanitizeId(code);
  await remove(ref(db, `masters/hospital/${id}`));
};

export const getHospitals = async (): Promise<Record<string, Hospital>> => {
  const snapshot = await get(ref(db, 'masters/hospital'));
  return snapshot.exists() ? snapshot.val() : {};
};
