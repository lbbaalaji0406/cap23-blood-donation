import { ref, push, serverTimestamp, get, onValue, set } from 'firebase/database';
import { db as database } from '../firebase';

export interface Comment {
  id?: string;
  text: string;
  authorUid: string;
  authorName: string;
  createdAt: number;
}

export interface CommentsEnvelope {
  campId: string;
  items: Record<string, Comment>;
}

export const commentService = {
  // Subscribe to comments for a transaction
  subscribeToComments: (transactionId: string, onUpdate: (comments: Comment[]) => void) => {
    const commentsRef = ref(database, `comments/${transactionId}/items`);
    return onValue(commentsRef, (snapshot) => {
      const results: Comment[] = [];
      if (snapshot.exists()) {
        snapshot.forEach((child) => {
          results.push({ id: child.key, ...child.val() } as Comment);
        });
      }
      // Sort ascending by createdAt
      results.sort((a, b) => a.createdAt - b.createdAt);
      onUpdate(results);
    });
  },

  // Add a new comment
  addComment: async (
    transactionId: string,
    campId: string, // Needed to enforce envelope shape on first comment
    authorUid: string,
    authorName: string,
    text: string
  ): Promise<void> => {
    // 1. Check if the envelope exists, if not create it with campId
    const envRef = ref(database, `comments/${transactionId}/campId`);
    const envSnap = await get(envRef);
    if (!envSnap.exists()) {
      await set(envRef, campId);
    }

    // 2. Add the comment to items
    const itemsRef = ref(database, `comments/${transactionId}/items`);
    const newCommentRef = push(itemsRef);
    
    await set(newCommentRef, {
      text,
      authorUid,
      authorName,
      createdAt: serverTimestamp()
    });
  }
};
