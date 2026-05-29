import { useState, useEffect } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import api from '@/lib/api'
import { setToken, clearToken } from '@/lib/authToken'

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

// LOCAL_AUTH: real username/password login against the local DB (Firebase off in dev).
const LOCAL_AUTH = import.meta.env.VITE_LOCAL_AUTH === 'true'
const USER_KEY = 'sa_admin_user'

const VALID_ROLES: AdminRole[] = [
  'SYSTEM_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE', 'DATA_ENTRY_OPERATOR', 'PARTNER_BANK_REP',
]

function pickRole(roles: string[]): AdminRole {
  const match = roles.find(r => VALID_ROLES.includes(r as AdminRole))
  return (match as AdminRole) ?? 'SYSTEM_ADMIN'
}

function readStoredUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AdminUser) : null
  } catch {
    return null
  }
}

const DEV_MOCK_USER: AdminUser = {
  uid: 'dev-user-001', email: 'dev@snapaccount.in', displayName: 'Dev Admin', photoURL: null, role: DEV_ROLE,
}

export function useAuth(): AuthState & {
  signInWithGoogle: () => Promise<void>
  signInWithEmailPassword: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
} {
  const [state, setState] = useState<AuthState>({
    user: DEV_BYPASS ? DEV_MOCK_USER : LOCAL_AUTH ? readStoredUser() : null,
    loading: !DEV_BYPASS && !LOCAL_AUTH,
    error: null,
  })

  useEffect(() => {
    if (DEV_BYPASS || LOCAL_AUTH) return // skip Firebase listener in dev/local modes

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

  const signInWithEmailPassword = async (email: string, password: string): Promise<void> => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const res = await api.post('/auth/local/login', { email, password })
      const data = res.data as {
        accessToken: string
        userId: string
        email: string | null
        fullName: string | null
        roles: string[]
      }
      setToken(data.accessToken)
      const user: AdminUser = {
        uid: data.userId,
        email: data.email,
        displayName: data.fullName,
        photoURL: null,
        role: pickRole(data.roles ?? []),
      }
      localStorage.setItem(USER_KEY, JSON.stringify(user))
      setState({ user, loading: false, error: null })
    } catch (err) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      const message = apiError ?? (err instanceof Error ? err.message : 'Invalid email or password')
      setState(prev => ({ ...prev, loading: false, error: message }))
    }
  }

  const signOut = async (): Promise<void> => {
    if (LOCAL_AUTH || DEV_BYPASS) {
      clearToken()
      localStorage.removeItem(USER_KEY)
      setState({ user: null, loading: false, error: null })
    }
    await firebaseSignOut(auth).catch(() => undefined)
  }

  return { ...state, signInWithGoogle, signInWithEmailPassword, signOut }
}
