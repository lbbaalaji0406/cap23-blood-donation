import { useState, useEffect } from 'react';
import { ref, onValue, query, QueryConstraint } from 'firebase/database';
import { db } from '../firebase';

export function useRTDB<T>(path: string, queryConstraints: QueryConstraint[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    let dbRef = ref(db, path);
    
    // In Firebase SDK 9+, query() creates a new Query object if constraints are provided.
    // Otherwise we just pass the dbRef to onValue.
    const q = queryConstraints.length > 0 ? query(dbRef, ...queryConstraints) : dbRef;

    const unsubscribe = onValue(
      q,
      (snapshot) => {
        if (snapshot.exists()) {
          // If the path is a list, snapshot.val() is an object where keys are IDs.
          setData(snapshot.val());
        } else {
          setData(null);
        }
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error(`Error fetching RTDB path ${path}:`, err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      // In SDK 9+, onValue returns an unsubscribe function.
      unsubscribe();
    };
  }, [path, JSON.stringify(queryConstraints)]);

  return { data, loading, error };
}
