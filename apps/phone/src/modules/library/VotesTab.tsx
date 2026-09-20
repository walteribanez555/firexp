import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import type { LogEntry, EpisodeDetail } from '@fire-stick/types';
import { tokens } from '../../theme/tokens';

interface Props {
  log:          LogEntry[];
  episode:      EpisodeDetail;
  viewerColors: Map<number, string>;
}

export function VotesTab({ log, episode, viewerColors }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.list}>
      {log.map((entry) => {
        const chapter = episode.chapters.find((c) => c.id === entry.chapter);
        return entry.decisions.map((d) => {
          const def = chapter?.decisions.find((dec) => dec.id === d.decisionId);
          if (!def) return null;
          return (
            <View key={d.decisionId} style={styles.block}>
              <Text style={styles.prompt}>{def.prompt ?? def.id}</Text>
              {d.margin <= 1 && d.votes.length > 1 && (
                <View style={styles.closeBadge}><Text style={styles.closeBadgeText}>Close call</Text></View>
              )}
              <View style={styles.options}>
                {def.options.map((opt) => {
                  const voters = d.votes.filter((v) => v.action === opt.gesture);
                  const isWin  = opt.gesture === d.chosen;
                  return (
                    <View key={opt.gesture} style={[styles.option, isWin && styles.optionWinner]}>
                      <Text style={styles.optLabel}>{opt.label}</Text>
                      <View style={styles.dots}>
                        {voters.map((v) => (
                          <View key={v.viewer} style={[styles.dot, { backgroundColor: viewerColors.get(v.viewer) ?? tokens.color.muted }]} />
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        });
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list:           { padding: tokens.spacing.lg },
  block:          { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md, padding: tokens.spacing.md, marginBottom: tokens.spacing.md },
  prompt:         { color: tokens.color.text, fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, marginBottom: tokens.spacing.sm },
  closeBadge:     { alignSelf: 'flex-start', backgroundColor: tokens.color.warning, borderRadius: tokens.radius.full, paddingHorizontal: tokens.spacing.sm, paddingVertical: 2, marginBottom: tokens.spacing.sm },
  closeBadgeText: { color: tokens.color.bg, fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold },
  options:        { gap: tokens.spacing.sm },
  option:         { backgroundColor: tokens.color.border, borderRadius: tokens.radius.sm, padding: tokens.spacing.sm },
  optionWinner:   { backgroundColor: tokens.color.accent },
  optLabel:       { color: tokens.color.text, fontSize: tokens.font.size.sm, marginBottom: tokens.spacing.xs },
  dots:           { flexDirection: 'row', gap: 6 },
  dot:            { width: 12, height: 12, borderRadius: 6 },
});
