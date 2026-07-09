import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  FirebaseError
} from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { auth, db } from '../firebase';

export const login = async (email: string, pass: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    return { user: userCredential.user, error: null };
  } catch (error) {
    if (error instanceof FirebaseError) {
      let message = 'An error occurred during login.';
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        message = 'Invalid email or password.';
      } else if (error.code === 'auth/network-request-failed') {
        message = 'Network error. Please check your connection and try again.';
      }
      return { user: null, error: message };
    }
    return { user: null, error: 'An unexpected error occurred.' };
  }
};

export const signupUser = async (email: string, pass: string, name: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    const user = userCredential.user;

    // Hardcode role to User (Donor)
    const userProfile = {
      email,
      name,
      role: 'User',
      createdAt: new Date().toISOString()
    };

    try {
      await set(ref(db, `users/${user.uid}`), userProfile);
    } catch (dbError) {
      // Partial state: auth created, DB write failed.
      console.error("DB write failed during signup:", dbError);
      return { user, error: 'Account created, but profile setup failed. Please contact support.' };
    }

    return { user, error: null };
  } catch (error) {
    if (error instanceof FirebaseError) {
      let message = 'An error occurred during signup.';
      if (error.code === 'auth/email-already-in-use') {
        message = 'This email is already registered. Please log in instead.';
      } else if (error.code === 'auth/weak-password') {
        message = 'Password is too weak. Please use at least 6 characters.';
      } else if (error.code === 'auth/network-request-failed') {
        message = 'Network error. Please check your connection and try again.';
      }
      return { user: null, error: message };
    }
    return { user: null, error: 'An unexpected error occurred.' };
  }
};

export const logout = async () => {
  await signOut(auth);
};
