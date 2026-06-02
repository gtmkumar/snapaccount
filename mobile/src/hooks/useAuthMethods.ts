import { useQuery } from '@tanstack/react-query';
import apiClient from '../lib/api';

/**
 * Login methods the backend says clients should offer.
 * Rule: when SMS/WhatsApp OTP is enabled, the phone+password option is hidden
 * (password is an optional fallback used only when no OTP channel is configured).
 */
export interface AuthMethods {
  otp: boolean;
  whatsApp: boolean;
  password: boolean;
}

const DEFAULT_METHODS: AuthMethods = { otp: false, whatsApp: false, password: true };

export function useAuthMethods() {
  const query = useQuery<AuthMethods>({
    queryKey: ['auth', 'methods'],
    queryFn: async () => {
      const res = await apiClient.get<AuthMethods>('/auth/methods');
      return res.data;
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  const methods = query.data ?? DEFAULT_METHODS;
  const otpEnabled = methods.otp || methods.whatsApp;

  return {
    methods,
    otpEnabled,
    // Show phone+password only when password is allowed AND no OTP channel is on.
    showPasswordOption: methods.password && !otpEnabled,
    isLoading: query.isLoading,
  };
}
