/**
 * theme.ts
 * FabricMatcher UI Design Tokens & Theme Definitions
 */

export const Colors = {
  background: '#0D1F22',
  surface: '#152C30',
  surfaceSecondary: '#1C3A3F',
  border: 'rgba(255, 255, 255, 0.12)',

  textPrimary: '#FFFFFF',
  textSecondary: '#A3B8CC',
  textMuted: '#6B8296',
  textInverse: '#0D1F22',

  teal500: '#14B8A6',
  teal600: '#0D9488',
  teal700: '#0F766E',

  white: '#FFFFFF',
  samplingSquare: '#2DD4BF',
};

export const Typography = {
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 36,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

export const Spacing = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64];

export const BorderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 4,
  },
};

export const StatusColors: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  within_trial_tolerance: {
    bg: 'rgba(20, 184, 166, 0.2)',
    border: '#14B8A6',
    text: '#2DD4BF',
  },
  outside_trial_tolerance: {
    bg: 'rgba(239, 68, 68, 0.2)',
    border: '#EF4444',
    text: '#FCA5A5',
  },
  borderline: {
    bg: 'rgba(245, 158, 11, 0.2)',
    border: '#F59E0B',
    text: '#FCD34D',
  },
  recapture: {
    bg: 'rgba(107, 114, 128, 0.2)',
    border: '#6B7280',
    text: '#9CA3AF',
  },
};
