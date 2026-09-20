import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { LogEntry, EpisodeDetail } from '@fire-stick/types';
import { JourneyTab } from './JourneyTab';
import { VotesTab }   from './VotesTab';
import { WhatIfTab }  from './WhatIfTab';
import { tokens }     from '../../theme/tokens';

type Tab = 'journey' | 'votes' | 'whatif';

interface Props {
  log:          LogEntry[];
  episode:      EpisodeDetail;
  viewerColors: Map<number, string>;
  relayHost:    string;
  roomCode:     string;
}

export function LibraryScreen({ log, episode, viewerColors, relayHost, roomCode }: Props) {
  const [tab, setTab] = useState<Tab>('journey');

  return (
    <View style={styles.root}>
      <View style={styles.nav}>
        {(['journey', 'votes', 'whatif'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.navBtn, tab === t && styles.navBtnActive]} onPress={() => setTab(t)}>
            <Text style={[styles.navText, tab === t && styles.navTextActive]}>
              {t === 'journey' ? 'Journey' : t === 'votes' ? 'Votes' : 'What if?'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.content}>
        {tab === 'journey' && <JourneyTab log={log} episode={episode} />}
        {tab === 'votes'   && <VotesTab   log={log} episode={episode} viewerColors={viewerColors} />}
        {tab === 'whatif'  && <WhatIfTab  log={log} episode={episode} relayHost={relayHost} roomCode={roomCode} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: tokens.color.bg },
  nav:           { flexDirection: 'row', borderBottomWidth: 1, borderColor: tokens.color.border },
  navBtn:        { flex: 1, paddingVertical: tokens.spacing.md, alignItems: 'center' },
  navBtnActive:  { borderBottomWidth: 2, borderColor: tokens.color.accent },
  navText:       { color: tokens.color.muted, fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium },
  navTextActive: { color: tokens.color.text, fontWeight: tokens.font.weight.bold },
  content:       { flex: 1 },
});
