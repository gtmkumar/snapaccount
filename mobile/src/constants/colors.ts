/**
 * SnapAccount Design Token Colors — Redesign 2026
 * Source: docs/design/tokens.json
 * Premium Indigo + Slate palette for modern Indian fintech
 */

export const Colors = {
  // Brand Colors (Indigo — modern, trustworthy, premium)
  brand: {
    50: '#EEF2FF',
    100: '#E0E7FF',
    200: '#C7D2FE',
    300: '#A5B4FC',
    400: '#818CF8',
    500: '#6366F1',  // Primary brand
    600: '#4F46E5',  // Pressed state
    700: '#4338CA',  // Dark brand
    800: '#3730A3',
    900: '#312E81',
    950: '#1E1B4B',
  },

  // Accent Colors (Orange — warm, energetic CTAs)
  accent: {
    50: '#FFF7ED',
    100: '#FFEDD5',
    200: '#FED7AA',
    300: '#FDBA74',
    400: '#FB923C',
    500: '#F97316',  // Primary accent
    600: '#EA580C',  // Pressed accent
    700: '#C2410C',
    800: '#9A3412',
    900: '#7C2D12',
  },

  // Success (Emerald)
  success: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981',
    600: '#059669',  // Primary success
    700: '#047857',
    800: '#065F46',
    900: '#064E3B',
  },

  // Warning (Amber)
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',  // Primary warning
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },

  // Error (Rose)
  error: {
    50: '#FFF1F2',
    100: '#FFE4E6',
    200: '#FECDD3',
    300: '#FDA4AF',
    400: '#FB7185',
    500: '#F43F5E',
    600: '#E11D48',  // Primary error
    700: '#BE123C',
    800: '#9F1239',
    900: '#881337',
  },

  // Info (Sky)
  info: {
    50: '#F0F9FF',
    100: '#E0F2FE',
    200: '#BAE6FD',
    300: '#7DD3FC',
    400: '#38BDF8',
    500: '#0EA5E9',
    600: '#0284C7',  // Primary info
    700: '#0369A1',
    800: '#075985',
    900: '#0C4A6E',
  },

  // Neutral (Slate — cooler, more modern than gray)
  neutral: {
    0: '#FFFFFF',
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
    950: '#020617',
  },

  // Background & Surface
  bg: {
    base: '#F8FAFC',
    subtle: '#F1F5F9',
  },
  surface: {
    default: '#FFFFFF',
    raised: '#FFFFFF',
    overlay: 'rgba(15, 23, 42, 0.6)',
    invert: '#1E293B',
  },

  // Finance-specific
  positive: '#059669',   // Profit, income, refund
  negative: '#DC2626',   // Loss, expense, tax owed
  gst: '#7C3AED',        // GST module accent (Violet)
  itr: '#0891B2',        // ITR module accent (Cyan)
  loan: '#EA580C',       // Loan module accent (Orange)
  docs: '#6366F1',       // Documents module accent (Indigo)
} as const;

export type ColorToken = typeof Colors;

// Semantic shortcuts
export const C = {
  primary: Colors.brand[500],
  primaryDark: Colors.brand[600],
  accent: Colors.accent[500],
  background: Colors.bg.base,
  surface: Colors.surface.default,
  text: Colors.neutral[900],
  textSecondary: Colors.neutral[500],
  textMuted: Colors.neutral[400],
  border: Colors.neutral[200],
  borderFocus: Colors.brand[500],
  success: Colors.success[600],
  warning: Colors.warning[600],
  error: Colors.error[600],
  info: Colors.info[600],
} as const;
