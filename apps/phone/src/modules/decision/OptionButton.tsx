import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { tokens } from '../../theme/tokens';

interface Props {
  label:    string;
  color:    string;
  voted:    boolean;
  disabled: boolean;
  onPress:  () => void;
}

export function OptionButton({ label, color, voted, disabled, onPress }: Props) {
  return (
    <TouchableOpacity
      style={[styles.btn, voted && { backgroundColor: color, borderColor: color }, disabled && !voted && styles.dimmed]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text style={[styles.label, voted && styles.labelVoted]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn:        { backgroundColor: tokens.color.surface, borderWidth: 2, borderColor: tokens.color.border, borderRadius: tokens.radius.md, padding: tokens.spacing.lg, alignItems: 'center', marginBottom: tokens.spacing.sm },
  dimmed:     { opacity: 0.35 },
  label:      { color: tokens.color.text, fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.medium },
  labelVoted: { fontWeight: tokens.font.weight.bold },
});
