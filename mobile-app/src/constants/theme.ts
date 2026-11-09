import { Platform } from 'react-native';

export const colors = {
  primary: '#1A4D8F',
  primaryText: '#FFFFFF',
  background: '#F5F7FA',
  surface: '#FFFFFF',
  text: '#14213D',
  muted: '#5C6B80',
  border: '#D5DCE6',
  danger: '#C62828',
  warning: '#E65100',
  success: '#2E7D32',
} as const;

/** Fuente monoespaciada del sistema en cada plataforma. */
export const monoFont = Platform.select({ ios: 'Menlo', default: 'monospace' });
