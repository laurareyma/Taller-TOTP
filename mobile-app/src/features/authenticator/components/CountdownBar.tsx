import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { colors, monoFont } from '@/constants/theme';

interface CountdownBarProps {
  expiresAtMs: number;
  periodSeconds: number;
  secondsLeft: number;
  urgent: boolean;
}

/**
 * Barra que se vacía de forma continua de 30 a 0 s.
 * Cada segundo se re-sincroniza con el reloj real, así se corrige sola si la app estuvo en segundo plano.
 */
export function CountdownBar({ expiresAtMs, periodSeconds, secondsLeft, urgent }: CountdownBarProps) {
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const remainingMs = Math.max(0, expiresAtMs - Date.now());
    progress.setValue(Math.min(1, remainingMs / (periodSeconds * 1000)));
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: remainingMs,
      easing: Easing.linear,
      useNativeDriver: true, // corre en el hilo nativo: no bloquea la UI
    });
    animation.start();
    return () => animation.stop();
  }, [expiresAtMs, periodSeconds, secondsLeft, progress]);

  return (
    <View style={styles.wrapper}>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel="Tiempo restante del código"
        accessibilityValue={{ min: 0, max: periodSeconds, now: secondsLeft }}
      >
        <Animated.View
          style={[
            styles.fill,
            { backgroundColor: urgent ? colors.warning : colors.primary, transform: [{ scaleX: progress }] },
          ]}
        />
      </View>
      <Text style={[styles.seconds, urgent && styles.urgent]}>{secondsLeft} s</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch' },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { width: '100%', height: '100%', transformOrigin: 'left' },
  seconds: { width: 44, textAlign: 'right', fontFamily: monoFont, fontVariant: ['tabular-nums'], color: colors.muted },
  urgent: { color: colors.warning },
});
