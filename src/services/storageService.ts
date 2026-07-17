import { ref, push, serverTimestamp, get, set, onValue } from 'firebase/database';
import { db as database } from '../firebase';

export interface Attachment {
  id?: string;
  fileName: string;
  storageUrl: string;
  size: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: number;
}

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const storageService = {
  subscribeToAttachments: (transactionId: string, onUpdate: (attachments: Attachment[]) => void) => {
    const attachmentsRef = ref(database, `attachments/${transactionId}/items`);
    return onValue(attachmentsRef, (snapshot) => {
      const results: Attachment[] = [];
      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          results.push({ id: child.key, ...child.val() } as Attachment);
        });
      }
      // Sort descending by uploadedAt
      results.sort((a, b) => b.uploadedAt - a.uploadedAt);
      onUpdate(results);
    });
  },

  uploadFile: async (
    transactionId: string,
    campId: string,
    file: File,
    uploaderUid: string
  ): Promise<void> => {
    // 1. Upload to Cloudinary
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);

    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;
    
    const response = await fetch(cloudinaryUrl, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Cloudinary upload failed: ${errText}`);
    }

    const data = await response.json();
    const storageUrl = data.secure_url;

    // 2. Save metadata to RTDB using envelope approach
    const envRef = ref(database, `attachments/${transactionId}/campId`);
    const envSnap = await get(envRef);
    if (!envSnap.exists()) {
      await set(envRef, campId);
    }

    const itemsRef = ref(database, `attachments/${transactionId}/items`);
    const newAttachmentRef = push(itemsRef);

    await set(newAttachmentRef, {
      fileName: file.name,
      storageUrl,
      size: file.size,
      mimeType: file.type,
      uploadedBy: uploaderUid,
      uploadedAt: serverTimestamp()
    });
  }
};
