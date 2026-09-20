import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { tokens } from '../../theme/tokens';

interface Props {
  durationMs: number;
  running:    boolean;
}

export function TimerBar({ durationMs, running }: Props) {
  const width = useRef(new Animated.Value(1)).current;
  const anim  = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (running) {
      width.setValue(1);
      anim.current = Animated.timing(width, {
        toValue:         0,
        duration:        durationMs,
        useNativeDriver: false,
      });
      anim.current.start();
    } else {
      anim.current?.stop();
    }
    return () => { anim.current?.stop(); };
  }, [running, durationMs]);

  const widthPct = width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { width: widthPct }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', height: 4, backgroundColor: tokens.color.border, borderRadius: tokens.radius.full, overflow: 'hidden' },
  fill:  { height: '100%', backgroundColor: tokens.color.accent, borderRadius: tokens.radius.full },
});
