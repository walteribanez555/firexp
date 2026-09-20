import type {
  EpisodeDetail, WindowOpenMsg, WatchingMsg,
  Action, VoteMsg, JoinMsg, AssignedMsg,
  WindowClosedMsg, StoryEndMsg, EpisodeStartMsg, LogEntry, DecisionLog,
  TallyMsg, PingMsg, PongMsg,
} from '@fire-stick/types';

// ── Config ────────────────────────────────────────────────────────────────────

const params     = new URLSearchParams(location.search);
const roomCode   = (params.get('room') ?? '').toUpperCase();
const episodeId  = params.get('episode') ?? 'episode1';
const relayHost  = `${location.protocol}//${location.hostname}:3001`;
const wsUrl      = relayHost.replace(/^http/, 'ws');

// ── viewerId: persisted in sessionStorage for reconnect dedup ─────────────────

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
let viewerId = sessionStorage.getItem('viewerId');
if (!viewerId) {
  viewerId = genId();
  sessionStorage.setItem('viewerId', viewerId);
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const $app = document.getElementById('app')!;
const $dot = document.getElementById('status-dot')!;
const $txt = document.getElementById('status-text')!;
const $bar = document.getElementById('status-bar')!;

let $hostBadge: HTMLElement | null = null;

function setStatus(s: 'connecting' | 'connected' | 'disconnected' | 'error') {
  $dot.className   = s;
  $txt.textContent = { connecting: 'Connecting…', connected: 'Connected', disconnected: 'Reconnecting…', error: 'Error' }[s];
}

function showHostBadge(visible: boolean) {
  if (visible && !$hostBadge) {
    $hostBadge = document.createElement('span');
    $hostBadge.id        = 'host-badge';
    $hostBadge.className = 'host-badge';
    $hostBadge.textContent = 'Host';
    $bar.appendChild($hostBadge);
  } else if (!visible && $hostBadge) {
    $hostBadge.remove();
    $hostBadge = null;
  }
}

function show(html: string) { $app.innerHTML = html; }

// ── Debug log ─────────────────────────────────────────────────────────────────
// No on-screen overlay; keep a quiet console trace for devtools only.

const DEBUG = false;
function dbg(msg: string) {
  if (DEBUG) console.debug('[phone]', msg);
}

// ── Reference clock (B2) ──────────────────────────────────────────────────────
// Sends 3 pings on WS open; computes median(tRelay - (t0 + rtt/2)).
// relayNow() gives a local ms estimate of the relay's clock.

const clockOffsets: number[] = [];
let clockOffset = 0;

function relayNow(): number {
  return Date.now() + clockOffset;
}

function updateClockOffset() {
  const sorted = [...clockOffsets].sort((a, b) => a - b);
  clockOffset = sorted[Math.floor(sorted.length / 2)];
  dbg(`clock offset=${clockOffset}ms (n=${sorted.length})`);
}

function sendPings(count = 3) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const ping: PingMsg = { type: 'ping', t0: Date.now() };
        ws.send(JSON.stringify(ping));
      }
    }, i * 80);
  }
}

function handlePong(msg: PongMsg) {
  const now    = Date.now();
  const rtt    = now - msg.t0;
  const offset = msg.tRelay - (msg.t0 + rtt / 2);
  clockOffsets.push(offset);
  if (clockOffsets.length > 9) clockOffsets.shift(); // keep last 9
  updateClockOffset();
  dbg(`pong rtt=${rtt}ms offset=${offset.toFixed(1)}ms`);
}

// ── Wake Lock (B5) ────────────────────────────────────────────────────────────

type WakeLockSentinel = { release(): Promise<void>; released: boolean } & EventTarget;
type WakeLockAPI      = { request(type: 'screen'): Promise<WakeLockSentinel> };

let wakeLock: WakeLockSentinel | null = null;

async function acquireWakeLock() {
  const nav = navigator as Navigator & { wakeLock?: WakeLockAPI };
  if (!nav.wakeLock) return;
  try {
    wakeLock = await nav.wakeLock.request('screen');
    dbg('wake lock acquired');
  } catch (e) {
    dbg(`wake lock FAIL: ${e}`);
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try { await wakeLock.release(); } catch {}
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ws && ws.readyState === WebSocket.OPEN) {
    void acquireWakeLock();
  }
});

// ── Vibrate helper (B5) ───────────────────────────────────────────────────────

function vibrate(pattern: number[]) {
  try { navigator.vibrate?.(pattern); } catch {}
}

// ── State ─────────────────────────────────────────────────────────────────────

let viewer       = 0;
let isHost       = false;
let color        = '#e74c3c';
let episode: EpisodeDetail | null = null;
let activeWindow: WindowOpenMsg | null = null;
let sessionLog:   LogEntry[]           = [];
let storyStarted = false;
const viewerColors = new Map<number, string>();

// Decision-window state
let currentDecisionId: string | null   = null;
let currentVoteAction:  Action | null  = null;
let liveTally:          Record<string, number> = {};

// Client-side session log — built live from watching/window_closed so the
// Library tabs have data even if the relay's server-side log is empty
// (e.g. the room was cleaned up, or video didn't drive a full playthrough).
let watchingChapterId = '';
let watchingVariant   = '';
const clientLog: LogEntry[] = [];

function clientChapterEntry(chapterId: string): LogEntry {
  let e = clientLog.find(x => x.chapter === chapterId);
  if (!e) { e = { chapter: chapterId, variantPlayed: watchingVariant, decisions: [] }; clientLog.push(e); }
  return e;
}

function recordClientDecision(win: WindowOpenMsg, chosen: string): void {
  const ch = episode?.chapters.find(c => c.title === win.chapterTitle);
  const chapterId = ch?.id ?? (watchingChapterId || win.chapterTitle);
  const entry = clientChapterEntry(chapterId);
  if (entry.decisions.some(d => d.decisionId === win.decisionId)) return;
  const votes = Object.entries(liveTally).flatMap(([action, n]) =>
    Array.from({ length: n }, (_, i) => ({ viewer: i + 1, action })));
  const sorted = Object.values(liveTally).sort((a, b) => b - a);
  entry.decisions.push({
    decisionId: win.decisionId,
    phase:      win.phase,
    chosen,
    votes,
    margin:     (sorted[0] ?? 0) - (sorted[1] ?? 0),
    flagsAfter: {},
    ts:         Date.now(),
  } as unknown as DecisionLog);
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

let ws:     WebSocket | null = null;
let backoff = 1000;
let closed  = false;

interface WindowOpenSyncMsg {
  type:       'window_open_sync';
  decisionId: string;
  closesAt:   number;               // relay epoch ms
  tally:      Record<string, number>;
}

type AssignedMsgExt = AssignedMsg & { host?: boolean };

type IncomingMsg =
  | AssignedMsgExt
  | EpisodeStartMsg
  | WindowOpenMsg
  | WindowOpenSyncMsg
  | WindowClosedMsg
  | WatchingMsg
  | StoryEndMsg
  | TallyMsg
  | PongMsg;

function connect(room: string) {
  if (closed) return;
  setStatus('connecting');
  dbg(`WS → ${wsUrl}?room=${room}`);
  ws = new WebSocket(`${wsUrl}?room=${room}`);

  ws.onopen = () => {
    backoff = 1000;
    setStatus('connected');
    dbg('WS open — sending join');
    const join = { type: 'join', room, viewerId } satisfies JoinMsg & { viewerId: string };
    ws!.send(JSON.stringify(join));
    sendPings(3);
    void acquireWakeLock();
  };

  ws.onmessage = (ev) => {
    try {
      const parsed = JSON.parse(ev.data as string) as IncomingMsg;
      dbg(`← ${parsed.type}` + ('chapterId' in parsed ? ` ch=${(parsed as EpisodeStartMsg).chapterId}` : ''));
      dispatch(parsed);
    } catch (e) { dbg(`parse err: ${e}`); }
  };

  ws.onerror  = (e) => { setStatus('error'); dbg(`WS error: ${JSON.stringify(e)}`); };
  ws.onclose  = (e) => {
    setStatus('disconnected');
    dbg(`WS closed code=${e.code}`);
    void releaseWakeLock();
    if (!closed) {
      const delay = backoff;
      backoff = Math.min(backoff * 1.5, 15_000);
      setTimeout(() => connect(room), delay);
    }
  };
}

function sendVote(decisionId: string, action: Action) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const msg: VoteMsg = { type: 'vote', room: roomCode, viewer, decisionId, action, ts: Date.now() };
  ws.send(JSON.stringify(msg));
  dbg(`vote → ${action}`);
}

function dispatch(msg: IncomingMsg) {
  switch (msg.type) {

    case 'assigned': {
      const ext = msg as AssignedMsgExt;
      viewer = ext.viewer;
      color  = ext.color;
      isHost = ext.host === true;
      viewerColors.set(ext.viewer, ext.color);
      showHostBadge(isHost);
      void loadEpisode();
      break;
    }

    case 'episode_start':
      storyStarted = true;
      showWaiting('Story is starting…');
      break;

    case 'window_open':
      activeWindow      = msg;
      currentDecisionId = msg.decisionId;
      currentVoteAction = null;
      liveTally         = {};
      showDecision(msg, null, {});
      break;

    // Late-join catch-up (B5 / spec item 3)
    case 'window_open_sync': {
      currentDecisionId = msg.decisionId;
      liveTally         = { ...msg.tally };
      if (activeWindow && activeWindow.decisionId === msg.decisionId) {
        // Rebuild decision screen with relay closesAt and pre-populated tally
        showDecision(activeWindow, msg.closesAt, msg.tally);
      } else if (activeWindow) {
        // Different decision — just update tally visuals if on screen
        updateTallyUI(msg.tally);
      } else {
        // Fully late — no window_open ever arrived; show a countdown holding screen
        showDecisionSync(msg);
      }
      break;
    }

    case 'tally':
      if (msg.decisionId === currentDecisionId) {
        liveTally = { ...msg.counts };
        updateTallyUI(msg.counts);
      }
      break;

    case 'window_closed': {
      // Capture before clearing
      const closedDecisionId = currentDecisionId;
      const closedWindow     = activeWindow;
      activeWindow      = null;
      currentDecisionId = null;
      if (closedWindow) recordClientDecision(closedWindow, msg.chosen);
      vibrate([80, 40, 80]);
      void (async () => {
        const stats = await fetchEpisodeStats();
        showResult(msg.chosen, closedDecisionId, closedWindow, stats);
      })();
      break;
    }

    case 'watching':
      watchingChapterId = msg.chapterId;
      watchingVariant   = msg.variantTag;
      clientChapterEntry(msg.chapterId).variantPlayed = msg.variantTag;
      showWatching(msg);
      break;

    case 'story_end':
      void loadLibrary();
      break;

    case 'pong':
      handlePong(msg);
      break;
  }
}

// ── API ───────────────────────────────────────────────────────────────────────

async function loadEpisode() {
  const url = `${relayHost}/api/v1/episodes/${episodeId}`;
  dbg(`GET ${url}`);
  try {
    const res   = await fetch(url);
    const body  = await res.json() as { data: EpisodeDetail };
    episode = body.data;
    dbg(`episode ok — ${episode.questionnaire.length} questions`);
    if (episode.questionnaire.length > 0) {
      showQuestionnaire(episode.questionnaire);
    } else {
      await submitQuestionnaire([]);
    }
  } catch (e) {
    dbg(`loadEpisode FAIL: ${e}`);
    showWaiting('Waiting for the story…');
  }
}

async function submitQuestionnaire(answers: { questionId: string; optionId: string }[]) {
  showWaiting('Sending your answers…');
  const url = `${relayHost}/api/v1/rooms/${roomCode}/questionnaire`;
  dbg(`POST ${url} (${answers.length} answers)`);
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ episodeId, answers }),
    });
    dbg(`questionnaire status=${res.status}`);
  } catch (e) { dbg(`submitQuestionnaire FAIL: ${e}`); }
  if (!storyStarted) showWaiting('Waiting for the story to begin…');
}

async function loadLibrary() {
  try {
    const res  = await fetch(`${relayHost}/api/v1/rooms/${roomCode}`);
    const body = await res.json() as { data: { log: LogEntry[] } };
    sessionLog = body.data.log ?? [];
  } catch {}
  // Fall back to the log we built client-side if the server has none.
  if (!sessionLog || sessionLog.length === 0) sessionLog = clientLog;
  showLibrary('journey');
}

interface StatsData {
  decisions: Record<string, {
    total:   number;
    options: Record<string, { count: number; pct: number }>;
  }>;
}

async function fetchEpisodeStats(): Promise<StatsData | null> {
  try {
    const res = await fetch(`${relayHost}/api/v1/episodes/${episodeId}/stats`);
    if (!res.ok) return null;
    const body = await res.json() as { data: StatsData };
    return body.data;
  } catch {
    return null;
  }
}

// ── Screens ───────────────────────────────────────────────────────────────────

// -- Join
function showJoin() {
  show(`
    <div class="screen center">
      <h1 class="join-title">Join the story</h1>
      <p class="join-subtitle">Enter the code shown on the TV</p>
      <input id="code-input" class="input" type="text" maxlength="8"
             placeholder="XXXX" autocomplete="off" autocorrect="off"
             autocapitalize="characters" spellcheck="false"
             value="${roomCode}" />
      <button id="join-btn" class="btn">Join</button>
    </div>
  `);

  const input = $app.querySelector<HTMLInputElement>('#code-input')!;
  const btn   = $app.querySelector<HTMLButtonElement>('#join-btn')!;

  btn.disabled = !input.value.trim();
  input.addEventListener('input', () => { btn.disabled = !input.value.trim(); });

  btn.addEventListener('click', () => {
    const code = input.value.trim().toUpperCase();
    if (!code) return;
    history.replaceState(null, '', `?room=${code}&episode=${episodeId}`);
    closed = false;
    connect(code);
    showWaiting('Connecting…');
  });

  if (input.value) input.focus();
}

// -- Waiting
function showWaiting(msg = 'Waiting…') {
  show(`
    <div class="screen center">
      <div class="spinner"></div>
      <p class="waiting-msg">${msg}</p>
      <div class="room-code">${roomCode}</div>
      <div class="viewers-row" id="viewers"></div>
    </div>
  `);
  renderViewerDots();
}

function renderViewerDots() {
  const el = document.getElementById('viewers');
  if (!el) return;
  el.innerHTML = [...viewerColors.entries()]
    .map(([, c]) => `<div class="viewer-dot" style="background:${c}"></div>`)
    .join('');
}

// -- Questionnaire
function showQuestionnaire(questions: EpisodeDetail['questionnaire']) {
  const answers = new Map<string, string>();

  const cards = questions.map((q, i) => `
    <div class="q-card" id="q-${q.id}">
      <div class="q-counter">${i + 1} / ${questions.length}</div>
      <div class="q-text">${q.text}</div>
      <div class="q-options">
        ${q.options.map(o => `
          <button class="q-opt" data-qid="${q.id}" data-oid="${o.id}">${o.label}</button>
        `).join('')}
      </div>
    </div>
  `).join('');

  show(`
    <div class="screen">
      <div class="q-header">
        <h2>Before the story begins</h2>
        <p>Your answers shape the path</p>
      </div>
      ${cards}
    </div>
  `);

  $app.querySelectorAll<HTMLButtonElement>('.q-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const qid = btn.dataset['qid']!;
      const oid = btn.dataset['oid']!;
      if (answers.has(qid)) return;
      answers.set(qid, oid);

      const card = document.getElementById(`q-${qid}`)!;
      card.querySelectorAll<HTMLButtonElement>('.q-opt').forEach(b => {
        b.disabled = true;
        b.classList.toggle('selected', b.dataset['oid'] === oid);
        b.classList.toggle('dimmed',   b.dataset['oid'] !== oid);
      });

      if (answers.size === questions.length) {
        setTimeout(() => {
          const result = [...answers.entries()].map(([questionId, optionId]) => ({ questionId, optionId }));
          void submitQuestionnaire(result);
        }, 400);
      }
    });
  });
}

// -- Decision screen
// closesAtRelay: relay-clock ms when window closes; null → derive from msg.duration
// initialTally:  pre-populated counts from late-join sync or prior tally msgs
function showDecision(
  msg:           WindowOpenMsg,
  closesAtRelay: number | null,
  initialTally:  Record<string, number>,
) {
  const isPre = msg.phase === 'pre';

  const totalVotes = Object.values(initialTally).reduce((s, n) => s + n, 0);

  const optionsHtml = msg.options.map(o => {
    const votes = initialTally[o.gesture] ?? 0;
    const pct   = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
    const isMyVote = currentVoteAction === o.gesture;
    return `
      <button class="d-opt${isMyVote ? ' voted' : ''}" data-gesture="${o.gesture}">
        <span class="d-opt-label">${o.label}</span>
        <span class="d-tally" id="tally-${o.gesture}">
          <span class="d-tally-bar-wrap"><span class="d-tally-bar" id="tbar-${o.gesture}" style="width:${pct}%"></span></span>
          <span class="d-tally-count" id="tcount-${o.gesture}">${votes > 0 ? String(votes) : ''}</span>
        </span>
      </button>`;
  }).join('');

  show(`
    <div class="screen decision">
      <div class="d-head">
        <span class="phase-tag${isPre ? '' : ' live'}">${isPre ? `Question ${msg.questionIndex} / ${msg.totalQuestions}` : 'Live decision'}</span>
        ${msg.chapterTitle ? `<span class="d-chapter">${msg.chapterTitle}</span>` : ''}
      </div>
      <h2 class="d-prompt">${msg.prompt}</h2>
      <div class="d-options">
        ${optionsHtml}
      </div>
      <div class="d-foot">
        <div class="timer-track"><div class="timer-fill" id="timer-fill"></div></div>
        <div class="d-foot-row">
          <p class="d-hint" id="d-hint">${currentVoteAction ? 'Vote sent — tap another to change' : 'Tap your choice'}</p>
          <span class="d-countdown" id="d-countdown"></span>
        </div>
      </div>
    </div>
  `);

  // Restore voted style for pre-existing vote (reconnect / re-render)
  if (currentVoteAction) {
    const hint = document.getElementById('d-hint')!;
    hint.className = 'd-hint sent';
    $app.querySelectorAll<HTMLButtonElement>('.d-opt').forEach(b => {
      b.classList.toggle('d-opt-alt', b.dataset['gesture'] !== currentVoteAction);
    });
  }

  const fill      = document.getElementById('timer-fill')!;
  const hint      = document.getElementById('d-hint')!;
  const countdown = document.getElementById('d-countdown')!;

  // Relay-time window end and total duration for the bar
  const windowEndRelay  = closesAtRelay ?? (relayNow() + msg.duration);
  const windowDurationMs = msg.duration; // always use original for % base

  let lastCallVibrated = false;

  const timer = setInterval(() => {
    const remaining = windowEndRelay - relayNow();
    const pct = Math.max(0, Math.min(100, 100 * (remaining / windowDurationMs)));
    fill.style.width = `${pct}%`;

    if (remaining > 0) {
      const secs = Math.ceil(remaining / 1000);
      countdown.textContent = `${secs}s`;
      if (secs <= 3 && !lastCallVibrated) {
        lastCallVibrated = true;
        vibrate([120, 60, 120]);
      }
    } else {
      fill.style.width  = '0%';
      countdown.textContent = '';
      clearInterval(timer);
    }
  }, 100);

  $app.querySelectorAll<HTMLButtonElement>('.d-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset['gesture'] as Action;
      if (action === currentVoteAction) return; // already this choice

      currentVoteAction = action;
      sendVote(msg.decisionId, action);

      // Light highlight on current choice; keep others tappable for re-vote
      $app.querySelectorAll<HTMLButtonElement>('.d-opt').forEach(b => {
        const isThis = b.dataset['gesture'] === action;
        b.classList.toggle('voted',     isThis);
        b.classList.toggle('d-opt-alt', !isThis);
      });

      hint.textContent = 'Vote sent — tap another to change';
      hint.className   = 'd-hint sent';
    });
  });
}

// Late-join with no WindowOpenMsg available — holding screen with countdown
function showDecisionSync(msg: WindowOpenSyncMsg) {
  const remaining = msg.closesAt - relayNow();
  if (remaining <= 0) {
    showWaiting('Decision just closed…');
    return;
  }
  show(`
    <div class="screen center">
      <p class="waiting-msg">Voting in progress</p>
      <p class="d-countdown-large" id="d-countdown"></p>
      <p class="d-hint" style="margin-top:12px">Loading decision…</p>
    </div>
  `);
  const countdown  = document.getElementById('d-countdown')!;
  const windowEnd  = msg.closesAt;
  const t = setInterval(() => {
    const rem = windowEnd - relayNow();
    if (rem <= 0) { clearInterval(t); countdown.textContent = ''; return; }
    countdown.textContent = `${Math.ceil(rem / 1000)}s`;
  }, 100);
}

// In-place tally update (no full re-render)
function updateTallyUI(counts: Record<string, number>) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  for (const [gesture, count] of Object.entries(counts)) {
    const bar   = document.getElementById(`tbar-${gesture}`);
    const label = document.getElementById(`tcount-${gesture}`);
    if (!bar || !label) continue;
    const pct         = total > 0 ? Math.round((count / total) * 100) : 0;
    bar.style.width   = `${pct}%`;
    label.textContent = count > 0 ? String(count) : '';
  }
}

// -- Result screen shown briefly after window_closed (A3)
function showResult(
  chosen:     Action | 'default',
  decisionId: string | null,
  win:        WindowOpenMsg | null,
  stats:      StatsData | null,
) {
  // Human-readable label for room's winning choice
  let chosenLabel: string = chosen;
  if (win) {
    const opt = win.options.find(o => o.gesture === chosen);
    if (opt) chosenLabel = opt.label;
  }

  // Build the "% of rooms" global stats line
  let globalLine = '';
  if (stats && decisionId && stats.decisions[decisionId] && stats.decisions[decisionId].total > 0) {
    const dec = stats.decisions[decisionId];
    // Find top option by pct
    let topGesture = '';
    let topPct     = 0;
    for (const [gesture, data] of Object.entries(dec.options)) {
      if (data.pct > topPct) { topPct = data.pct; topGesture = gesture; }
    }
    if (topGesture) {
      let topLabel: string = topGesture;
      if (win) {
        const opt = win.options.find(o => o.gesture === topGesture);
        if (opt) topLabel = opt.label;
      }
      const roomPart   = chosen !== 'default' ? `Your room chose <strong>${chosenLabel}</strong> · ` : '';
      globalLine = `<p class="result-global">${roomPart}<strong>${Math.round(topPct)}%</strong> of rooms chose <strong>${topLabel}</strong></p>`;
    }
  } else if (chosen !== 'default') {
    globalLine = `<p class="result-global">Your room chose <strong>${chosenLabel}</strong></p>`;
  }

  show(`
    <div class="screen center">
      <p class="result-label">Decision made</p>
      ${globalLine}
      <div class="spinner" style="margin-top:32px"></div>
      <p class="waiting-msg">Now playing…</p>
    </div>
  `);

  // Auto-advance to a plain waiting screen if watching/story_end hasn't arrived yet
  setTimeout(() => {
    if ($app.querySelector('.result-label')) showWaiting('Now playing…');
  }, 4500);
}

// -- Watching
function showWatching(msg: WatchingMsg) {
  show(`
    <div class="screen center">
      <p class="watching-label">Now playing</p>
      <h2 class="watching-ch">${msg.chapterTitle}</h2>
      ${msg.variantTag ? `<p class="watching-path">${msg.variantTag}</p>` : ''}
      <div class="watching-dots"><span></span><span></span><span></span></div>
    </div>
  `);
}

// -- Library
type LibTab = 'journey' | 'votes' | 'whatif';

function showLibrary(tab: LibTab = 'journey') {
  show(`
    <nav class="lib-nav">
      <button class="lib-tab${tab === 'journey' ? ' active' : ''}" data-tab="journey">Journey</button>
      <button class="lib-tab${tab === 'votes'   ? ' active' : ''}" data-tab="votes">Votes</button>
      <button class="lib-tab${tab === 'whatif'  ? ' active' : ''}" data-tab="whatif">What if?</button>
    </nav>
    <div class="lib-content" id="lib-content"></div>
  `);

  $app.querySelectorAll<HTMLButtonElement>('.lib-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $app.querySelectorAll('.lib-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderLibTab(btn.dataset['tab'] as LibTab);
    });
  });

  renderLibTab(tab);
}

function renderLibTab(tab: LibTab) {
  const el = document.getElementById('lib-content')!;
  if (!episode || sessionLog.length === 0) {
    el.innerHTML = '<p class="empty-msg">No decisions recorded yet.</p>';
    return;
  }

  if (tab === 'journey') {
    el.innerHTML = sessionLog.map(entry => {
      const ch = episode!.chapters.find(c => c.id === entry.chapter);
      const decisions = entry.decisions.map(d => {
        const def = ch?.decisions.find(dec => dec.id === d.decisionId);
        return `
          <div class="lib-decision">
            <span class="phase-badge ${d.phase}">${d.phase === 'pre' ? 'PRE' : 'LIVE'}</span>
            <span class="lib-prompt">${def?.prompt ?? d.decisionId}</span>
            <span class="lib-chosen">→ ${d.chosen}</span>
          </div>`;
      }).join('');

      const variants = ch?.variants.map(v => {
        const played = v.tag === entry.variantPlayed || v.when === entry.variantPlayed;
        return `<div class="variant-row ${played ? 'played' : 'unplayed'}">${v.tag ?? v.when}${played ? ' · played' : ''}</div>`;
      }).join('') ?? '';

      return `<div class="lib-block"><div class="lib-ch-title">${ch?.title ?? entry.chapter}</div>${decisions}${variants}</div>`;
    }).join('');
  }

  if (tab === 'votes') {
    el.innerHTML = sessionLog.flatMap(entry => {
      const ch = episode!.chapters.find(c => c.id === entry.chapter);
      return entry.decisions.map(d => {
        const def = ch?.decisions.find(dec => dec.id === d.decisionId);
        if (!def) return '';
        const opts = def.options.map(opt => {
          const voters = d.votes.filter(v => v.action === opt.gesture);
          const isWin  = opt.gesture === d.chosen;
          const dots   = voters.map(v =>
            `<div class="vote-dot" style="background:${viewerColors.get(v.viewer) ?? '#888'}"></div>`
          ).join('');
          return `<div class="vote-opt${isWin ? ' winner' : ''}"><div class="vote-label">${opt.label}</div><div class="vote-dots">${dots}</div></div>`;
        }).join('');
        const close = d.margin <= 1 && d.votes.length > 1 ? '<span class="close-badge">Close call</span>' : '';
        return `<div class="lib-block"><div class="votes-prompt">${def.prompt ?? def.id}</div>${close}<div class="votes-options">${opts}</div></div>`;
      });
    }).join('');
  }

  if (tab === 'whatif') {
    el.innerHTML = `<p class="whatif-hint">Tap an option you didn't choose to see what would have happened.</p>`
      + sessionLog.flatMap(entry => {
        const ch = episode!.chapters.find(c => c.id === entry.chapter);
        return entry.decisions.map(d => {
          const def = ch?.decisions.find(dec => dec.id === d.decisionId);
          if (!def) return '';
          const opts = def.options.map((opt, idx) => {
            const chosen = opt.gesture === d.chosen;
            return `<div class="wi-opt${chosen ? ' chosen' : ''}" data-at="${entry.chapter}" data-idx="${idx}" data-did="${d.decisionId}">${opt.label}${chosen ? ' · chosen' : ''}</div>`;
          }).join('');
          return `<div class="lib-block"><div class="votes-prompt">${def.prompt ?? def.id}</div>${opts}<div class="wi-result" id="wi-result-${d.decisionId}"></div></div>`;
        });
      }).join('');

    el.querySelectorAll<HTMLElement>('.wi-opt:not(.chosen)').forEach(btn => {
      btn.addEventListener('click', async () => {
        const at     = btn.dataset['at']!;
        const idx    = Number(btn.dataset['idx']);
        const did    = btn.dataset['did']!;
        const result = document.getElementById(`wi-result-${did}`)!;
        result.innerHTML = '<p class="wi-step">loading…</p>';
        try {
          const res  = await fetch(`${relayHost}/api/v1/rooms/${roomCode}/whatif?at=${at}&option=${idx}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ story: episode }),
          });
          const data = await res.json() as { data: { projectedPath: string[] } };
          result.innerHTML = (data.data.projectedPath ?? [])
            .map(step => `<p class="wi-step">→ ${step}</p>`)
            .join('') || '<p class="wi-step">No alternate path.</p>';
        } catch { result.innerHTML = '<p class="wi-step">(error)</p>'; }
      });
    });
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

if (roomCode) {
  showWaiting('Connecting…');
  connect(roomCode);
} else {
  showJoin();
}
