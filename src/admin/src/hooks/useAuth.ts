import { useState, useEffect } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'

export type AdminRole =
  | 'SYSTEM_ADMIN'
  | 'OPERATIONS_MANAGER'
  | 'CA'
  | 'SUPPORT_EXECUTIVE'
  | 'DATA_ENTRY_OPERATOR'
  | 'PARTNER_BANK_REP'

export interface AdminUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  role: AdminRole
}

interface AuthState {
  user: AdminUser | null
  loading: boolean
  error: string | null
}

// Extract role from Firebase custom claims (set by backend)
async function getRoleFromToken(user: User): Promise<AdminRole> {
  const idTokenResult = await user.getIdTokenResult()
  const role = idTokenResult.claims['role'] as string | undefined
  // Default to DATA_ENTRY_OPERATOR if no role set (dev mode)
  const validRoles: AdminRole[] = [
    'SYSTEM_ADMIN',
    'OPERATIONS_MANAGER',
    'CA',
    'SUPPORT_EXECUTIVE',
    'DATA_ENTRY_OPERATOR',
    'PARTNER_BANK_REP',
  ]
  if (role && validRoles.includes(role as AdminRole)) {
    return role as AdminRole
  }
  // For development: check email domain or use SYSTEM_ADMIN for admins
  if (user.email?.endsWith('@snapaccount.in')) {
    return 'SYSTEM_ADMIN'
  }
  return 'DATA_ENTRY_OPERATOR'
}

// Dev bypass: skip Firebase and inject a mock admin user for local UI testing
const DEV_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === 'true'
const DEV_ROLE = (import.meta.env.VITE_DEV_USER_ROLE ?? 'SYSTEM_ADMIN') as AdminRole

export function useAuth(): AuthState & {
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
} {
  const [state, setState] = useState<AuthState>({
    user: DEV_BYPASS ? {
      uid: 'dev-user-001',
      email: 'dev@snapaccount.in',
      displayName: 'Dev Admin',
      photoURL: null,
      role: DEV_ROLE,
    } : null,
    loading: !DEV_BYPASS,
    error: null,
  })

  useEffect(() => {
    if (DEV_BYPASS) return // skip Firebase listener in dev bypass mode

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const role = await getRoleFromToken(firebaseUser)
          setState({
            user: {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              role,
            },
            loading: false,
            error: null,
          })
        } catch {
          setState({ user: null, loading: false, error: 'Failed to get user role' })
        }
      } else {
        setState({ user: null, loading: false, error: null })
      }
    })

    return unsubscribe
  }, [])

  const signInWithGoogle = async (): Promise<void> => {
    if (DEV_BYPASS) {
      setState({ user: { uid: 'dev-user-001', email: 'dev@snapaccount.in', displayName: 'Dev Admin', photoURL: null, role: DEV_ROLE }, loading: false, error: null })
      return
    }
    setState(prev => ({ ...prev, loading: true, error: null }))
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ hd: 'snapaccount.in' }) // Restrict to org domain
    try {
      await signInWithPopup(auth, provider)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed'
      setState(prev => ({ ...prev, loading: false, error: message }))
    }
  }

  const signOut = async (): Promise<void> => {
    await firebaseSignOut(auth)
  }

  return { ...state, signInWithGoogle, signOut }
}
