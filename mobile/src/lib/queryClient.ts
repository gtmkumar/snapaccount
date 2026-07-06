/**
 * Shared TanStack Query client (single instance for the whole app).
 *
 * Extracted from App.tsx so non-React modules — notably the auth store's
 * signOut — can imperatively clear the server-state cache. Without this,
 * cached queries (dashboard metrics, recent activity, etc.) from a previous
 * session survive a logout and are served to the NEXT user who signs in on
 * the same running app instance, so a brand-new user sees the prior user's
 * data ("fake data" on a fresh login). See authStore.signOut().
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});
