/**
 * Axios API client with Firebase Auth token injection
 * All requests automatically include Bearer token from Firebase
 */

import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import Constants from 'expo-constants';
import { FirebaseAuth } from './firebase';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  'http://localhost:5000/api';

// ─────────────────────────────────────────────────────────────────────────────
// Create axios instance
// ─────────────────────────────────────────────────────────────────────────────

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Request interceptor — attach Firebase auth token
// ─────────────────────────────────────────────────────────────────────────────

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = await FirebaseAuth.getIdToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Token fetch failed — proceed without auth (endpoint may be public)
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ─────────────────────────────────────────────────────────────────────────────
// Response interceptor — handle token expiry / common errors
// ─────────────────────────────────────────────────────────────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // 401 — try refreshing token once
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const freshToken = await FirebaseAuth.getIdToken(true);
        if (freshToken) {
          originalRequest.headers.Authorization = `Bearer ${freshToken}`;
          return apiClient(originalRequest);
        }
      } catch {
        // Refresh failed — sign out
        await FirebaseAuth.signOut();
      }
    }

    return Promise.reject(error);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Typed API helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
  statusCode: number;
}

export function getApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Partial<ApiError> | undefined;
    return {
      message: data?.message ?? error.message ?? 'An error occurred',
      errors: data?.errors,
      statusCode: error.response?.status ?? 0,
    };
  }
  return {
    message: 'An unexpected error occurred',
    statusCode: 0,
  };
}

export default apiClient;
