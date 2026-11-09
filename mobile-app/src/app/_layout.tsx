import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/constants/theme';
import { AuthProvider } from '@/features/auth/AuthContext';
import { TotpAccountProvider } from '@/features/authenticator/TotpAccountContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <TotpAccountProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.text },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'UniSabana Auth' }} />
          <Stack.Screen name="authenticator/index" options={{ title: 'Authenticator' }} />
          <Stack.Screen name="authenticator/scan" options={{ title: 'Escanear QR', presentation: 'modal' }} />
          <Stack.Screen name="authenticator/manual" options={{ title: 'Ingresar semilla', presentation: 'modal' }} />
          <Stack.Screen name="vault" options={{ title: 'Bóveda crítica' }} />
          <Stack.Screen name="oauth/callback" options={{ headerShown: false, animation: 'none' }} />
        </Stack>
      </TotpAccountProvider>
    </AuthProvider>
  );
}
