/**
 * Zod schemas mirroring the WebSocket message interfaces from index.ts.
 * Relay uses these for runtime validation — safeParse on every incoming message.
 */

import { z } from 'zod';

// ── Shared ─────────────────────────────────────────────────────────────────────

const ActionSchema = z.enum([
  'hands_up',
  'crouch',
  'lean_forward',
  'cover_eyes',
  'point_left',
  'point_right',
  'stand_up',
]);

const FlagsSchema = z.record(z.number());
const FlagSetSchema = z.record(z.union([z.string(), z.number()]));

// ── Incoming from phone ────────────────────────────────────────────────────────

export const JoinMsgSchema = z.object({
  type:   z.literal('join'),
  room:   z.string().min(1),
});

export const VoteMsgSchema = z.object({
  type:       z.literal('vote'),
  room:       z.string().min(1),
  viewer:     z.number().int(),
  decisionId: z.string().min(1),
  action:     ActionSchema,
  ts:         z.number(),
});

export const PingMsgSchema = z.object({
  type: z.literal('ping'),
  t0:   z.number(),
});

// ── Incoming from TV ───────────────────────────────────────────────────────────

export const WindowOpenMsgSchema = z.object({
  type:           z.literal('window_open'),
  decisionId:     z.string().min(1),
  phase:          z.enum(['pre', 'during']),
  chapterTitle:   z.string(),
  prompt:         z.string(),
  options:        z.array(z.object({ gesture: ActionSchema, label: z.string() })),
  duration:       z.number().positive(),
  questionIndex:  z.number().int().positive(),
  totalQuestions: z.number().int().positive(),
});

export const WindowClosedMsgSchema = z.object({
  type:   z.literal('window_closed'),
  chosen: z.union([ActionSchema, z.literal('default')]),
});

export const WatchingMsgSchema = z.object({
  type:         z.literal('watching'),
  chapterId:    z.string().min(1),
  chapterTitle: z.string(),
  variantTag:   z.string(),
});

export const StoryEndMsgSchema = z.object({
  type: z.literal('story_end'),
});

const DecisionLogSchema = z.object({
  decisionId: z.string(),
  phase:      z.enum(['pre', 'during']),
  votes:      z.array(z.object({ viewer: z.number(), action: ActionSchema })),
  chosen:     z.union([ActionSchema, z.literal('default')]),
  margin:     z.number(),
  flagsAfter: FlagsSchema,
  ts:         z.number(),
});

export const LogEntryMsgSchema = z.object({
  type:          z.literal('log_entry'),
  chapter:       z.string(),
  variantPlayed: z.string(),
  decisions:     z.array(DecisionLogSchema),
});

export const EpisodeStartMsgSchema = z.object({
  type:       z.literal('episode_start'),
  chapterId:  z.string().min(1),
  flags:      FlagsSchema,
  episodeId:  z.string().optional(),
});

// ── Union: any message that can arrive at the relay ───────────────────────────

export const AnyIncomingMsgSchema = z.discriminatedUnion('type', [
  JoinMsgSchema,
  VoteMsgSchema,
  PingMsgSchema,
  WindowOpenMsgSchema,
  WindowClosedMsgSchema,
  WatchingMsgSchema,
  StoryEndMsgSchema,
  LogEntryMsgSchema,
  EpisodeStartMsgSchema,
]);

export type AnyIncomingMsg = z.infer<typeof AnyIncomingMsgSchema>;

// Re-export for convenience
export { ActionSchema, FlagsSchema, FlagSetSchema };
