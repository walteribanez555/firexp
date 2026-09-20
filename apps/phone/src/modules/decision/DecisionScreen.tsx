import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { WindowOpenMsg, Action } from '@fire-stick/types';
import { OptionButton } from './OptionButton';
import { TimerBar }    from './TimerBar';
import { tokens }      from '../../theme/tokens';

interface Props {
  msg:         WindowOpenMsg;
  viewerColor: string;
  onVote:      (action: Action) => void;
}

export function DecisionScreen({ msg, viewerColor, onVote }: Props) {
  const [voted, setVoted] = useState<Action | null>(null);

  const isPre = msg.phase === 'pre';

  const handleVote = (action: Action) => {
    if (voted) return;
    setVoted(action);
    onVote(action);
  };

  return (
    <View style={styles.root}>
      <View style={styles.tag}>
        <Text style={[styles.tagText, !isPre && styles.tagLive]}>
          {isPre ? `Q ${msg.questionIndex} of ${msg.totalQuestions}` : '⚡ Live'}
        </Text>
      </View>

      <Text style={styles.chapter}>{msg.chapterTitle}</Text>
      <Text style={styles.prompt}>{msg.prompt}</Text>

      <View style={styles.options}>
        {msg.options.map((opt) => (
          <OptionButton
            key={opt.gesture}
            label={opt.label}
            color={viewerColor}
            voted={voted === opt.gesture}
            disabled={voted !== null}
            onPress={() => handleVote(opt.gesture)}
          />
        ))}
      </View>

      <TimerBar durationMs={msg.duration} running={!voted} />

      {voted ? (
        <Text style={styles.hint}>✓ Vote sent</Text>
      ) : (
        <Text style={styles.hint}>Auto-advances if no vote</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.spacing.lg, justifyContent: 'center' },
  tag:     { alignSelf: 'flex-start', backgroundColor: tokens.color.surface, borderRadius: tokens.radius.full, paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.xs, marginBottom: tokens.spacing.md },
  tagText: { color: tokens.color.muted, fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium },
  tagLive: { color: tokens.color.warning },
  chapter: { color: tokens.color.muted, fontSize: tokens.font.size.sm, marginBottom: tokens.spacing.sm },
  prompt:  { color: tokens.color.text, fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.bold, marginBottom: tokens.spacing.xl },
  options: { marginBottom: tokens.spacing.lg },
  hint:    { color: tokens.color.muted, fontSize: tokens.font.size.sm, textAlign: 'center', marginTop: tokens.spacing.md },
});
