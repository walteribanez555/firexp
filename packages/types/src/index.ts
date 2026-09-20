// ─── Vote actions ─────────────────────────────────────────────────────────────

export type Action =
  | 'hands_up'
  | 'crouch'
  | 'lean_forward'
  | 'cover_eyes'
  | 'point_left'
  | 'point_right'
  | 'stand_up';

// ─── WebSocket messages ───────────────────────────────────────────────────────

/** Phone → Relay → TV: viewer tapped an option */
export interface VoteMsg {
  type:       'vote';
  room:       string;
  viewer:     number;
  decisionId: string;
  action:     Action;
  ts:         number;
}

/** Phone → Relay (sent on first connect) */
export interface JoinMsg {
  type: 'join';
  room: string;
}

/** Relay → Room: tally update after a vote */
export interface TallyMsg {
  type:       'tally';
  decisionId: string;
  counts:     Record<string, number>;
}

/** Phone / TV → Relay: reference clock ping */
export interface PingMsg {
  type: 'ping';
  t0:   number;
}

/** Relay → sender: reference clock pong */
export interface PongMsg {
  type:   'pong';
  t0:     number;
  tRelay: number;
}

/** TV → Phones: a decision window opened */
export interface WindowOpenMsg {
  type:           'window_open';
  decisionId:     string;
  phase:          'pre' | 'during';
  chapterTitle:   string;
  prompt:         string;
  options:        { gesture: Action; label: string }[];
  /** Duration of the window in milliseconds */
  duration:       number;
  /** 1-based index within the chapter's pre-decisions */
  questionIndex:  number;
  totalQuestions: number;
}

/** TV → Phones: a decision window closed */
export interface WindowClosedMsg {
  type:   'window_closed';
  chosen: Action | 'default';
}

/** TV → Phones: chapter video is now playing */
export interface WatchingMsg {
  type:         'watching';
  chapterId:    string;
  chapterTitle: string;
  variantTag:   string;
}

/** TV → Phones: story finished */
export interface StoryEndMsg {
  type: 'story_end';
}

/**
 * TV → Relay: a chapter's decision was resolved — persisted into the room log.
 * Carries the full `LogEntry` payload so the relay can append it verbatim.
 */
export interface LogEntryMsg extends LogEntry {
  type: 'log_entry';
}

/** Relay → TV: questionnaire complete, episode can start.
 *  Also sent TV → Relay to notify that an episode is beginning (with optional episodeId). */
export interface EpisodeStartMsg {
  type:       'episode_start';
  chapterId:  string;
  flags:      Flags;
  episodeId?: string;
}

/** Relay → Phone: assigned viewer slot on join. Also broadcast to the room's TV. */
export interface AssignedMsg {
  type:   'assigned';
  viewer: number;
  color:  string;
}

/** Relay → room: a viewer (phone) disconnected. Lets the TV drop it from the lobby. */
export interface ViewerLeftMsg {
  type:   'viewer_left';
  viewer: number;
}

export type PhoneMsg  = VoteMsg | JoinMsg | PingMsg;
export type TvMsg     = WindowOpenMsg | WindowClosedMsg | WatchingMsg | StoryEndMsg | LogEntryMsg | PingMsg;
export type RelayMsg  = AssignedMsg | ViewerLeftMsg | EpisodeStartMsg | TallyMsg | PongMsg;
export type AnyMsg    = PhoneMsg | TvMsg | RelayMsg;

// ─── Series & Episodes ────────────────────────────────────────────────────────

export interface QuestionOption {
  id:    string;
  label: string;
  /** Flag mutations applied when this option is selected */
  flags: FlagSet;
}

export interface Question {
  id:      string;
  text:    string;
  options: QuestionOption[];
}

export interface EpisodeSummary {
  id:           string;
  number:       number;
  title:        string;
  thumbnailUrl: string;
}

export interface SeriesSummary {
  id:           string;
  title:        string;
  description:  string;
  /** Optional grouping label (e.g. "Horror", "Sci-Fi"). */
  category?:    string;
  thumbnailUrl: string;
  episodes:     EpisodeSummary[];
}

/** Full episode = StoryGraph + series metadata + questionnaire */
export interface EpisodeDetail extends StoryGraph {
  id:            string;
  seriesId:      string;
  number:        number;
  questionnaire: Question[];
}

// ─── Flags ────────────────────────────────────────────────────────────────────

/** Mutable numeric state accumulated across decisions and episodes. */
export type Flags = Record<string, number>;

/**
 * A set of flag mutations applied when an option wins.
 * String values are relative ("+1", "-1"); numbers are absolute.
 */
export type FlagSet = Record<string, string | number>;

// ─── Story graph ──────────────────────────────────────────────────────────────

export interface StoryVariant {
  /** Start time in the concatenated video file (seconds) */
  in:   number;
  /** End time in the concatenated video file (seconds) */
  out:  number;
  /**
   * Condition evaluated against current Flags.
   * Supports "flag >= N", "flag <= N", "flag > N", "flag < N", "flag == N"
   * and "&&" to combine clauses. Last variant MUST be "default".
   */
  when: string;
  tag?:      string;
  /** CDN URL for segment-based playback (fire-hack / Android). Optional. */
  videoUrl?: string;
}

export interface DecisionOption {
  gesture: Action;
  label:   string;
  set:     FlagSet;
}

export interface DecisionDefault {
  set: FlagSet;
}

export interface ChapterDecision {
  id:     string;
  phase:  'pre' | 'during';
  /** Only for phase === 'during': seconds from start of file */
  at?:    number;
  window: number;
  prompt?: string;
  options: DecisionOption[];
  default: DecisionDefault;
}

export interface StoryChapter {
  id:        string;
  title:     string;
  decisions: ChapterDecision[];
  variants:  StoryVariant[];
}

export interface StoryGraph {
  video:    string;
  title:    string;
  flags:    Flags;
  chapters: StoryChapter[];
}

// ─── Session log ──────────────────────────────────────────────────────────────

export interface VoteRecord {
  viewer: number;
  action: Action;
}

export interface DecisionLog {
  decisionId: string;
  phase:      'pre' | 'during';
  votes:      VoteRecord[];
  chosen:     Action | 'default';
  margin:     number;
  flagsAfter: Flags;
  ts:         number;
}

export interface LogEntry {
  chapter:       string;
  variantPlayed: string;
  decisions:     DecisionLog[];
}

export interface RoomSession {
  id:            string;
  title:         string;
  flags:         Flags;
  log:           LogEntry[];
  closedAt?:     string;
  inheritedFrom?: string;
}
