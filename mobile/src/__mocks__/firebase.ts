const mockUser = { uid: 'test-uid', phoneNumber: '+919876543210', displayName: 'Test User' };
let authCallback: ((u: typeof mockUser | null) => void) | null = null;

export const FirebaseAuth = {
  onAuthStateChanged: jest.fn((cb: (u: typeof mockUser | null) => void) => {
    authCallback = cb;
    setTimeout(() => cb(mockUser), 0);
    return jest.fn(); // unsubscribe
  }),
  getIdToken: jest.fn(() => Promise.resolve('mock-id-token')),
  signOut: jest.fn(() => Promise.resolve()),
};

export default {
  auth: jest.fn(() => FirebaseAuth),
};
