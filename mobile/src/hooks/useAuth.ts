/**
 * useAuth hook — Firebase auth + store sync
 */

import { useEffect } from 'react';
import { FirebaseAuth } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';

export function useAuth() {
  const { isAuthenticated, user, setLoading, signOut } = useAuthStore();

  useEffect(() => {
    const unsubscribe = FirebaseAuth.onAuthStateChanged((firebaseUser) => {
      if (!firebaseUser && isAuthenticated) {
        signOut();
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [isAuthenticated, setLoading, signOut]);

  return { isAuthenticated, user };
}
