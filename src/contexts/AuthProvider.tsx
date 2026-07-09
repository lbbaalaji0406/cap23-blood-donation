import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { ref, onValue, off } from 'firebase/database';
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
        
        // Fetch user profile from RTDB
        const userRef = ref(db, `users/${firebaseUser.uid}`);
        
        onValue(userRef, (snapshot) => {
          const val = snapshot.val();
          if (val) {
            setProfile(val as UserProfile);
            setError(null);
          } else {
            // Handle orphaned auth account
            setProfile(null);
            setError('User profile not found. Please contact an administrator.');
          }
          setLoading(false);
        }, (err) => {
          console.error("Error fetching user profile:", err);
          setError('Failed to load user profile. Please check your permissions.');
          setLoading(false);
        });

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
