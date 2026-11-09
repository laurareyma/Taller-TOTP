/**
 * En Android, al volver del navegador el deep link unisabana-auth://oauth/callback también llega a Expo Router.
 * Esta pantalla solo existe para que no aparezca "ruta no encontrada": NO procesa el code.
 * El code se valida (state incluido) únicamente en signInWithBrowser(), con el resultado de openAuthSessionAsync.
 */

import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';

WebBrowser.maybeCompleteAuthSession();

export default function OAuthCallbackScreen() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);

  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
