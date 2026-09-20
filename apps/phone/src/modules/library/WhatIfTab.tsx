import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import type { LogEntry, EpisodeDetail } from '@fire-stick/types';
import { tokens } from '../../theme/tokens';

interface Props {
  log:       LogEntry[];
  episode:   EpisodeDetail;
  relayHost: string;
  roomCode:  string;
}

export function WhatIfTab({ log, episode, relayHost, roomCode }: Props) {
  const [results, setResults] = useState<Map<string, string[] | 'loading'>>(new Map());

  const fetchWhatIf = async (chapterId: string, optionIdx: number, key: string) => {
    setResults((prev) => new Map(prev).set(key, 'loading'));
    try {
      const res  = await fetch(
        `${relayHost}/api/v1/rooms/${roomCode}/whatif?at=${chapterId}&option=${optionIdx}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ story: episode }) },
      );
      const data = await res.json() as { data: { projectedPath: string[] } };
      setResults((prev) => new Map(prev).set(key, data.data.projectedPath ?? []));
    } catch {
      setResults((prev) => new Map(prev).set(key, ['Could not load projection']));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <Text style={styles.hint}>Tap an option you didn't choose to see what would have happened.</Text>

      {log.map((entry) => {
        const chapter = episode.chapters.find((c) => c.id === entry.chapter);
        return entry.decisions.map((d) => {
          const def = chapter?.decisions.find((dec) => dec.id === d.decisionId);
          if (!def) return null;
          return (
            <View key={d.decisionId} style={styles.block}>
              <Text style={styles.prompt}>{def.prompt ?? def.id}</Text>
              {def.options.map((opt, idx) => {
                const chosen = opt.gesture === d.chosen;
                const key    = `${d.decisionId}-${idx}`;
                const result = results.get(key);
                return (
                  <View key={opt.gesture}>
                    <TouchableOpacity
                      style={[styles.opt, chosen && styles.optChosen]}
                      disabled={chosen}
                      onPress={() => fetchWhatIf(entry.chapter, idx, key)}
                    >
                      <Text style={styles.optText}>{opt.label}{chosen ? ' ✓' : ''}</Text>
                    </TouchableOpacity>
                    {result === 'loading' && <ActivityIndicator style={styles.loader} color={tokens.color.accent} />}
                    {Array.isArray(result) && result.map((step, si) => (
                      <Text key={si} style={styles.step}>→ {step}</Text>
                    ))}
                  </View>
                );
              })}
            </View>
          );
        });
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list:      { padding: tokens.spacing.lg },
  hint:      { color: tokens.color.muted, fontSize: tokens.font.size.sm, marginBottom: tokens.spacing.lg },
  block:     { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md, padding: tokens.spacing.md, marginBottom: tokens.spacing.md },
  prompt:    { color: tokens.color.text, fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, marginBottom: tokens.spacing.sm },
  opt:       { backgroundColor: tokens.color.border, borderRadius: tokens.radius.sm, padding: tokens.spacing.sm, marginBottom: tokens.spacing.xs },
  optChosen: { backgroundColor: tokens.color.accent, opacity: 0.7 },
  optText:   { color: tokens.color.text, fontSize: tokens.font.size.sm },
  loader:    { marginVertical: tokens.spacing.sm },
  step:      { color: tokens.color.muted, fontSize: tokens.font.size.sm, paddingLeft: tokens.spacing.sm, marginBottom: 2 },
});
