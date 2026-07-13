import { ref, update } from 'firebase/database';
import { db } from '../firebase';
import type { Role } from '../contexts/AuthProvider';

export const updateUserRoleAndCamp = async (uid: string, role: Role, campId?: string) => {
  const updates: Record<string, any> = {
    [`users/${uid}/role`]: role,
  };
  
  if (role === 'Manager') {
    if (!campId) throw new Error('campId is required for Managers');
    updates[`users/${uid}/campId`] = campId;
  } else {
    // If not a manager, remove campId if it exists
    updates[`users/${uid}/campId`] = null;
  }

  await update(ref(db), updates);
};
