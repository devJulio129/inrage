// InRage visual identity
// Paleta confirmada: base oscura + acento verde Matrix + neutros cálidos
export const colors = {
  base: '#0D0D0D',         // fondo
  surface: '#2A2A2A',      // cards, surfaces
  surfaceAlt: '#1A1A1A',   // surfaces más sutiles
  accent: '#46E22A',       // verde InRage — alto impacto, igual que el panel admin
  beige: '#E8D5B7',        // text on dark, neutral cálido
  mocha: '#A47864',        // acento secundario
  textPrimary: '#E8D5B7',
  textMuted: 'rgba(232, 213, 183, 0.6)',
  border: 'rgba(232, 213, 183, 0.12)',
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
  lg: 16
};

import { Platform } from 'react-native';

export const type = {
  // System mono real en cada plataforma (Courier no existe en Android).
  mono: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  sans: 'System'
};
