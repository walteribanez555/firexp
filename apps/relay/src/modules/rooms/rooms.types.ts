import type { WebSocket } from 'ws';
import type { Flags, LogEntry } from '@fire-stick/types';

export interface RoomClient {
  ws:       WebSocket;
  viewer:   number;
  color:    string;
  /** True for the TV/host connection — not counted as a voting viewer. */
  isTv?:    boolean;
  /** True if this viewer is the designated host (first non-TV viewer). */
  isHost?:  boolean;
}

export interface OpenWindow {
  decisionId: string;
  closesAt:   number;   // Unix ms — in relay server time
  tally:      Record<string, number>;   // { [action]: count }
}

export interface RoomState {
  id:            string;
  title:         string;
  flags:         Flags;
  log:           LogEntry[];
  clients:       Map<WebSocket, RoomClient>;
  closedAt?:     string;
  inheritedFrom?: string;

  // ── New fields ────────────────────────────────────────────────────────────
  phase:          'lobby' | 'playing' | 'ended';
  /** hostViewerId: slot number of the first non-TV viewer */
  hostViewerId?:  number;
  /** Last chapter being watched (from 'watching' TV message) */
  lastWatching?:  { chapterId: string; chapterTitle: string; variantTag: string };
  /** Open voting window (set on window_open, cleared on window_closed) */
  openWindow?:    OpenWindow;
  /** episodeId for the current session (set on episode_start) */
  episodeId?:     string;
}

export interface RoomStats {
  code:      string;
  clients:   number;
  viewers:   number[];
  flags:     Flags;
  decisions: number;
  closedAt?: string;
  phase:     'lobby' | 'playing' | 'ended';
}
