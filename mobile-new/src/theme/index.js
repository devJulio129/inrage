import { Platform } from 'react-native';

export const colors = {
  base: '#050605',
  baseElevated: '#090B09',
  surface: '#121512',
  surfaceAlt: '#0C0F0C',
  surfaceSoft: '#181C17',
  accent: '#46E22A',
  accentDim: '#2BBE17',
  accentSoft: 'rgba(70, 226, 42, 0.12)',
  beige: '#E8D5B7',
  ivory: '#F5EFE5',
  mocha: '#A47864',
  textPrimary: '#F2E8D8',
  textMuted: 'rgba(242, 232, 216, 0.58)',
  textFaint: 'rgba(242, 232, 216, 0.36)',
  border: 'rgba(242, 232, 216, 0.10)',
  borderStrong: 'rgba(70, 226, 42, 0.28)',
  danger: '#FF4444'
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48
};

export const radii = {
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24
};

export const type = {
  mono: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  sans: 'System',
  display: 'BebasNeue_400Regular'
};
