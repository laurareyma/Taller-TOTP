import { router } from 'expo-router';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors } from '@/constants/theme';
import type { TotpAccount } from '@/features/authenticator/accountSchema';
import { CountdownBar } from '@/features/authenticator/components/CountdownBar';
import { TotpCode } from '@/features/authenticator/components/TotpCode';
import { useTotpAccount } from '@/features/authenticator/TotpAccountContext';
import { useTotp } from '@/features/authenticator/useTotp';

const URGENT_SECONDS = 5;

export default function AuthenticatorScreen() {
  const { loading, account, removeAccount } = useTotpAccount();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!account) return <NoAccount />;

  const confirmRemove = () =>
    Alert.alert('Eliminar cuenta', 'Se borrará la semilla de este dispositivo. ¿Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => void removeAccount() },
    ]);

  return <ActiveAccount account={account} onRemove={confirmRemove} />;
}

function NoAccount() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Agrega tu cuenta</Text>
      <Text style={styles.body}>
        Escanea el código QR de tu cuenta o pega la semilla Base32. Es la misma que usarías en Google Authenticator.
      </Text>
      <View style={styles.actions}>
        <Button title="Escanear código QR" onPress={() => router.push('/authenticator/scan')} />
        <Button title="Ingresar semilla manualmente" variant="secondary" onPress={() => router.push('/authenticator/manual')} />
      </View>
    </View>
  );
}

function ActiveAccount({ account, onRemove }: { account: TotpAccount; onRemove: () => void }) {
  const { code, secondsLeft, expiresAtMs, error } = useTotp(account);
  const urgent = secondsLeft <= URGENT_SECONDS;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.issuer}>{account.issuer ?? 'Cuenta'}</Text>
        {account.accountName ? <Text style={styles.accountName}>{account.accountName}</Text> : null}

        <View style={styles.codeBlock}>
          <TotpCode code={code} digits={account.digits} urgent={urgent} />
        </View>

        {expiresAtMs > 0 && (
          <CountdownBar
            expiresAtMs={expiresAtMs}
            periodSeconds={account.period}
            secondsLeft={secondsLeft}
            urgent={urgent}
          />
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <Text style={styles.offline}>Se calcula en el dispositivo: funciona sin conexión.</Text>

      <View style={styles.actions}>
        <Button title="Eliminar cuenta" variant="danger" onPress={onRemove} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, padding: 24 },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 16 },
  body: { fontSize: 16, lineHeight: 22, color: colors.muted, marginTop: 8 },
  actions: { marginTop: 32, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  issuer: { fontSize: 18, fontWeight: '600', color: colors.text },
  accountName: { fontSize: 14, color: colors.muted, marginTop: 2 },
  codeBlock: { marginVertical: 24 },
  error: { color: colors.danger, marginTop: 12 },
  offline: { textAlign: 'center', color: colors.muted, marginTop: 16, fontSize: 13 },
});
