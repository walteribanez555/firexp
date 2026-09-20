try { process.loadEnvFile('.env'); } catch { /* .env is optional */ }

import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { serve } from '@hono/node-server';
import { app } from './app';
import { createLogger, config } from './config';
import { roomsService } from './modules/rooms/rooms.service';
import { twitchAdapter } from './modules/twitch/twitch.adapter';
import { AnyIncomingMsgSchema } from '@fire-stick/types/schemas';

const logger = createLogger('Server');
const PORT   = config.getValue('port');

// ── HTTP server (Hono) ────────────────────────────────────────────────────────

const serverInstance = serve({ fetch: app.fetch, port: PORT }, (info) => {
  logger.info(`HTTP server running on port ${info.port}`);
});

// ── WebSocket server (ws) ─────────────────────────────────────────────────────

const wss = new WebSocketServer({ server: serverInstance as unknown as Server });

wss.on('connection', (ws, req) => {
  const url  = new URL(req.url ?? '/', 'ws://localhost');
  const code = (url.searchParams.get('room') ?? '').toUpperCase();
  const isTv = url.searchParams.get('role') === 'tv';

  if (!code) { ws.close(1008, 'Missing ?room= parameter'); return; }

  const client = roomsService.join(code, ws, undefined, undefined, isTv);

  if (isTv) {
    logger.info(`[WS] TV joined room=${code}`);
  } else {
    logger.info(`[WS] viewer=${client.viewer} joined room=${code} host=${client.isHost ?? false}`);

    // Tell the phone its assigned slot/color (+ host flag if applicable)
    const assigned = JSON.stringify({
      type:   'assigned',
      viewer: client.viewer,
      color:  client.color,
      ...(client.isHost ? { host: true } : {}),
    });
    ws.send(assigned);

    // Tell the room's TV a new viewer joined
    roomsService.broadcast(ws, code, assigned);

    // Late-join catch-up: send current watching state + open window to this viewer
    const catchUp = roomsService.catchUpPayload(code);
    if (catchUp.lastWatching) {
      ws.send(JSON.stringify({ type: 'watching', ...catchUp.lastWatching }));
    }
    if (catchUp.openWindow) {
      ws.send(JSON.stringify({
        type:       'window_open_sync',
        decisionId: catchUp.openWindow.decisionId,
        closesAt:   catchUp.openWindow.closesAt,
        tally:      catchUp.openWindow.tally,
      }));
    }
  }

  ws.on('message', (raw) => {
    const rawStr = raw.toString();

    // ── Zod validation ───────────────────────────────────────────────────────
    let parsed: ReturnType<typeof AnyIncomingMsgSchema.safeParse>;
    try {
      const json = JSON.parse(rawStr) as unknown;
      parsed = AnyIncomingMsgSchema.safeParse(json);
    } catch {
      logger.warn(`[WS] room=${code} viewer=${client.viewer} → unparseable JSON`);
      return;
    }

    if (!parsed.success) {
      logger.warn(`[WS] room=${code} viewer=${client.viewer} → zod validation failed`, {
        errors: parsed.error.issues.map((i) => i.message),
        raw:    rawStr.slice(0, 200),
      });
      return; // drop silently — don't crash the room
    }

    const msg = parsed.data;
    logger.info(`[WS] room=${code} viewer=${client.viewer} → type=${msg.type}`);

    // ── ping → pong (reference clock) ────────────────────────────────────────
    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', t0: msg.t0, tRelay: Date.now() }));
      return;
    }

    // ── join is a no-op (handled at connection) ───────────────────────────────
    if (msg.type === 'join') return;

    // ── episode_start (TV → relay) ────────────────────────────────────────────
    if (msg.type === 'episode_start') {
      const episodeId = msg.episodeId ?? 'unknown';
      roomsService.handleEpisodeStart(code, episodeId, msg.flags);

      const room = roomsService.stats(code);
      logger.info(`[WS] room=${code} episode_start episodeId=${episodeId} (${room?.clients ?? 0} clients)`);
      roomsService.broadcast(ws, code, rawStr);
      return;
    }

    // ── window_open (TV → relay → phones) ────────────────────────────────────
    if (msg.type === 'window_open') {
      // Pass ordered gesture keys so Twitch audience votes (!a/!1) can map by index.
      const optionGestures = msg.options.map((o) => o.gesture);
      roomsService.handleWindowOpen(code, msg.decisionId, msg.duration, optionGestures);
      roomsService.broadcast(ws, code, rawStr);
      return;
    }

    // ── window_closed (TV → relay → phones) ──────────────────────────────────
    if (msg.type === 'window_closed') {
      roomsService.handleWindowClosed(code);
      roomsService.broadcast(ws, code, rawStr);
      return;
    }

    // ── watching (TV → relay → phones) ───────────────────────────────────────
    if (msg.type === 'watching') {
      roomsService.handleWatching(code, {
        chapterId:    msg.chapterId,
        chapterTitle: msg.chapterTitle,
        variantTag:   msg.variantTag,
      });
      roomsService.broadcast(ws, code, rawStr);
      return;
    }

    // ── vote (phone → relay → TV + tally broadcast) ───────────────────────────
    if (msg.type === 'vote') {
      // Forward to TV
      roomsService.broadcast(ws, code, rawStr);

      // Update tally + broadcast tally message
      const tally = roomsService.handleVote(code, msg.decisionId, msg.action);
      if (tally) {
        const tallyMsg = JSON.stringify({ type: 'tally', decisionId: msg.decisionId, counts: tally });
        roomsService.broadcastAll(code, tallyMsg);
      }
      return;
    }

    // ── log_entry (TV → relay): persist + post to content-api ────────────────
    if (msg.type === 'log_entry') {
      roomsService.pushLog(code, msg);
      // Don't re-broadcast log_entry to phones (it's a TV→relay internal message)
      return;
    }

    // ── story_end (TV → relay → phones) ──────────────────────────────────────
    if (msg.type === 'story_end') {
      roomsService.close(code);
      twitchAdapter.detach(code); // clean up any attached Twitch IRC socket
      roomsService.broadcast(ws, code, rawStr);
      return;
    }

    // ── default: broadcast anything else ─────────────────────────────────────
    const room = roomsService.stats(code);
    logger.info(`[WS] broadcasting to room=${code} (${(room?.clients ?? 0) - 1} other clients)`);
    roomsService.broadcast(ws, code, rawStr);
  });

  ws.on('close', () => {
    const removed = roomsService.leave(ws);
    logger.info(`[WS] ${removed?.isTv ? 'TV' : `viewer=${removed?.viewer}`} left room=${code}`);
    if (removed && !removed.isTv) {
      roomsService.broadcastAll(code, JSON.stringify({ type: 'viewer_left', viewer: removed.viewer }));
    }
  });
  ws.on('error', (err) => { logger.error('WebSocket error', err); roomsService.leave(ws); });
});

// ── Optional Twitch chat → audience votes adapter ─────────────────────────────
// Inert unless TWITCH_CHANNEL + TWITCH_ROOM are set (or a channel is attached at
// runtime via POST /api/v1/rooms/:code/twitch).
twitchAdapter.initFromEnv();

logger.info(`WebSocket server attached on port ${PORT}`);
