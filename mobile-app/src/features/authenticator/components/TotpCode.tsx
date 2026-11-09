import { StyleSheet, Text } from 'react-native';

import { colors, monoFont } from '@/constants/theme';

import { formatCode } from '../accountSchema';

interface TotpCodeProps {
  code: string | null;
  digits: number;
  urgent: boolean;
}

export function TotpCode({ code, digits, urgent }: TotpCodeProps) {
  const shown = code ?? '•'.repeat(digits);
  return (
    <Text
      style={[styles.code, urgent && styles.urgent]}
      // El lector de pantalla lee dígito por dígito.
      accessibilityLabel={code ? `Código ${code.split('').join(' ')}` : 'Calculando código'}
      selectable
    >
      {formatCode(shown)}
    </Text>
  );
}

const styles = StyleSheet.create({
  code: {
    fontFamily: monoFont,
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: 4,
    fontVariant: ['tabular-nums'], // todos los dígitos del mismo ancho: el texto no "salta"
    color: colors.text,
    textAlign: 'center',
  },
  urgent: { color: colors.warning },
});
