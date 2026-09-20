import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import type { Question } from '@fire-stick/types';
import { QuestionCard } from './QuestionCard';
import { tokens } from '../../theme/tokens';

export interface QuestionnaireAnswer {
  questionId: string;
  optionId:   string;
}

interface Props {
  questions:  Question[];
  onComplete: (answers: QuestionnaireAnswer[]) => void;
}

export function QuestionnaireScreen({ questions, onComplete }: Props) {
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());

  const handleAnswer = (questionId: string, optionId: string) => {
    const next = new Map(answers).set(questionId, optionId);
    setAnswers(next);

    if (next.size === questions.length) {
      const result: QuestionnaireAnswer[] = [...next.entries()].map(
        ([qId, oId]) => ({ questionId: qId, optionId: oId }),
      );
      setTimeout(() => onComplete(result), 400);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Before the story begins</Text>
        <Text style={styles.subtitle}>Your answers shape the path</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={i}
            total={questions.length}
            answered={answers.get(q.id) ?? null}
            onAnswer={handleAnswer}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: tokens.color.bg },
  header:   { paddingHorizontal: tokens.spacing.lg, paddingTop: tokens.spacing.xl, paddingBottom: tokens.spacing.md },
  title:    { color: tokens.color.text, fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.bold },
  subtitle: { color: tokens.color.muted, fontSize: tokens.font.size.md, marginTop: tokens.spacing.xs },
  list:     { padding: tokens.spacing.lg, paddingTop: tokens.spacing.md },
});
