import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors, monoFont } from '@/constants/theme';
import type { TotpAccount } from '@/features/authenticator/accountSchema';
import { useTotpAccount } from '@/features/authenticator/TotpAccountContext';
import { normalizeBase32, validateBase32Secret } from '@/security/totp/base32';
import { OtpauthParseError, parseOtpauthUri } from '@/security/totp/otpauth';
import { DEFAULT_DIGITS, DEFAULT_PERIOD } from '@/security/totp/totp';

/** Acepta la semilla Base32 o el URI otpauth:// completo. Devuelve la cuenta o un mensaje de error. */
function buildAccount(secretInput: string, issuer: string, accountName: string): TotpAccount | string {
  const input = secretInput.trim();
  if (input.toLowerCase().startsWith('otpauth://')) {
    try {
      return parseOtpauthUri(input);
    } catch (e) {
      return e instanceof OtpauthParseError ? e.message : 'URI inválido.';
    }
  }
  const error = validateBase32Secret(input);
  if (error) return error;
  return {
    secret: normalizeBase32(input),
    issuer: issuer.trim() || null,
    accountName: accountName.trim(),
    digits: DEFAULT_DIGITS,
    period: DEFAULT_PERIOD,
  };
}

export default function ManualEntryScreen() {
  const { saveAccount } = useTotpAccount();
  const [issuer, setIssuer] = useState('UniSabana');
  const [accountName, setAccountName] = useState('');
  const [secret, setSecret] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const result = buildAccount(secret, issuer, accountName);
  // El error se muestra después del primer intento y luego se actualiza mientras se escribe.
  const validationError = submitted && typeof result === 'string' ? result : null;

  const onSubmit = async () => {
    setSubmitted(true);
    if (typeof result === 'string') return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveAccount(result);
      router.back();
    } catch {
      setSaveError('No se pudo guardar en el almacenamiento seguro.');
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Field label="Emisor">
          <TextInput style={styles.input} value={issuer} onChangeText={setIssuer} autoCorrect={false} />
        </Field>

        <Field label="Cuenta (opcional)">
          <TextInput
            style={styles.input}
            value={accountName}
            onChangeText={setAccountName}
            placeholder="estudiante@unisabana.edu.co"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
        </Field>

        <Field label="Semilla Base32 o URI otpauth://">
          <TextInput
            style={[styles.input, styles.secret, validationError && styles.inputError]}
            value={secret}
            onChangeText={setSecret}
            placeholder="JBSWY3DPEHPK3PXP"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            importantForAutofill="no"
            returnKeyType="done"
            onSubmitEditing={() => void onSubmit()}
          />
          {validationError && <Text style={styles.error}>{validationError}</Text>}
        </Field>

        <Button
          title="Usar semilla de prueba (Demo)"
          variant="secondary"
          onPress={() => {
            setIssuer('UniSabana');
            setAccountName('estudiante@unisabana.edu.co');
            setSecret('JBSWY3DPEHPK3PXP');
          }}
        />

        {saveError && <Text style={styles.error}>{saveError}</Text>}

        <View style={styles.actions}>
          <Button title={saving ? 'Guardando…' : 'Guardar'} onPress={() => void onSubmit()} disabled={saving} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 24, gap: 20 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.text,
  },
  secret: { fontFamily: monoFont, letterSpacing: 1 },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 14 },
  actions: { marginTop: 8 },
});
