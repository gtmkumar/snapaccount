/**
 * Firebase — Expo Go compatible mock for simulator testing
 * AUTO-AUTHENTICATED: navigates directly to app screens for screenshot testing
 */

export type FirebaseAuthTypes = {
  User: {
    uid: string;
    phoneNumber: string | null;
    getIdToken: (refresh?: boolean) => Promise<string>;
  };
  ConfirmationResult: {
    confirm: (otp: string) => Promise<FirebaseAuthTypes['UserCredential'] | null>;
    verificationId: string;
  };
  UserCredential: {
    user: FirebaseAuthTypes['User'];
  };
};

const mockUser: FirebaseAuthTypes['User'] = {
  uid: 'mock-uid-001',
  phoneNumber: '+919876543210',
  getIdToken: async () => 'mock-id-token',
};

// Start logged IN so SplashScreen navigates to App
let _currentUser: FirebaseAuthTypes['User'] | null = mockUser;
const _listeners: Array<(user: FirebaseAuthTypes['User'] | null) => void> = [];

export const auth = () => ({
  currentUser: _currentUser,
  signOut: async () => {
    _currentUser = null;
    _listeners.forEach(fn => fn(null));
  },
  onAuthStateChanged: (callback: (user: FirebaseAuthTypes['User'] | null) => void) => {
    _listeners.push(callback);
    callback(_currentUser);
    return () => {
      const idx = _listeners.indexOf(callback);
      if (idx !== -1) _listeners.splice(idx, 1);
    };
  },
});

export const FirebaseAuth = {
  sendOTP: async (phoneNumber: string): Promise<FirebaseAuthTypes['ConfirmationResult']> => {
    return {
      verificationId: 'mock-verification-id',
      confirm: async (otp: string) => {
        _currentUser = mockUser;
        _listeners.forEach(fn => fn(mockUser));
        return { user: mockUser };
      },
    };
  },

  verifyOTP: async (
    confirmation: FirebaseAuthTypes['ConfirmationResult'],
    otp: string,
  ): Promise<FirebaseAuthTypes['UserCredential']> => {
    const result = await confirmation.confirm(otp);
    if (!result) throw new Error('OTP verification failed');
    return result;
  },

  signOut: async (): Promise<void> => {
    _currentUser = null;
    _listeners.forEach(fn => fn(null));
  },

  getIdToken: async (forceRefresh = false): Promise<string | null> => {
    if (!_currentUser) return null;
    return _currentUser.getIdToken(forceRefresh);
  },

  getCurrentUser: (): FirebaseAuthTypes['User'] | null => _currentUser,

  onAuthStateChanged: (
    callback: (user: FirebaseAuthTypes['User'] | null) => void,
  ) => {
    _listeners.push(callback);
    callback(_currentUser);
    return () => {
      const idx = _listeners.indexOf(callback);
      if (idx !== -1) _listeners.splice(idx, 1);
    };
  },
};
