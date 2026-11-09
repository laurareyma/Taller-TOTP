import { router } from 'expo-router';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors, monoFont } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthContext';
import type { Me } from '@/features/auth/authApi';
import { NetworkLogCard } from '@/features/auth/components/NetworkLogCard';
import { invalidateAccessToken, revokeOnServer } from '@/features/auth/demo';
import { networkLog } from '@/features/auth/networkLog';
import { api } from '@/features/auth/session';
import { memorySession } from '@/features/auth/tokenStorage';

export default function HomeScreen() {
  const { status } = useAuth();

  if (status === 'restoring') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Restaurando sesión…</Text>
      </View>
    );
  }
  return status === 'signedIn' ? <SignedIn /> : <Welcome />;
}

function Welcome() {
  const { status, error, signIn } = useAuth();
  const busy = status === 'signingIn';

  return (
    <View style={styles.welcome}>
      <Text style={styles.title}>Seguridad Móvil</Text>
      <Text style={styles.subtitle}>OAuth 2.0 + PKCE y Step-Up 2FA</Text>

      <View style={styles.actions}>
        <Button title={busy ? 'Esperando al navegador…' : 'Iniciar sesión'} onPress={() => void signIn()} disabled={busy} />
        {error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.hint}>Se abrirá el navegador del sistema; la app nunca ve tu contraseña.</Text>
        <Button title="Authenticator (TOTP)" variant="secondary" onPress={() => router.push('/authenticator')} />
      </View>
    </View>
  );
}

function SignedIn() {
  const { signOut } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const expiresAt = useSyncExternalStore(memorySession.subscribe, () => memorySession.expiresAt);
  const secondsLeft = useSecondsUntil(expiresAt);

  const loadMe = useCallback(async () => {
    try {
      setMe(await api.getJson<Me>('/api/me'));
      setMeError(null);
    } catch (e) {
      setMeError(e instanceof Error ? e.message : 'Error');
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  /** Prueba de la cola: 3 peticiones a la vez con el token vencido → 1 solo refresh. */
  const fireConcurrent = async () => {
    networkLog.add('— 3 peticiones simultáneas —', 'info');
    const results = await Promise.allSettled([1, 2, 3].map(() => api.getJson<Me>('/api/me')));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    networkLog.add(`Resultado: ${ok}/3 exitosas`, ok === 3 ? 'ok' : 'warn');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Sesión iniciada</Text>
        <Text style={styles.cardTitle}>{me?.username ?? (meError ? '—' : 'Cargando…')}</Text>
        {meError && <Text style={styles.error}>{meError}</Text>}

        <View style={styles.tokenRow}>
          <Text style={styles.muted}>access_token (memoria)</Text>
          <Text style={[styles.mono, secondsLeft === 0 && styles.expired]}>
            {secondsLeft > 0 ? `vence en ${formatSeconds(secondsLeft)}` : 'vencido'}
          </Text>
        </View>
        <View style={styles.tokenRow}>
          <Text style={styles.muted}>refresh_token</Text>
          <Text style={styles.mono}>SecureStore</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button title="Authenticator (TOTP)" onPress={() => router.push('/authenticator')} />
        <Button title="Bóveda crítica" variant="secondary" onPress={() => router.push('/vault')} />
      </View>

      <Text style={styles.section}>Silent Refresh</Text>
      <View style={styles.actions}>
        <Button title="3 peticiones simultáneas" variant="secondary" onPress={() => void fireConcurrent()} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button title="Invalidar token" variant="secondary" onPress={invalidateAccessToken} />
          </View>
          <View style={styles.flex}>
            <Button title="Revocar en servidor" variant="secondary" onPress={() => void revokeOnServer()} />
          </View>
        </View>
        <NetworkLogCard />
      </View>

      <View style={styles.actions}>
        <Button title="Cerrar sesión" variant="danger" onPress={() => void signOut()} />
      </View>
    </ScrollView>
  );
}

const secondsUntil = (targetMs: number) => Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));

function useSecondsUntil(targetMs: number): number {
  const [seconds, setSeconds] = useState(() => secondsUntil(targetMs));
  useEffect(() => {
    setSeconds(secondsUntil(targetMs));
    const id = setInterval(() => setSeconds(secondsUntil(targetMs)), 1000);
    return () => clearInterval(id);
  }, [targetMs]);
  return seconds;
}

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  welcome: { flex: 1, padding: 24, justifyContent: 'center' },
  container: { padding: 24, gap: 8 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 16, color: colors.muted, marginTop: 4 },
  actions: { marginTop: 16, gap: 12 },
  section: { marginTop: 24, fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: 12 },
  error: { color: colors.danger, fontSize: 14 },
  muted: { color: colors.muted, fontSize: 14 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 8 },
  cardLabel: { color: colors.success, fontWeight: '600', fontSize: 13 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: 8 },
  tokenRow: { flexDirection: 'row', justifyContent: 'space-between' },
  mono: { fontFamily: monoFont, fontVariant: ['tabular-nums'], color: colors.text, fontSize: 13 },
  expired: { color: colors.warning },
});
