import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { tokens } from '../../theme/tokens';

interface Viewer { number: number; color: string; }

interface Props {
  roomCode: string;
  viewers:  Viewer[];
  message?: string;
}

export function WaitingScreen({ roomCode, viewers, message }: Props) {
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={tokens.color.accent} />

      <Text style={styles.message}>
        {message ?? 'Waiting for the story to begin…'}
      </Text>

      <View style={styles.roomRow}>
        <Text style={styles.roomLabel}>Room</Text>
        <Text style={styles.roomCode}>{roomCode}</Text>
      </View>

      {viewers.length > 0 && (
        <View style={styles.dots}>
          {viewers.map((v) => (
            <View key={v.number} style={[styles.dot, { backgroundColor: v.color }]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: tokens.color.bg, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.xl },
  message:   { color: tokens.color.muted, fontSize: tokens.font.size.md, textAlign: 'center', marginTop: tokens.spacing.lg, marginBottom: tokens.spacing.xl },
  roomRow:   { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  roomLabel: { color: tokens.color.muted, fontSize: tokens.font.size.sm },
  roomCode:  { color: tokens.color.text, fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, letterSpacing: 4 },
  dots:      { flexDirection: 'row', gap: tokens.spacing.sm, marginTop: tokens.spacing.xl },
  dot:       { width: 14, height: 14, borderRadius: 7 },
});
