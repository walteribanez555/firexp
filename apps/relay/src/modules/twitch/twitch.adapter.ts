/**
 * Twitch chat → audience votes adapter (OPTIONAL, read-only, self-contained).
 *
 * Connects ANONYMOUSLY to Twitch IRC-over-WebSocket and turns chat commands
 * like `!a`/`!b`/`!c` or `!1`/`!2` into *audience* votes for a mapped room.
 * When no channel is configured (no env, no runtime attach) this module does
 * nothing and the relay behaves exactly as before.
 *
 * Design notes:
 *  - Anonymous read-only login: NICK justinfan<random>, no PASS/oauth token.
 *  - One IRC socket per attached channel; auto-reconnect with backoff.
 *  - Votes are injected via roomsService.handleAudienceVote (the "audience
 *    rule": they count in the live tally but never re-profile flags and are
 *    never persisted as viewer profiles). Synthetic viewer ids are unnecessary
 *    because audience votes live only in openWindow.tally, keyed by action, and
 *    are deduped per Twitch username — they can never collide with phone
 *    viewers (which carry small positive numeric ids).
 *  - Tally updates are broadcast to the whole room with the same `tally`
 *    message shape the relay already uses for phone votes.
 */

import WebSocket from 'ws';
import { roomsService } from '../rooms/rooms.service';
import { createLogger } from '../../config';

const logger = createLogger('TwitchAdapter');

const TWITCH_IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';

/** letter → index (a→0, b→1 …) plus digit → index (1→0, 2→1 …). */
function parseVoteCommand(text: string): number | null {
  // Grab the first `!token` in the message.
  const m = text.trim().toLowerCase().match(/^!\s*([a-z]|\d{1,2})\b/);
  if (!m) return null;
  const token = m[1];
  if (/^[a-z]$/.test(token)) return token.charCodeAt(0) - 97; // 'a' → 0
  const n = Number(token);
  return Number.isFinite(n) && n >= 1 ? n - 1 : null;         // '1' → 0
}

/**
 * Parse a raw IRC line. We only care about PRIVMSG. Returns the sender's login
 * and the message text, or null for anything else (JOIN, NOTICE, etc.).
 *
 * Example line:
 *   :nick!nick@nick.tmi.twitch.tv PRIVMSG #channel :!a go for it
 */
function parsePrivmsg(line: string): { user: string; text: string } | null {
  // Skip IRCv3 tags if present (`@tag=...;... :nick!...`).
  const body = line.startsWith('@') ? line.slice(line.indexOf(' ') + 1) : line;
  if (!body.startsWith(':')) return null;

  const sp = body.indexOf(' ');
  const prefix = body.slice(1, sp);
  const rest = body.slice(sp + 1);
  if (!rest.startsWith('PRIVMSG')) return null;

  const user = prefix.split('!')[0];
  const colon = rest.indexOf(' :');
  if (colon === -1) return null;
  const text = rest.slice(colon + 2);
  return { user: user.toLowerCase(), text };
}

class ChannelConnection {
  private ws: WebSocket | null = null;
  private closed = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoffMs = 1000;

  constructor(
    public readonly channel: string,
    public readonly roomCode: string,
  ) {}

  start(): void {
    this.closed = false;
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    const ws = new WebSocket(TWITCH_IRC_URL);
    this.ws = ws;

    ws.on('open', () => {
      this.backoffMs = 1000;
      const nick = `justinfan${Math.floor(Math.random() * 80000) + 1000}`;
      // Read-only anonymous login — no PASS required.
      ws.send(`NICK ${nick}`);
      ws.send(`JOIN #${this.channel}`);
      logger.info(`connected channel=#${this.channel} → room=${this.roomCode} as ${nick}`);
    });

    ws.on('message', (raw) => {
      const data = raw.toString();
      for (const line of data.split('\r\n')) {
        if (!line) continue;
        if (line.startsWith('PING')) {
          ws.send(`PONG ${line.slice(5)}`.trimEnd());
          continue;
        }
        const msg = parsePrivmsg(line);
        if (msg) this.handleChat(msg.user, msg.text);
      }
    });

    ws.on('close', () => {
      if (this.closed) return;
      this.scheduleReconnect();
    });

    ws.on('error', (err) => {
      logger.warn(`socket error channel=#${this.channel}`, { err: (err as Error).message });
      // 'close' will follow and trigger reconnect.
    });
  }

  private handleChat(user: string, text: string): void {
    // Cheap gate: only rooms with an open window can receive audience votes.
    if (!roomsService.hasOpenWindow(this.roomCode)) return;

    const idx = parseVoteCommand(text);
    if (idx === null) return;

    const result = roomsService.handleAudienceVote(this.roomCode, user, idx);
    if (!result) return; // no open window, out-of-range index, or duplicate vote

    logger.info(`audience vote #${this.channel} user=${user} → ${result.action} (room=${this.roomCode})`);

    roomsService.broadcastAll(
      this.roomCode,
      JSON.stringify({
        type:       'tally',
        decisionId: result.decisionId,
        counts:     result.tally,
        source:     'twitch',
      }),
    );
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, 30000);
    logger.info(`reconnecting channel=#${this.channel} in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    logger.info(`stopped channel=#${this.channel} (room=${this.roomCode})`);
  }
}

/** roomCode → live connection. One channel per room. */
const connections = new Map<string, ChannelConnection>();

function normChannel(channel: string): string {
  return channel.trim().toLowerCase().replace(/^#/, '');
}

export const twitchAdapter = {
  /** True when at least one channel is attached (used only for logging/tests). */
  get active(): boolean {
    return connections.size > 0;
  },

  /**
   * Attach a Twitch channel to a room. Idempotent: attaching the same channel
   * to the same room is a no-op; attaching a different channel replaces the old
   * connection. Returns the normalized channel actually attached.
   */
  attach(roomCode: string, channel: string): string | null {
    const code = roomCode.toUpperCase();
    const chan = normChannel(channel);
    if (!chan) return null;

    const existing = connections.get(code);
    if (existing) {
      if (existing.channel === chan) return chan; // already attached
      existing.stop();
      connections.delete(code);
    }

    const conn = new ChannelConnection(chan, code);
    connections.set(code, conn);
    conn.start();
    logger.info(`attached channel=#${chan} → room=${code}`);
    return chan;
  },

  /** Detach + clean up the IRC socket for a room (called when the room closes). */
  detach(roomCode: string): void {
    const code = roomCode.toUpperCase();
    const conn = connections.get(code);
    if (!conn) return;
    conn.stop();
    connections.delete(code);
  },

  /**
   * Wire up static env-based channel→room mapping. Reads TWITCH_CHANNEL +
   * TWITCH_ROOM; if either is missing the adapter stays fully inert.
   * Safe to call once at startup.
   */
  initFromEnv(): void {
    const channel = process.env['TWITCH_CHANNEL'];
    const room    = process.env['TWITCH_ROOM'];
    if (!channel || !room) return; // unconfigured → do nothing
    this.attach(room, channel);
    logger.info(`env mapping active: #${normChannel(channel)} → room=${room.toUpperCase()}`);
  },
};
