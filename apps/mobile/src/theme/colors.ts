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

  // Neutral（白ベースミニマル: 無彩色）
  white: '#FFFFFF',
  background: '#FAFAFA',
  cardBg: '#FFFFFF',
  border: '#DBDBDB',
  borderLight: '#EFEFEF',

  // Text（無彩色）
  textPrimary: '#111111',
  textSecondary: '#555555',
  textLight: '#8E8E8E',
  textMuted: '#B5B5B5',

  // Stars
  starFilled: '#F0A500',
  starEmpty: '#DBDBDB',

  // Tab bar
  tabActive: '#1D9E75',
  tabInactive: '#9A9A9A',

  // Traffic levels
  trafficLow: '#1D9E75',
  trafficMedLow: '#5BB450',
  trafficMed: '#F0A500',
  trafficMedHigh: '#E07800',
  trafficHigh: '#D63B3B',

  // Bike type chips
  chipBg: '#F4F4F4',
  chipSelected: '#1D9E75',
  chipSelectedText: '#FFFFFF',
  chipText: '#555555',

  // Overlay
  overlay: 'rgba(0,0,0,0.4)',
  overlayLight: 'rgba(0,0,0,0.1)',
} as const;

export type ColorKey = keyof typeof COLORS;
