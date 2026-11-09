import { useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, monoFont } from '@/constants/theme';

import type { LogKind } from '../apiClient';
import { networkLog } from '../networkLog';

const KIND_COLOR: Record<LogKind, string> = {
  info: colors.muted,
  ok: colors.success,
  warn: colors.warning,
  error: colors.danger,
};

function clock(ms: number): string {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Muestra las últimas peticiones: permite ver en vivo que hay un solo /auth/refresh. */
export function NetworkLogCard() {
  const entries = useSyncExternalStore(networkLog.subscribe, networkLog.getSnapshot);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Registro de red</Text>
      {entries.length === 0 ? (
        <Text style={styles.empty}>Sin peticiones todavía.</Text>
      ) : (
        // El más reciente arriba
        entries.map((entry) => (
          <Text key={entry.id} style={[styles.line, { color: KIND_COLOR[entry.kind] }]} numberOfLines={2}>
            {clock(entry.time)} {entry.text}
          </Text>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 4 },
  title: { fontWeight: '600', color: colors.text, marginBottom: 4 },
  empty: { color: colors.muted, fontSize: 13 },
  line: { fontFamily: monoFont, fontSize: 11, lineHeight: 16 },
});
