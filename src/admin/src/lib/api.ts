import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios'
import { auth } from './firebase'
import { getToken, clearToken } from './authToken'

const baseURL = import.meta.env.VITE_API_BASE_URL as string | undefined ?? '/api'

export const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
})

// Request interceptor — attach Firebase Auth token
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const user = auth.currentUser
    if (user) {
      const token = await user.getIdToken()
      config.headers.Authorization = `Bearer ${token}`
    } else {
      // LOCAL_AUTH: attach the JWT issued by /auth/local/login (if present).
      const localToken = getToken()
      if (localToken) config.headers.Authorization = `Bearer ${localToken}`
    }
    return config
  },
  (error: unknown) => Promise.reject(error)
)

// Response interceptor — handle 401
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // Token expired — sign out (clear both Firebase session and local-auth token)
      clearToken()
      await auth.signOut().catch(() => undefined)
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
