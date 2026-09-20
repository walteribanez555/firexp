import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Question } from '@fire-stick/types';
import { tokens } from '../../theme/tokens';

interface Props {
  question:    Question;
  index:       number;
  total:       number;
  answered:    string | null;
  onAnswer:    (questionId: string, optionId: string) => void;
}

export function QuestionCard({ question, index, total, answered, onAnswer }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.counter}>{index + 1} / {total}</Text>
      <Text style={styles.text}>{question.text}</Text>

      <View style={styles.options}>
        {question.options.map((opt) => {
          const selected = answered === opt.id;
          const dimmed   = answered !== null && !selected;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.option, selected && styles.optionSelected, dimmed && styles.optionDimmed]}
              onPress={() => !answered && onAnswer(question.id, opt.id)}
              disabled={answered !== null}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card:              { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: tokens.spacing.lg, marginBottom: tokens.spacing.md },
  counter:           { color: tokens.color.muted, fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium, marginBottom: tokens.spacing.sm },
  text:              { color: tokens.color.text, fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, marginBottom: tokens.spacing.lg },
  options:           { gap: tokens.spacing.sm },
  option:            { backgroundColor: tokens.color.border, borderRadius: tokens.radius.md, padding: tokens.spacing.md },
  optionSelected:    { backgroundColor: tokens.color.accent },
  optionDimmed:      { opacity: 0.35 },
  optionText:        { color: tokens.color.text, fontSize: tokens.font.size.md, textAlign: 'center' },
  optionTextSelected:{ fontWeight: tokens.font.weight.bold },
});
