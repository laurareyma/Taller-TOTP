import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
}

export function Button({ title, onPress, variant = 'primary', disabled = false }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.base, styles[variant], pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.text, variant === 'primary' ? styles.textPrimary : { color: textColor[variant] }]}>
        {title}
      </Text>
    </Pressable>
  );
}

const textColor: Record<Exclude<Variant, 'primary'>, string> = {
  secondary: colors.primary,
  danger: colors.danger,
};

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  danger: { backgroundColor: 'transparent' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  text: { fontSize: 16, fontWeight: '600' },
  textPrimary: { color: colors.primaryText },
});
