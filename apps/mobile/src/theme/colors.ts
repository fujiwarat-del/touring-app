export const COLORS = {
  // Primary brand color
  primary: '#1D9E75',
  primaryDark: '#157A5B',
  primaryLight: '#E8F8F3',
  primaryMid: '#2BB88A',

  // Secondary
  secondary: '#F0A500',
  secondaryLight: '#FEF7E6',

  // Status colors
  success: '#5BB450',
  successLight: '#EDF7EC',
  warning: '#E07800',
  warningLight: '#FEF0E0',
  danger: '#D63B3B',
  dangerLight: '#FDECEC',
  info: '#2196F3',
  infoLight: '#E3F2FD',

  // Neutral
  white: '#FFFFFF',
  background: '#F5F7F5',
  cardBg: '#FFFFFF',
  border: '#E0E8E4',
  borderLight: '#F0F4F2',

  // Text
  textPrimary: '#1A2E25',
  textSecondary: '#4A6B5A',
  textLight: '#8AA898',
  textMuted: '#B0C8BC',

  // Stars
  starFilled: '#F0A500',
  starEmpty: '#E0E8E4',

  // Tab bar
  tabActive: '#1D9E75',
  tabInactive: '#8AA898',

  // Traffic levels
  trafficLow: '#1D9E75',
  trafficMedLow: '#5BB450',
  trafficMed: '#F0A500',
  trafficMedHigh: '#E07800',
  trafficHigh: '#D63B3B',

  // Bike type chips
  chipBg: '#F0F7F4',
  chipSelected: '#1D9E75',
  chipSelectedText: '#FFFFFF',
  chipText: '#4A6B5A',

  // Overlay
  overlay: 'rgba(0,0,0,0.4)',
  overlayLight: 'rgba(0,0,0,0.1)',
} as const;

export type ColorKey = keyof typeof COLORS;
