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
import { setToken, clearSession, getStoredUser, setStoredUser, getToken } from '@/lib/authToken'
import { revokeAdminSession } from '@/lib/api'

export type AdminRole =
  | 'SUPER_ADMIN'
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
    'SUPER_ADMIN',
    'OPERATIONS_MANAGER',
    'CA',
    'SUPPORT_EXECUTIVE',
    'DATA_ENTRY_OPERATOR',
    'PARTNER_BANK_REP',
  ]
  if (role && validRoles.includes(role as AdminRole)) {
    return role as AdminRole
  }
  // For development: check email domain or use SUPER_ADMIN for admins
  if (user.email?.endsWith('@snapaccount.in')) {
    return 'SUPER_ADMIN'
  }
  return 'DATA_ENTRY_OPERATOR'
}

// Dev bypass: skip Firebase and inject a mock admin user for local UI testing
const DEV_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === 'true'
const DEV_ROLE = (import.meta.env.VITE_DEV_USER_ROLE ?? 'SUPER_ADMIN') as AdminRole

// LOCAL_AUTH: real username/password login against the local DB (Firebase off in dev).
const LOCAL_AUTH = import.meta.env.VITE_LOCAL_AUTH === 'true'

const VALID_ROLES: AdminRole[] = [
  'SUPER_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE', 'DATA_ENTRY_OPERATOR', 'PARTNER_BANK_REP',
]

/**
 * Least-privilege fallback for the client-side `role`. Roles that this admin panel
 * does not model as staff roles (e.g. the org-member roles ORG_ADMIN / MANAGER /
 * HR / REVIEWER, or any future/unknown role) map here rather than to a staff role.
 *
 * NEVER default to SUPER_ADMIN: `role` gates the /settings AuthGuard and the legacy
 * static permission map, and a fail-open default let org-member accounts reach the
 * platform-admin surface (ACM-01/02/06). Mirrors getRoleFromToken's default.
 *
 * Actual authorization is enforced server-side via /auth/me/permissions
 * (see usePermission / RoutePermissionGuard); this value is display + coarse gating only.
 */
const FALLBACK_ROLE: AdminRole = 'DATA_ENTRY_OPERATOR'

/**
 * Map the server's role list to the single AdminRole this UI uses. Picks the
 * most-privileged *known* staff role present, and fails CLOSED to the
 * least-privilege role when none of the caller's roles are staff roles.
 */
export function pickRole(roles: string[]): AdminRole {
  const known = roles.filter((r): r is AdminRole => VALID_ROLES.includes(r as AdminRole))
  if (known.length === 0) return FALLBACK_ROLE
  // Prefer the highest-privilege staff role the caller actually holds.
  return known.sort(
    (a, b) => VALID_ROLES.indexOf(a) - VALID_ROLES.indexOf(b),
  )[0]
}

function readStoredUser(): AdminUser | null {
  try {
    const stored = getStoredUser()
    return stored ? (stored as AdminUser) : null
  } catch {
    return null
  }
}

/** LOCAL_AUTH: only restore a session when a token is present (avoids zombie UI). */
function resolveLocalAuthUser(): AdminUser | null {
  if (!getToken()) return null
  return readStoredUser()
}

const DEV_MOCK_USER: AdminUser = {
  uid: 'dev-user-001', email: 'dev@snapaccount.in', displayName: 'Dev Admin', photoURL: null, role: DEV_ROLE,
}

// Shape returned by POST /auth/local/login
interface LocalLoginResponse {
  token: string | null
  userId: string
  email: string | null
  fullName: string | null
  roles: string[]
  permissions: string[]
  requires2fa: boolean
  challengeToken: string | null
}

// Shape returned by POST /auth/2fa/challenge
interface ChallengeResponse {
  token: string
  userId: string
}

// Additional auth state for the 2FA challenge step
interface TwoFaChallengeState {
  pending: boolean          // true while waiting for the user to enter their TOTP code
  challengeToken: string    // opaque token from the login response
}

export function useAuth(): AuthState & {
  signInWithGoogle: () => Promise<void>
  signInWithEmailPassword: (email: string, password: string) => Promise<void>
  submit2FaChallenge: (code: string) => Promise<void>
  signOut: () => Promise<void>
  twoFaChallenge: TwoFaChallengeState | null
} {
  const [state, setState] = useState<AuthState>({
    user: DEV_BYPASS ? DEV_MOCK_USER : LOCAL_AUTH ? resolveLocalAuthUser() : null,
    loading: DEV_BYPASS ? false : LOCAL_AUTH ? Boolean(getToken()) : true,
    error: null,
  })
  // Separate piece of state so the login page can render a second step without
  // needing to store it in localStorage or pass it through the router.
  const [twoFaChallenge, setTwoFaChallenge] = useState<TwoFaChallengeState | null>(null)

  // DEV_AUTH_BYPASS: always use the canned backend token (overwrite stale localStorage tokens).
  useEffect(() => {
    if (DEV_BYPASS) {
      setToken('dev-superadmin-token')
    }
  }, [])

  // LOCAL_AUTH: validate stored token before rendering protected routes.
  useEffect(() => {
    if (!LOCAL_AUTH || DEV_BYPASS) return

    const token = getToken()
    if (!token) {
      if (readStoredUser()) clearSession()
      setState(prev => (prev.user ? { ...prev, user: null, loading: false } : { ...prev, loading: false }))
      return
    }

    let cancelled = false
    void (async () => {
      try {
        await api.get('/auth/me')
        if (!cancelled) setState(prev => ({ ...prev, loading: false }))
      } catch {
        if (!cancelled) {
          clearSession()
          setState({ user: null, loading: false, error: null })
        }
      }
    })()

    return () => { cancelled = true }
  }, [])

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
    setTwoFaChallenge(null)
    try {
      const res = await api.post<LocalLoginResponse>('/auth/local/login', { email, password })
      const data = res.data

      // 2FA required — store the challenge token and surface a second step to the UI.
      if (data.requires2fa) {
        setState(prev => ({ ...prev, loading: false, error: null }))
        setTwoFaChallenge({ pending: true, challengeToken: data.challengeToken ?? '' })
        return
      }

      // Normal path — token is returned directly.
      setToken(data.token ?? '')
      const user: AdminUser = {
        uid: data.userId,
        email: data.email,
        displayName: data.fullName,
        photoURL: null,
        role: pickRole(data.roles ?? []),
      }
      setStoredUser(user)
      setState({ user, loading: false, error: null })
    } catch (err) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      const message = apiError ?? (err instanceof Error ? err.message : 'Invalid email or password')
      setState(prev => ({ ...prev, loading: false, error: message }))
    }
  }

  const submit2FaChallenge = async (code: string): Promise<void> => {
    if (!twoFaChallenge) return
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const res = await api.post<ChallengeResponse>('/auth/2fa/challenge', {
        challengeToken: twoFaChallenge.challengeToken,
        code,
      })
      const data = res.data
      setToken(data.token)
      // The challenge response carries userId but not the full profile — re-use
      // what we already know about the user from the first step (stored in twoFaChallenge
      // context).  userId is present; the rest fall back to empty until the app fetches
      // /auth/me.  For now build a minimal user so AuthGuard lets the app through.
      const storedUser = readStoredUser()
      const user: AdminUser = storedUser ?? {
        uid: data.userId,
        email: null,
        displayName: null,
        photoURL: null,
        // Fail closed: never assume SUPER_ADMIN for the minimal post-2FA user.
        role: FALLBACK_ROLE,
      }
      setStoredUser({ ...user, uid: data.userId })
      setTwoFaChallenge(null)
      setState({ user: { ...user, uid: data.userId }, loading: false, error: null })
    } catch (err) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      const message = apiError ?? (err instanceof Error ? err.message : 'Invalid code. Please try again.')
      setState(prev => ({ ...prev, loading: false, error: message }))
    }
  }

  const signOut = async (): Promise<void> => {
    if (LOCAL_AUTH || DEV_BYPASS) {
      clearSession()
      setState({ user: null, loading: false, error: null })
      return
    }
    // Production path: revoke httpOnly cookie server-side (GAP-051)
    await revokeAdminSession().catch(() => undefined)
    clearSession()
    await firebaseSignOut(auth).catch(() => undefined)
    setState({ user: null, loading: false, error: null })
  }

  return { ...state, signInWithGoogle, signInWithEmailPassword, submit2FaChallenge, signOut, twoFaChallenge }
}
