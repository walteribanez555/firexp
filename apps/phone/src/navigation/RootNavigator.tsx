import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import type { WindowOpenMsg, WatchingMsg, Action, LogEntry, EpisodeDetail } from '@fire-stick/types';
import { JoinScreen }          from '../modules/join/JoinScreen';
import { QuestionnaireScreen, type QuestionnaireAnswer } from '../modules/questionnaire/QuestionnaireScreen';
import { WaitingScreen }       from '../modules/waiting/WaitingScreen';
import { DecisionScreen }      from '../modules/decision/DecisionScreen';
import { WatchingScreen }      from '../modules/watching/WatchingScreen';
import { LibraryScreen }       from '../modules/library/LibraryScreen';
import { RelayClient }         from '../services/ws/RelayClient';
import { EpisodeApi }          from '../services/api/EpisodeApi';
import { tokens }              from '../theme/tokens';

const RELAY_HOST = 'http://192.168.0.11:3001';

type Screen = 'join' | 'questionnaire' | 'waiting' | 'decision' | 'watching' | 'library';

interface Viewer { number: number; color: string; }

export function RootNavigator() {
  const [screen,       setScreen]       = useState<Screen>('join');
  const [viewers,      setViewers]      = useState<Viewer[]>([]);
  const [episode,      setEpisode]      = useState<EpisodeDetail | null>(null);
  const [activeWindow, setActiveWindow] = useState<WindowOpenMsg | null>(null);
  const [watching,     setWatching]     = useState<WatchingMsg | null>(null);
  const [sessionLog,   setSessionLog]   = useState<LogEntry[]>([]);
  const [roomCode,     setRoomCode]     = useState('');
  const [episodeId,    setEpisodeId]    = useState('');

  const relayRef = useRef<RelayClient | null>(null);
  const apiRef   = useRef<EpisodeApi>(new EpisodeApi(RELAY_HOST));
  const colorRef = useRef<Map<number, string>>(new Map());

  // ── Join ────────────────────────────────────────────────────────────────────

  const handleJoin = useCallback((code: string, epId: string) => {
    setRoomCode(code);
    setEpisodeId(epId);

    const wsUrl = RELAY_HOST.replace(/^http/, 'ws');
    const relay = new RelayClient(wsUrl, code, {
      onAssigned(viewer, color) {
        colorRef.current.set(viewer, color);
        setViewers((p) => [...p, { number: viewer, color }]);
        // Load episode after joining the room
        void loadEpisode(epId, code);
      },
      onEpisodeStart(_chapterId, _flags) {
        setScreen('waiting');
      },
      onWindowOpen(msg) {
        setActiveWindow(msg);
        setScreen('decision');
      },
      onWindowClosed(_chosen) {
        setActiveWindow(null);
        setScreen('watching');
      },
      onWatching(msg) {
        setWatching(msg);
        setScreen('watching');
      },
      onStoryEnd() {
        void loadLibrary(code);
      },
      onStatusChange() {},
    });

    relay.connect();
    relayRef.current = relay;
  }, []);

  // ── Episode fetch ───────────────────────────────────────────────────────────

  const loadEpisode = async (epId: string, code: string) => {
    try {
      const ep = await apiRef.current.fetchEpisode(epId);
      setEpisode(ep);
      if (ep.questionnaire.length > 0) {
        setScreen('questionnaire');
      } else {
        await apiRef.current.submitQuestionnaire(code, epId, []);
        setScreen('waiting');
      }
    } catch {
      setScreen('waiting');
    }
  };

  // ── Questionnaire ───────────────────────────────────────────────────────────

  const handleQuestionnaireComplete = useCallback(async (answers: QuestionnaireAnswer[]) => {
    setScreen('waiting');
    try {
      await apiRef.current.submitQuestionnaire(roomCode, episodeId, answers);
    } catch { /* relay broadcasts episode_start regardless */ }
  }, [roomCode, episodeId]);

  // ── Vote ────────────────────────────────────────────────────────────────────

  const handleVote = useCallback((action: Action) => {
    if (!activeWindow) return;
    relayRef.current?.sendVote(activeWindow.decisionId, action);
  }, [activeWindow]);

  // ── Library ─────────────────────────────────────────────────────────────────

  const loadLibrary = async (code: string) => {
    try {
      const data = await apiRef.current.fetchRoomLog(code);
      setSessionLog(data.log as LogEntry[]);
    } catch {}
    setScreen('library');
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const viewerColor = viewers[0]?.color ?? tokens.color.accent;

  return (
    <View style={styles.root}>
      {screen === 'join' && (
        <JoinScreen onJoin={handleJoin} />
      )}

      {screen === 'questionnaire' && episode && (
        <QuestionnaireScreen
          questions={episode.questionnaire}
          onComplete={handleQuestionnaireComplete}
        />
      )}

      {screen === 'waiting' && (
        <WaitingScreen roomCode={roomCode} viewers={viewers} />
      )}

      {screen === 'decision' && activeWindow && (
        <DecisionScreen
          msg={activeWindow}
          viewerColor={viewerColor}
          onVote={handleVote}
        />
      )}

      {screen === 'watching' && watching && (
        <WatchingScreen msg={watching} nextHint={null} />
      )}

      {screen === 'library' && episode && (
        <LibraryScreen
          log={sessionLog}
          episode={episode}
          viewerColors={colorRef.current}
          relayHost={RELAY_HOST}
          roomCode={roomCode}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
});
