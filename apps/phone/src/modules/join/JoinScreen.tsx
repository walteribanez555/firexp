import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { tokens } from '../../theme/tokens';

interface Props {
  onJoin: (roomCode: string, episodeId: string) => void;
}

export function JoinScreen({ onJoin }: Props) {
  const [code,    setCode]    = useState('');
  const [episode, setEpisode] = useState('episode1');

  const handleJoin = () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) return;
    onJoin(trimmed, episode.trim() || 'episode1');
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Join the story</Text>
      <Text style={styles.subtitle}>Enter the code shown on the TV</Text>

      <TextInput
        style={styles.input}
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        placeholder="XXXX"
        placeholderTextColor={tokens.color.muted}
        maxLength={8}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      <TouchableOpacity
        style={[styles.btn, !code.trim() && styles.btnDisabled]}
        onPress={handleJoin}
        disabled={!code.trim()}
      >
        <Text style={styles.btnText}>Join</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: tokens.color.bg, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.xl },
  title:      { color: tokens.color.text, fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.bold, marginBottom: tokens.spacing.sm },
  subtitle:   { color: tokens.color.muted, fontSize: tokens.font.size.md, marginBottom: tokens.spacing.xl },
  input:      { width: '100%', backgroundColor: tokens.color.surface, color: tokens.color.text, fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.bold, textAlign: 'center', borderRadius: tokens.radius.md, padding: tokens.spacing.md, marginBottom: tokens.spacing.lg, letterSpacing: 8 },
  btn:        { width: '100%', backgroundColor: tokens.color.accent, borderRadius: tokens.radius.md, padding: tokens.spacing.md, alignItems: 'center' },
  btnDisabled:{ opacity: 0.4 },
  btnText:    { color: tokens.color.text, fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold },
});
