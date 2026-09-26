import { ref, update } from 'firebase/database';
import { db } from '../firebase';
import type { Role } from '../contexts/AuthProvider';

export const updateUserRoleAndCamp = async (uid: string, role: Role, campId?: string, hospitalId?: string) => {
  const updates: Record<string, any> = {
    [`users/${uid}/role`]: role,
  };
  
  if (role === 'Manager') {
    if (!campId) throw new Error('campId is required for Managers');
    updates[`users/${uid}/campId`] = campId;
    updates[`users/${uid}/hospitalId`] = null;
  } else if (role === 'Hospital') {
    if (!hospitalId) throw new Error('hospitalId is required for Hospital users');
    updates[`users/${uid}/hospitalId`] = hospitalId;
    updates[`users/${uid}/campId`] = null;
  } else {
    // If not a manager or hospital, clean up structural fields
    updates[`users/${uid}/campId`] = null;
    updates[`users/${uid}/hospitalId`] = null;
  }

  await update(ref(db), updates);
};
