import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import type { LogEntry, EpisodeDetail } from '@fire-stick/types';
import { tokens } from '../../theme/tokens';

interface Props { log: LogEntry[]; episode: EpisodeDetail; }

export function JourneyTab({ log, episode }: Props) {
  if (log.length === 0) {
    return <View style={styles.empty}><Text style={styles.emptyText}>No decisions recorded yet.</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {log.map((entry) => {
        const chapter = episode.chapters.find((c) => c.id === entry.chapter);
        return (
          <View key={entry.chapter} style={styles.block}>
            <Text style={styles.chTitle}>{chapter?.title ?? entry.chapter}</Text>

            {entry.decisions.map((d) => {
              const def = chapter?.decisions.find((dec) => dec.id === d.decisionId);
              return (
                <View key={d.decisionId} style={styles.decision}>
                  <View style={[styles.phase, d.phase === 'during' && styles.phaseLive]}>
                    <Text style={styles.phaseText}>{d.phase === 'pre' ? 'PRE' : 'LIVE'}</Text>
                  </View>
                  <Text style={styles.prompt}>{def?.prompt ?? d.decisionId}</Text>
                  <Text style={styles.chosen}>→ {d.chosen}</Text>
                </View>
              );
            })}

            {chapter?.variants.map((v) => {
              const played = v.tag === entry.variantPlayed || v.when === entry.variantPlayed;
              return (
                <Text key={v.when} style={played ? styles.variantPlayed : styles.variantUnplayed}>
                  {played ? '▶ ' : '○ '}{v.tag ?? v.when}
                </Text>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list:           { padding: tokens.spacing.lg },
  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:      { color: tokens.color.muted },
  block:          { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md, padding: tokens.spacing.md, marginBottom: tokens.spacing.md },
  chTitle:        { color: tokens.color.text, fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, marginBottom: tokens.spacing.sm },
  decision:       { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, marginBottom: tokens.spacing.xs },
  phase:          { backgroundColor: tokens.color.border, borderRadius: tokens.radius.sm, paddingHorizontal: tokens.spacing.sm, paddingVertical: 2 },
  phaseLive:      { backgroundColor: tokens.color.warning },
  phaseText:      { color: tokens.color.text, fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold },
  prompt:         { flex: 1, color: tokens.color.muted, fontSize: tokens.font.size.sm },
  chosen:         { color: tokens.color.accent, fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold },
  variantPlayed:  { color: tokens.color.success, fontSize: tokens.font.size.sm, marginTop: 2 },
  variantUnplayed:{ color: tokens.color.muted, fontSize: tokens.font.size.sm, marginTop: 2 },
});
