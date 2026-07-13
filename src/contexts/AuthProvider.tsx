import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { ref, onValue } from 'firebase/database';
import { auth, db } from '../firebase';

export type Role = 'Admin' | 'Manager' | 'User';

export interface UserProfile {
  email: string;
  name: string;
  role: Role;
  campId?: string;
  createdAt: string;
}

interface AuthContextState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextState>({
  user: null,
  profile: null,
  loading: true,
  error: null,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // Fetch user profile from RTDB with retry logic to handle auth token propagation races
        const userRef = ref(db, `users/${firebaseUser.uid}`);
        let retryCount = 0;
        const maxRetries = 3;

        const attachListener = async () => {
          try {
            // Force token refresh/wait to narrow the race window
            await firebaseUser.getIdToken(true);
          } catch (e) {
            console.warn("Failed to get ID token", e);
          }

          onValue(userRef, (snapshot) => {
            const val = snapshot.val();
            if (val) {
              setProfile(val as UserProfile);
              setError(null);
            } else {
              setProfile(null);
              setError('User profile not found. Please contact an administrator.');
            }
            setLoading(false);
          }, (err) => {
            console.error(`Error fetching user profile (attempt ${retryCount + 1}):`, err);
            if (err.message.includes('permission_denied') && retryCount < maxRetries) {
              retryCount++;
              console.log(`Retrying in 500ms...`);
              setTimeout(attachListener, 500);
            } else {
              setError('Failed to load user profile. Please check your permissions.');
              setLoading(false);
            }
          });
        };

        attachListener();

      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
