import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { WatchingMsg } from '@fire-stick/types';
import { tokens } from '../../theme/tokens';

interface Props {
  msg:      WatchingMsg;
  nextHint: string | null;
}

export function WatchingScreen({ msg, nextHint }: Props) {
  return (
    <View style={styles.root}>
      <Text style={styles.icon}>🎬</Text>
      <Text style={styles.label}>Now playing</Text>
      <Text style={styles.chapter}>{msg.chapterTitle}</Text>
      {!!msg.variantTag && (
        <Text style={styles.variant}>Path: {msg.variantTag}</Text>
      )}
      {!!nextHint && (
        <Text style={styles.hint}>Next: {nextHint}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: tokens.color.bg, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.xl },
  icon:    { fontSize: 48, marginBottom: tokens.spacing.lg },
  label:   { color: tokens.color.muted, fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, marginBottom: tokens.spacing.sm },
  chapter: { color: tokens.color.text, fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.bold, textAlign: 'center', marginBottom: tokens.spacing.sm },
  variant: { color: tokens.color.muted, fontSize: tokens.font.size.md },
  hint:    { color: tokens.color.accent, fontSize: tokens.font.size.sm, marginTop: tokens.spacing.lg },
});
