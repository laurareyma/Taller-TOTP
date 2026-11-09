import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors } from '@/constants/theme';
import { useTotpAccount } from '@/features/authenticator/TotpAccountContext';
import { OtpauthParseError, parseOtpauthUri } from '@/security/totp/otpauth';

const RETRY_DELAY_MS = 2000;

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const { saveAccount } = useTotpAccount();
  const isFocused = useIsFocused();
  const [error, setError] = useState<string | null>(null);
  // La cámara entrega el mismo QR muchas veces por segundo: se procesa solo el primero.
  const busy = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(retryTimer.current), []);

  const onScanned = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      if (busy.current) return;
      busy.current = true;
      try {
        await saveAccount(parseOtpauthUri(data));
        router.back();
      } catch (e) {
        setError(e instanceof OtpauthParseError ? e.message : 'No se pudo guardar la cuenta.');
        retryTimer.current = setTimeout(() => {
          busy.current = false;
        }, RETRY_DELAY_MS);
      }
    },
    [saveAccount],
  );

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permission}>
        <Text style={styles.heading}>Permiso de cámara</Text>
        <Text style={styles.body}>Necesitamos la cámara solo para leer el código QR de tu cuenta.</Text>
        <View style={styles.actions}>
          {permission.canAskAgain ? (
            <Button title="Permitir cámara" onPress={() => void requestPermission()} />
          ) : (
            <Button title="Abrir Ajustes" onPress={() => void Linking.openSettings()} />
          )}
          <Button title="Ingresar semilla manualmente" variant="secondary" onPress={() => router.replace('/authenticator/manual')} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.cameraContainer}>
      {/* Solo una cámara activa a la vez: se desmonta si la pantalla pierde el foco. */}
      {isFocused && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScanned}
        />
      )}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.frame} />
        <Text style={styles.hint}>Apunta al código QR otpauth://</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.manual}>
          <Button title="Ingresar semilla manualmente" variant="secondary" onPress={() => router.replace('/authenticator/manual')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  permission: { flex: 1, padding: 24, justifyContent: 'center' },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, lineHeight: 22, color: colors.muted, marginTop: 8 },
  actions: { marginTop: 32, gap: 12 },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24 },
  frame: { width: 240, height: 240, borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 20 },
  hint: { color: '#FFFFFF', fontSize: 16, marginTop: 20, textAlign: 'center' },
  error: {
    color: '#FFFFFF',
    backgroundColor: colors.danger,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    overflow: 'hidden',
    textAlign: 'center',
  },
  manual: { position: 'absolute', bottom: 40, left: 24, right: 24 },
});
