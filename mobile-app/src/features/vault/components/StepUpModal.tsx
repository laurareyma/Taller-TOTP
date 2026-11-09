import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors, monoFont } from '@/constants/theme';
import type { TotpAccount } from '@/features/authenticator/accountSchema';
import { formatCode } from '@/features/authenticator/accountSchema';
import { useTotpAccount } from '@/features/authenticator/TotpAccountContext';
import { useTotp } from '@/features/authenticator/useTotp';

import { MfaError, verifyMfa } from '../vaultApi';

const CODE_LENGTH = 6;

interface StepUpModalProps {
  visible: boolean;
  stepUpToken: string;
  /** Instante (ms) en que vence el step_up_token. */
  expiresAt: number;
  onVerified: (code: string) => void;
  onCancel: () => void;
  /** El step_up_token venció o se agotaron los intentos: hay que pedir uno nuevo. */
  onRestart: () => void;
}

export function StepUpModal({ visible, stepUpToken, expiresAt, onVerified, onCancel, onRestart }: StepUpModalProps) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<MfaError | null>(null);
  const secondsLeft = useSecondsLeft(expiresAt, visible);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  // Un step_up_token nuevo empieza limpio.
  useEffect(() => {
    setCode('');
    setError(null);
  }, [stepUpToken]);

  const submit = async (value: string) => {
    if (submitting || value.length !== CODE_LENGTH) return;
    setSubmitting(true);
    setError(null);
    try {
      await verifyMfa(stepUpToken, value);
      onVerified(value);
    } catch (e) {
      setError(e instanceof MfaError ? e : new MfaError('server', 'No hay conexión con el servidor.', 0));
      setCode('');
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const onChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void submit(digits); // envío automático al completar
  };

  const blocked = secondsLeft === 0 || error?.code === 'too_many_attempts' || error?.code === 'step_up_expired';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Verificación en dos pasos</Text>
          <Text style={styles.body}>La bóveda crítica requiere el código de 6 dígitos de tu Authenticator.</Text>

          <TextInput
            ref={inputRef}
            style={[styles.input, error && styles.inputError]}
            value={code}
            onChangeText={onChange}
            keyboardType="number-pad"
            inputMode="numeric"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            autoFocus
            editable={!submitting && !blocked}
            placeholder="••••••"
            placeholderTextColor={colors.border}
            accessibilityLabel="Código de verificación de 6 dígitos"
          />

          {error && (
            <Text style={[styles.message, error.code === 'replay_detected' && styles.replay]}>
              {error.status === 409 ? '409 · ' : ''}
              {error.message}
              {error.attemptsLeft !== undefined ? ` Intentos restantes: ${error.attemptsLeft}.` : ''}
            </Text>
          )}
          {!error && (
            <Text style={styles.timer}>{secondsLeft > 0 ? `La solicitud vence en ${secondsLeft} s` : 'La solicitud venció.'}</Text>
          )}

          <MyAuthenticatorHint />

          <View style={styles.actions}>
            {blocked ? (
              <Button title="Solicitar de nuevo" onPress={onRestart} />
            ) : (
              <Button
                title={submitting ? 'Verificando…' : 'Verificar'}
                onPress={() => void submit(code)}
                disabled={submitting || code.length !== CODE_LENGTH}
              />
            )}
            <Button title="Cancelar" variant="danger" onPress={onCancel} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Si la cuenta TOTP está en esta misma app, permite ver el código sin salir del modal. */
function MyAuthenticatorHint() {
  const { account } = useTotpAccount();
  const [shown, setShown] = useState(false);
  if (!account) return null;
  return shown ? (
    <LiveCode account={account} />
  ) : (
    <Pressable onPress={() => setShown(true)} accessibilityRole="button">
      <Text style={styles.link}>Ver código de mi Authenticator</Text>
    </Pressable>
  );
}

function LiveCode({ account }: { account: TotpAccount }) {
  const { code, secondsLeft } = useTotp(account);
  return (
    <Text style={styles.live}>
      Mi Authenticator: <Text style={styles.liveCode}>{code ? formatCode(code) : '…'}</Text> ({secondsLeft} s)
    </Text>
  );
}

function useSecondsLeft(expiresAt: number, active: boolean): number {
  const compute = () => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  const [seconds, setSeconds] = useState(compute);
  useEffect(() => {
    if (!active) return;
    const update = () => setSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt, active]);
  return seconds;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20, 33, 61, 0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, lineHeight: 21, color: colors.muted },
  input: {
    marginTop: 8,
    height: 64,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    textAlign: 'center',
    fontFamily: monoFont,
    fontSize: 32,
    letterSpacing: 12,
    fontVariant: ['tabular-nums'],
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
  message: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  replay: { fontWeight: '700' },
  timer: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  link: { color: colors.primary, textAlign: 'center', fontSize: 14, paddingVertical: 4 },
  live: { color: colors.muted, textAlign: 'center', fontSize: 14 },
  liveCode: { fontFamily: monoFont, color: colors.text, fontWeight: '700' },
  actions: { gap: 8, marginTop: 8 },
});
