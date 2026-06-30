import { createContext, useContext } from 'react';
import { Platform } from 'react-native';

const darkColors = {
  mode: 'dark',
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
  shadow: 'rgba(0, 0, 0, 0.45)',
  danger: '#FF4444',
  success: '#46E22A',
  accentText: '#05230b'
};

const lightColors = {
  ...darkColors,
  mode: 'light',
  base: '#ECEFE8',
  baseElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F4EE',
  surfaceSoft: '#E5EADD',
  accentSoft: 'rgba(47, 184, 22, 0.13)',
  textPrimary: '#0B120B',
  textMuted: 'rgba(11, 18, 11, 0.68)',
  textFaint: 'rgba(11, 18, 11, 0.48)',
  border: 'rgba(11, 18, 11, 0.20)',
  borderStrong: 'rgba(31, 112, 18, 0.42)',
  shadow: 'rgba(18, 28, 18, 0.18)'
};

export const themes = {
  dark: darkColors,
  light: lightColors
};

export const colors = themes.dark;

export const ThemeContext = createContext({
  colors,
  themeMode: 'system',
  activeThemeName: 'dark',
  setThemeMode: () => {}
});

export function useAppTheme() {
  return useContext(ThemeContext)?.colors || colors;
}

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
