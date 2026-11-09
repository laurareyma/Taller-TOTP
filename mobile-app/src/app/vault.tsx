import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors, monoFont } from '@/constants/theme';
import { NetworkLogCard } from '@/features/auth/components/NetworkLogCard';
import { memorySession } from '@/features/auth/tokenStorage';
import { StepUpModal } from '@/features/vault/components/StepUpModal';
import {
  fetchVault,
  MfaError,
  requestStepUpToken,
  StepUpRequiredError,
  verifyMfa,
  type VaultData,
} from '@/features/vault/vaultApi';

type VaultState =
  | { kind: 'loading' }
  | { kind: 'stepUp'; token: string; expiresAt: number }
  | { kind: 'unlocked'; data: VaultData }
  | { kind: 'error'; message: string };

export default function VaultScreen() {
  const [state, setState] = useState<VaultState>({ kind: 'loading' });
  const [replayResult, setReplayResult] = useState<string | null>(null);
  const lastCode = useRef<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'unlocked', data: await fetchVault() });
    } catch (e) {
      if (e instanceof StepUpRequiredError) setState({ kind: 'stepUp', token: e.stepUpToken, expiresAt: e.expiresAt });
      else setState({ kind: 'error', message: e instanceof Error ? e.message : 'No se pudo abrir la bóveda.' });
      // Si la sesión expiró, AuthContext ya navega a la bienvenida.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const lock = () => {
    memorySession.clearElevated();
    setReplayResult(null);
    void load();
  };

  /** Prueba de aceptación #5: reenviar el mismo código con un step_up_token nuevo. */
  const tryReplay = async () => {
    if (!lastCode.current) return;
    setReplayResult('Enviando el mismo código otra vez…');
    try {
      const stepUp = await requestStepUpToken();
      await verifyMfa(stepUp.stepUpToken, lastCode.current);
      setReplayResult('⚠️ El servidor aceptó el código repetido (no debería pasar).');
    } catch (e) {
      setReplayResult(e instanceof MfaError ? `${e.status} · ${e.message}` : e instanceof Error ? e.message : 'Error');
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        {state.kind === 'loading' && (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {state.kind === 'stepUp' && (
          <View style={styles.locked}>
            <Text style={styles.lockIcon}>🔒</Text>
            <Text style={styles.heading}>Bóveda bloqueada</Text>
            <Text style={styles.muted}>El servidor respondió 403 mfa_required.</Text>
          </View>
        )}

        {state.kind === 'error' && (
          <View style={styles.locked}>
            <Text style={styles.error}>{state.message}</Text>
            <Button title="Reintentar" onPress={() => void load()} />
          </View>
        )}

        {state.kind === 'unlocked' && (
          <>
            <Unlocked data={state.data} />
            <View style={styles.actions}>
              <Button title="Bloquear de nuevo" variant="secondary" onPress={lock} />
              {lastCode.current && (
                <Button title="Probar replay (reenviar el último código)" variant="secondary" onPress={() => void tryReplay()} />
              )}
              {replayResult && <Text style={styles.replay}>{replayResult}</Text>}
            </View>
          </>
        )}

        <View style={styles.actions}>
          <NetworkLogCard />
        </View>
      </ScrollView>

      {state.kind === 'stepUp' && (
        <StepUpModal
          visible
          stepUpToken={state.token}
          expiresAt={state.expiresAt}
          onVerified={(code) => {
            lastCode.current = code;
            void load(); // reintento con el elevated_token
          }}
          onCancel={() => router.back()}
          onRestart={() => void load()} // nuevo 403 → nuevo step_up_token
        />
      )}
    </>
  );
}

function Unlocked({ data }: { data: VaultData }) {
  const elevatedUntil = useSyncExternalStore(memorySession.subscribe, () => memorySession.elevatedExpiresAt);
  const seconds = useSecondsUntil(elevatedUntil);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.unlockedLabel}>🔓 Acceso elevado · mfa_verified</Text>
        <Text style={styles.mono}>{seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'vencido'}</Text>
      </View>
      <Text style={styles.muted}>{data.owner}</Text>
      {data.items.map((item) => (
        <View key={item.label} style={styles.item}>
          <Text style={styles.itemLabel}>{item.label}</Text>
          <Text style={styles.itemValue} selectable>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function useSecondsUntil(targetMs: number): number {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((targetMs - Date.now()) / 1000)));
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.ceil((targetMs - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetMs]);
  return seconds;
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, flexGrow: 1 },
  centered: { paddingVertical: 48, alignItems: 'center' },
  locked: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  lockIcon: { fontSize: 40 },
  heading: { fontSize: 20, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 14 },
  error: { color: colors.danger, fontSize: 15, textAlign: 'center', marginBottom: 12 },
  actions: { marginTop: 16, gap: 12 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unlockedLabel: { color: colors.success, fontWeight: '700' },
  mono: { fontFamily: monoFont, fontVariant: ['tabular-nums'], color: colors.text },
  item: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 4 },
  itemLabel: { color: colors.muted, fontSize: 13 },
  itemValue: { color: colors.text, fontSize: 16, fontFamily: monoFont, marginTop: 2 },
  replay: { textAlign: 'center', color: colors.danger, fontWeight: '600' },
});
