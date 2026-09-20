import type {
  AssignedMsg, WindowOpenMsg, WindowClosedMsg,
  WatchingMsg, StoryEndMsg, EpisodeStartMsg,
  Action, VoteMsg, JoinMsg,
} from '@fire-stick/types';

type IncomingMsg =
  | AssignedMsg
  | EpisodeStartMsg
  | WindowOpenMsg
  | WindowClosedMsg
  | WatchingMsg
  | StoryEndMsg;

export interface RelayEvents {
  onAssigned:      (viewer: number, color: string) => void;
  onEpisodeStart:  (chapterId: string, flags: Record<string, number>) => void;
  onWindowOpen:    (msg: WindowOpenMsg) => void;
  onWindowClosed:  (chosen: Action | 'default') => void;
  onWatching:      (msg: WatchingMsg) => void;
  onStoryEnd:      () => void;
  onStatusChange:  (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
}

export class RelayClient {
  private ws:             WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff         = 1000;
  private closed          = false;

  viewer = 0;
  color  = '#ffffff';

  constructor(
    private readonly wsUrl: string,
    private readonly room:  string,
    private readonly events: RelayEvents,
  ) {}

  connect(): void {
    if (this.closed) return;
    this.events.onStatusChange('connecting');
    this.ws = new WebSocket(`${this.wsUrl}?room=${this.room}`);

    this.ws.onopen = () => {
      this.backoff = 1000;
      this.events.onStatusChange('connected');
      const join: JoinMsg = { type: 'join', room: this.room };
      this.ws!.send(JSON.stringify(join));
    };

    this.ws.onmessage = (ev) => {
      try { this.dispatch(JSON.parse(ev.data as string) as IncomingMsg); }
      catch { /* ignore malformed */ }
    };

    this.ws.onerror  = () => this.events.onStatusChange('error');
    this.ws.onclose  = () => {
      this.events.onStatusChange('disconnected');
      if (!this.closed) this.scheduleReconnect();
    };
  }

  private dispatch(msg: IncomingMsg): void {
    switch (msg.type) {
      case 'assigned':      this.viewer = msg.viewer; this.color = msg.color;
                            this.events.onAssigned(msg.viewer, msg.color);   break;
      case 'episode_start': this.events.onEpisodeStart(msg.chapterId, msg.flags); break;
      case 'window_open':   this.events.onWindowOpen(msg);                   break;
      case 'window_closed': this.events.onWindowClosed(msg.chosen);          break;
      case 'watching':      this.events.onWatching(msg);                     break;
      case 'story_end':     this.events.onStoryEnd();                        break;
    }
  }

  sendVote(decisionId: string, action: Action): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: VoteMsg = {
      type: 'vote', room: this.room,
      viewer: this.viewer, decisionId, action, ts: Date.now(),
    };
    this.ws.send(JSON.stringify(msg));
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.backoff = Math.min(this.backoff * 1.5, 15_000);
      this.connect();
    }, this.backoff);
  }

  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
