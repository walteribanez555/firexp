import { writeFileSync, renameSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WebSocket } from 'ws';
import type { Flags, LogEntry, FlagSet, StoryGraph, StoryChapter, StoryVariant, EpisodeDetail, Question } from '@fire-stick/types';
import type { RoomClient, RoomState, RoomStats } from './rooms.types';
import { createLogger } from '../../config';

const VIEWER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
const ROOMS_DIR     = join(process.cwd(), 'rooms');

const CONTENT_API_URL = process.env['CONTENT_API_URL'] ?? 'http://localhost:3003';

const logger = createLogger('RoomsService');

const rooms = new Map<string, RoomState>();

// ── Persistence ───────────────────────────────────────────────────────────────

function ensureDir() {
  if (!existsSync(ROOMS_DIR)) mkdirSync(ROOMS_DIR, { recursive: true });
}

function persist(room: RoomState): void {
  ensureDir();
  const payload = {
    id:            room.id,
    title:         room.title,
    flags:         room.flags,
    log:           room.log,
    closedAt:      room.closedAt,
    inheritedFrom: room.inheritedFrom,
    phase:         room.phase,
    hostViewerId:  room.hostViewerId,
    episodeId:     room.episodeId,
    lastWatching:  room.lastWatching,
  };
  const tmp  = join(ROOMS_DIR, `.${room.id}.tmp`);
  const dest = join(ROOMS_DIR, `${room.id}.json`);
  writeFileSync(tmp, JSON.stringify(payload, null, 2));
  renameSync(tmp, dest);
}

function loadSession(id: string): RoomState | null {
  const file = join(ROOMS_DIR, `${id}.json`);
  if (!existsSync(file)) return null;
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return { ...data, clients: new Map(), phase: data.phase ?? 'lobby' };
  } catch {
    return null;
  }
}

// ── Content-API integration ───────────────────────────────────────────────────

/** Fire-and-forget POST to content-api. Logs errors but never throws. */
async function postToContentApi(path: string, body: unknown): Promise<void> {
  try {
    const res = await fetch(`${CONTENT_API_URL}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) {
      logger.warn(`content-api ${path} returned ${res.status}`, { path });
    }
  } catch (err) {
    logger.warn(`content-api ${path} failed (network)`, { err: (err as Error).message });
  }
}

// ── Room management ───────────────────────────────────────────────────────────

function getOrCreate(code: string, title = 'Historia', inheritFrom?: string): RoomState {
  if (rooms.has(code)) return rooms.get(code)!;

  let flags: Flags   = {};
  let inheritedFrom: string | undefined;

  if (inheritFrom) {
    const parent = loadSession(inheritFrom) ?? rooms.get(inheritFrom);
    if (parent) {
      flags         = { ...parent.flags };
      inheritedFrom = inheritFrom;
      logger.info(`Room ${code} inherited flags from ${inheritFrom}`);
    }
  }

  const room: RoomState = {
    id:    code,
    title,
    flags,
    log:   [],
    clients: new Map(),
    inheritedFrom,
    phase: 'lobby',
  };
  rooms.set(code, room);
  persist(room);
  return room;
}

function nextViewer(room: RoomState): number {
  const used = new Set([...room.clients.values()].map((c) => c.viewer));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

// ── Flag helpers ──────────────────────────────────────────────────────────────

export function applyFlags(flags: Flags, set: FlagSet = {}): void {
  for (const [k, op] of Object.entries(set)) {
    if (typeof op === 'number') flags[k] = op;
    else flags[k] = (flags[k] ?? 0) + Number(op);
  }
}

// ── Story graph helpers (what-if) ─────────────────────────────────────────────

function evaluate(expr: string, flags: Flags): boolean {
  if (expr === 'default') return true;
  return expr.split('&&').every((clause) => {
    const m = clause.trim().match(/^(\w+)\s*(>=|<=|==|>|<)\s*(-?\d+)$/);
    if (!m) throw new Error(`Invalid condition: ${clause}`);
    const [, flag, op, rawValue] = m;
    const a = flags[flag] ?? 0;
    const b = Number(rawValue);
    switch (op) {
      case '>=': return a >= b;
      case '<=': return a <= b;
      case '>':  return a > b;
      case '<':  return a < b;
      default:   return a === b;
    }
  });
}

function pickVariant(chapter: StoryChapter, flags: Flags): StoryVariant | null {
  return chapter.variants.find((v) => evaluate(v.when, flags)) ?? null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const roomsService = {
  join(code: string, ws: WebSocket, title?: string, inheritFrom?: string, isTv = false): RoomClient {
    const room = getOrCreate(code, title, inheritFrom);

    if (isTv) {
      const client: RoomClient = { ws, viewer: 0, color: '', isTv: true };
      room.clients.set(ws, client);
      logger.info(`TV joined room ${code}`);
      return client;
    }

    const viewer  = nextViewer(room);
    const color   = VIEWER_COLORS[(viewer - 1) % VIEWER_COLORS.length];
    const isHost  = room.hostViewerId === undefined;

    // First non-TV viewer becomes host
    if (isHost) {
      room.hostViewerId = viewer;
      persist(room);
      logger.info(`Viewer ${viewer} is the host of room ${code}`);
    }

    const client: RoomClient = { ws, viewer, color, isTv: false, isHost };
    room.clients.set(ws, client);
    logger.info(`Viewer ${viewer} joined room ${code} (${room.clients.size} total)`);
    return client;
  },

  /** Extra data to send a viewer right after their `assigned` message (late-join catch-up). */
  catchUpPayload(code: string): {
    lastWatching?: RoomState['lastWatching'];
    openWindow?:   { decisionId: string; closesAt: number; tally: Record<string, number> };
  } {
    const room = rooms.get(code);
    if (!room) return {};
    return {
      ...(room.lastWatching ? { lastWatching: room.lastWatching } : {}),
      ...(room.openWindow   ? { openWindow:   room.openWindow   } : {}),
    };
  },

  leave(ws: WebSocket): RoomClient | null {
    for (const [code, room] of rooms) {
      if (room.clients.has(ws)) {
        const client = room.clients.get(ws)!;
        room.clients.delete(ws);
        logger.info(`${client.isTv ? 'TV' : `Viewer ${client.viewer}`} left room ${code} (${room.clients.size} remaining)`);
        if (room.clients.size === 0) rooms.delete(code);
        return client;
      }
    }
    return null;
  },

  broadcast(senderWs: WebSocket, code: string, data: string): void {
    const room = rooms.get(code);
    if (!room) return;
    for (const [ws] of room.clients) {
      if (ws !== senderWs && ws.readyState === ws.OPEN) ws.send(data);
    }
  },

  broadcastAll(code: string, data: string): void {
    const room = rooms.get(code);
    if (!room) return;
    for (const [ws] of room.clients) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  },

  /** Called by the relay when the TV sends `episode_start`.
   *  Sets room.episodeId, room.phase, and posts to content-api sessions endpoint. */
  handleEpisodeStart(code: string, episodeId: string, _flags: Flags): void {
    const room = rooms.get(code);
    if (!room) return;
    room.episodeId = episodeId;
    room.phase     = 'playing';
    persist(room);

    // Fire-and-forget to content-api
    void postToContentApi('/api/v1/sessions', { roomCode: code, episodeId });
    logger.info(`Room ${code}: episode_start episodeId=${episodeId}`);
  },

  /** Called when TV sends `window_open`. Sets openWindow and broadcasts tally.
   *  `options` are the ordered gesture keys (index 0 = A/1) so audience chat
   *  votes (`!a`, `!1`) can be resolved to an action. */
  handleWindowOpen(code: string, decisionId: string, duration: number, options?: string[]): void {
    const room = rooms.get(code);
    if (!room) return;
    room.openWindow = {
      decisionId,
      closesAt: Date.now() + duration,
      tally:    {},
      ...(options && options.length ? { options } : {}),
      audienceVotes: new Map(),
    };
    logger.info(`Room ${code}: window_open decisionId=${decisionId} closesAt=${room.openWindow.closesAt}`);
  },

  /** Called when TV sends `watching`. Stores lastWatching. */
  handleWatching(code: string, payload: { chapterId: string; chapterTitle: string; variantTag: string }): void {
    const room = rooms.get(code);
    if (!room) return;
    room.lastWatching = payload;
    persist(room);
  },

  /** Called when TV sends `window_closed`. Clears openWindow. */
  handleWindowClosed(code: string): void {
    const room = rooms.get(code);
    if (!room) return;
    room.openWindow = undefined;
    logger.info(`Room ${code}: window_closed`);
  },

  /** Called when a phone sends `vote`. Updates tally and broadcasts tally msg. Returns tally. */
  handleVote(code: string, decisionId: string, action: string): Record<string, number> | null {
    const room = rooms.get(code);
    if (!room?.openWindow) return null;
    if (room.openWindow.decisionId !== decisionId) return null;

    room.openWindow.tally[action] = (room.openWindow.tally[action] ?? 0) + 1;
    return { ...room.openWindow.tally };
  },

  /** True if the room currently has an open voting window. */
  hasOpenWindow(code: string): boolean {
    return Boolean(rooms.get(code)?.openWindow);
  },

  /**
   * Inject a Twitch **audience** vote into the live tally.
   *
   * Audience rule: these votes COUNT toward the tally/winner but are NOT phone
   * viewers — they never re-profile flags and are never persisted as viewer
   * profiles. Flags are only ever applied from the TV's `log_entry` (phone
   * votes), which the audience path never touches, so this is inherently safe.
   *
   * `optionIndex` is 0-based (`!a`/`!1` → 0). It is resolved to a gesture via
   * the current window's `options[]`. One vote per Twitch username per window;
   * a later vote from the same username overwrites the earlier one.
   *
   * Returns the updated tally + resolved action, or null if there is no open
   * window / the index is out of range / this vote changed nothing.
   */
  handleAudienceVote(
    code: string,
    twitchUser: string,
    optionIndex: number,
  ): { tally: Record<string, number>; decisionId: string; action: string } | null {
    const room = rooms.get(code);
    if (!room?.openWindow) return null;

    const options = room.openWindow.options;
    if (!options || optionIndex < 0 || optionIndex >= options.length) return null;

    const action = options[optionIndex];
    const votes  = room.openWindow.audienceVotes ?? (room.openWindow.audienceVotes = new Map());

    const prev = votes.get(twitchUser);
    if (prev === action) return null; // no-op: same vote again

    // Overwrite: retract the previous audience choice from the tally.
    if (prev !== undefined) {
      room.openWindow.tally[prev] = Math.max(0, (room.openWindow.tally[prev] ?? 0) - 1);
      if (room.openWindow.tally[prev] === 0) delete room.openWindow.tally[prev];
    }

    votes.set(twitchUser, action);
    room.openWindow.tally[action] = (room.openWindow.tally[action] ?? 0) + 1;

    return { tally: { ...room.openWindow.tally }, decisionId: room.openWindow.decisionId, action };
  },

  applyQuestionnaire(
    code: string,
    answers: { questionId: string; optionId: string }[],
    episode: EpisodeDetail,
  ): { chapterId: string; flags: Flags } {
    const room = getOrCreate(code);

    for (const { questionId, optionId } of answers) {
      const question = episode.questionnaire.find((q: Question) => q.id === questionId);
      const option   = question?.options.find((o) => o.id === optionId);
      if (option) applyFlags(room.flags, option.flags as FlagSet);
    }

    persist(room);

    const chapterId = episode.chapters[0]?.id ?? 'ch1';
    return { chapterId, flags: { ...room.flags } };
  },

  pushLog(code: string, entry: LogEntry): void {
    const room = rooms.get(code);
    if (!room) return;
    const lastFlags = entry.decisions.at(-1)?.flagsAfter;
    if (lastFlags) applyFlags(room.flags, lastFlags as unknown as FlagSet);

    // Merge entries for same chapter
    const existing = [...room.log].reverse().find((e: LogEntry) => e.chapter === entry.chapter);
    if (existing) {
      existing.decisions.push(...entry.decisions);
      if (!existing.variantPlayed && entry.variantPlayed) {
        existing.variantPlayed = entry.variantPlayed;
      }
    } else {
      room.log.push(entry);
    }

    persist(room);
    logger.info(`Room ${code}: decision logged for chapter ${entry.chapter}`);

    // Post each decision to content-api
    for (const dec of entry.decisions) {
      const votes: Record<string, number> = {};
      for (const v of dec.votes) {
        votes[v.action] = (votes[v.action] ?? 0) + 1;
      }
      void postToContentApi(`/api/v1/sessions/${code}/decisions`, {
        chapterId:  entry.chapter,
        decisionId: dec.decisionId,
        chosen:     dec.chosen,
        votes,
        flagsAfter: dec.flagsAfter,
      });
    }
  },

  close(code: string): void {
    const room = rooms.get(code);
    if (!room) return;
    room.closedAt = new Date().toISOString();
    room.phase    = 'ended';
    persist(room);
    logger.info(`Room ${code} closed`);
  },

  whatIf(code: string, atChapter: string, altOptionIndex: number, story: StoryGraph): string[] | null {
    const room = rooms.get(code) ?? loadSession(code);
    if (!room) return null;

    const idx = room.log.findIndex((e) => e.chapter === atChapter);
    if (idx === -1) return null;

    const prevFlags = room.log[idx - 1]?.decisions?.at(-1)?.flagsAfter ?? story.flags;
    const flags: Flags = { ...prevFlags };
    const chapter      = story.chapters.find((c) => c.id === atChapter);
    if (!chapter?.decisions?.length) return null;

    const altOption = chapter.decisions[0]?.options[altOptionIndex];
    if (!altOption) return null;

    applyFlags(flags, altOption.set);

    const startIdx = story.chapters.findIndex((c) => c.id === atChapter) + 1;
    const path: string[] = [];

    for (const ch of story.chapters.slice(startIdx)) {
      const v = pickVariant(ch, flags);
      if (!v) break;
      path.push(`${ch.title} — ${v.tag ?? v.when}`);
      const lastDec = ch.decisions.at(-1);
      if (!lastDec) break;
      applyFlags(flags, lastDec.default.set);
    }

    return path;
  },

  stats(code: string): RoomStats | null {
    const room = rooms.get(code) ?? loadSession(code);
    if (!room) return null;
    const viewers = [...room.clients.values()].filter((c) => !c.isTv);
    return {
      code,
      clients:   viewers.length,
      viewers:   viewers.map((c) => c.viewer),
      flags:     room.flags,
      decisions: room.log.length,
      closedAt:  room.closedAt,
      phase:     room.phase ?? 'lobby',
    };
  },

  allStats(): RoomStats[] {
    ensureDir();
    const fromMemory = [...rooms.entries()].map(([code, room]) => ({
      code,
      clients:   [...room.clients.values()].filter((c) => !c.isTv).length,
      viewers:   [...room.clients.values()].filter((c) => !c.isTv).map((c) => c.viewer),
      flags:     room.flags,
      decisions: room.log.length,
      closedAt:  room.closedAt,
      phase:     room.phase ?? 'lobby' as const,
    }));

    const inMemoryIds = new Set(rooms.keys());
    const fromDisk = readdirSync(ROOMS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
      .filter((id) => !inMemoryIds.has(id))
      .map((id) => loadSession(id))
      .filter((s): s is RoomState => s !== null)
      .map((room) => ({
        code:      room.id,
        clients:   0,
        viewers:   [],
        flags:     room.flags,
        decisions: room.log.length,
        closedAt:  room.closedAt,
        phase:     room.phase ?? 'lobby' as const,
      }));

    return [...fromMemory, ...fromDisk];
  },
};
