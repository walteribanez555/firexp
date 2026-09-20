import type { Flags } from '@fire-stick/types';

// ── Domain types ──────────────────────────────────────────────────────────────

export interface SessionMeta {
  roomCode:   string;
  episodeId:  string;
  viewers:    number;
  startedAt:  string;
  endingId?:  string;
}

export interface SessionDecision {
  roomCode:   string;
  chapterId:  string;
  decisionId: string;
  chosen:     string;
  votes:      Record<string, number>;   // { [optionId/action]: count }
  flagsAfter: Flags;
  ts:         number;
}

// Stats shape returned by GET /episodes/:id/stats
export interface DecisionStats {
  total: number;
  options: Record<string, { count: number; pct: number }>;
}

export interface EpisodeStats {
  decisions: Record<string, DecisionStats>;
}

// ── Repository interface ──────────────────────────────────────────────────────

export interface ISessionsRepository {
  /** Create or return the META item for a room (idempotent). */
  createSession(roomCode: string, episodeId: string): Promise<SessionMeta>;

  /** Record a decision and atomically increment the AGG counters. */
  recordDecision(input: {
    roomCode:   string;
    chapterId:  string;
    decisionId: string;
    chosen:     string;
    votes:      Record<string, number>;
    flagsAfter: Flags;
    ts:         number;
  }): Promise<void>;

  /** Read aggregated stats for an episode (reads AGG# items only, no Scan). */
  getEpisodeStats(episodeId: string): Promise<EpisodeStats>;

  /** Read DECISION# items for a room's session recap. */
  getSessionDecisions(roomCode: string): Promise<SessionDecision[]>;

  /** Get session META for a room. */
  getSession(roomCode: string): Promise<SessionMeta | null>;
}
