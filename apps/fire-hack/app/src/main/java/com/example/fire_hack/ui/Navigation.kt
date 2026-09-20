package com.example.fire_hack.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.tv.material3.*
import com.example.fire_hack.Config
import com.example.fire_hack.deeplink.DeepLink
import com.example.fire_hack.recommendations.RecommendationsPublisher
import com.example.fire_hack.data.model.EpisodeSummary
import com.example.fire_hack.data.model.Series
import com.example.fire_hack.data.model.SessionEvent
import com.example.fire_hack.data.repository.PlayerRepository
import com.example.fire_hack.data.source.EpisodeGraphSource
import com.example.fire_hack.data.source.PlayerSource
import com.example.fire_hack.data.source.SeriesRemoteSource
import com.example.fire_hack.data.source.SessionWebSocketSource
import com.example.fire_hack.domain.StoryEngine
import com.example.fire_hack.ui.component.ChapterTransition
import com.example.fire_hack.ui.component.DecisionOverlay
import com.example.fire_hack.ui.component.QrCodeView
import com.example.fire_hack.ui.screen.EndingScreen
import com.example.fire_hack.ui.screen.LobbyScreen
import com.example.fire_hack.ui.screen.LobbyViewer
import com.example.fire_hack.ui.screen.SeriesCatalogScreen
import com.example.fire_hack.ui.screen.SplashScreen
import com.example.fire_hack.ui.theme.Firexp
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

// ── App screen state machine ──────────────────────────────────────────────────

private sealed class AppScreen {
    data object Loading : AppScreen()
    data class Catalog(val series: List<Series>) : AppScreen()
    data class Connection(val series: Series, val episode: EpisodeSummary, val roomCode: String) : AppScreen()
    data class Lobby(val series: Series, val episode: EpisodeSummary, val roomCode: String) : AppScreen()
    data class Playing(
        val chapterTitle:    String,
        val variantTag:      String,
        val prompt:          String,
        val decisionVisible: Boolean,
        val decisionOptions: List<String>,
        val remainingMs:     Long,
        val decisionId:      String,
        // option gesture-key → label for the active window (needed for vote resolution)
        val optionGestures:  Map<String, String> = emptyMap(),
        // set briefly after a window resolves to mask the seek to the chosen branch
        val transitionBranch: String? = null,
    ) : AppScreen()
    data class Ended(val chapterId: String) : AppScreen()
}

// ── Entry point ───────────────────────────────────────────────────────────────

@OptIn(ExperimentalTvMaterial3Api::class, UnstableApi::class)
@Composable
fun AppNavigation(
    // A pending deep link (firexp://episode/<id>) parsed by MainActivity. When set,
    // the app jumps straight into that episode's room lobby once the catalog loads,
    // bypassing the catalog screen. Null in the normal launcher flow.
    deepLink: DeepLink? = null,
    onDeepLinkConsumed: () -> Unit = {},
) {
    var screen by remember { mutableStateOf<AppScreen>(AppScreen.Loading) }
    val wsSource = remember { SessionWebSocketSource(Config.RELAY_HOST) }
    // viewer → gesture for the active decision window
    val votes = remember { mutableStateOf<Map<Int, String>>(emptyMap()) }
    val windowEndMs = remember { mutableStateOf(0L) }
    // viewer → assigned color, populated as phones join (used by the lobby)
    val connectedViewers = remember { mutableStateOf<Map<Int, String>>(emptyMap()) }
    // WS stays alive from Connection onward
    val activeRoom = remember { mutableStateOf<String?>(null) }
    // episode selected in the catalog — needed to fetch the graph the engine runs
    val activeEpisodeId = remember { mutableStateOf<String?>(null) }
    // set on episode_start; keys the engine LaunchedEffect below
    val pendingStart = remember { mutableStateOf<SessionEvent.EpisodeStart?>(null) }
    // real catalog fetched from the backend — NO mock fallback
    val catalog = remember { mutableStateOf<List<Series>>(emptyList()) }

    // Latest catalog + deep link captured for use inside LaunchedEffect blocks.
    val context = LocalContext.current

    // Enter a room for the given series/episode (create room code + open the WS,
    // land on the Connection/QR screen that phones scan to join). Shared by both
    // the catalog tap and an inbound deep link.
    fun enterRoom(series: Series, episode: EpisodeSummary) {
        val code = generateRoomCode()
        screen = AppScreen.Connection(series, episode, code)
        activeRoom.value = code
        activeEpisodeId.value = episode.id
    }

    val playerRepo = remember { PlayerRepository(PlayerSource(context)) }
    val playProgress = remember { mutableStateOf(0f) }
    DisposableEffect(Unit) { onDispose { playerRepo.release() } }

    // ── Fetch series on startup ───────────────────────────────────────────────
    LaunchedEffect(Unit) {
        val series = try {
            withContext(Dispatchers.IO) { SeriesRemoteSource(Config.RELAY_HOST).fetchSeriesList() }
        } catch (e: Exception) {
            Log.e("AppNav", "Series fetch failed: ${e.message}")
            emptyList()
        }
        catalog.value = series
        screen = AppScreen.Catalog(series)
    }

    // ── Deep link → jump straight into the episode's room lobby ────────────────
    // Fires when MainActivity delivers a firexp://episode/<id> intent (cold start
    // or onNewIntent). We resolve the episode against the catalog (fetching it if
    // the launch beat the startup fetch) and enter its room, bypassing the catalog.
    LaunchedEffect(deepLink) {
        val link = deepLink ?: return@LaunchedEffect
        Log.i("AppNav", "Handling deep link: $link")

        // Make sure we have a catalog to resolve against.
        var series = catalog.value
        if (series.isEmpty()) {
            series = try {
                withContext(Dispatchers.IO) { SeriesRemoteSource(Config.RELAY_HOST).fetchSeriesList() }
            } catch (e: Exception) {
                Log.e("AppNav", "Deep-link series fetch failed: ${e.message}")
                emptyList()
            }
            if (series.isNotEmpty()) catalog.value = series
        }

        val match = series.firstNotNullOfOrNull { s ->
            s.episodes.firstOrNull { it.id == link.episodeId }?.let { ep -> s to ep }
        }

        if (match != null) {
            val (s, ep) = match
            Log.i("AppNav", "Deep link resolved to series=${s.id} episode=${ep.id} → entering room")
            enterRoom(s, ep)
        } else {
            // Unknown episode id — fall back to the catalog so the app is never stuck.
            Log.w("AppNav", "Deep link episode '${link.episodeId}' not found in catalog; showing catalog")
            if (screen is AppScreen.Loading) screen = AppScreen.Catalog(series)
        }
        onDeepLinkConsumed()
    }

    // ── WS event handler ──────────────────────────────────────────────────────
    LaunchedEffect(activeRoom.value) {
        val room = activeRoom.value ?: return@LaunchedEffect
        Log.i("AppNav", "Starting WS collection for room=$room")
        wsSource.connect(room).collect { event ->
            Log.i("AppNav", "Event received: ${event::class.simpleName}")
            when (event) {
                is SessionEvent.Assigned -> {
                    Log.i("AppNav", "Assigned viewer=${event.viewer}")
                    connectedViewers.value = connectedViewers.value + (event.viewer to event.color)
                    // first real phone to join moves the TV into the lobby
                    (screen as? AppScreen.Connection)?.let {
                        screen = AppScreen.Lobby(it.series, it.episode, it.roomCode)
                    }
                }

                is SessionEvent.ViewerLeft -> {
                    Log.i("AppNav", "ViewerLeft viewer=${event.viewer}")
                    connectedViewers.value = connectedViewers.value - event.viewer
                }

                is SessionEvent.EpisodeStart -> {
                    // The TV becomes the director: hand off to StoryEngine (below).
                    Log.i("AppNav", "EpisodeStart chapterId=${event.chapterId} flags=${event.flags}")
                    votes.value = emptyMap()
                    pendingStart.value = event
                }

                is SessionEvent.Watching -> {
                    val current = screen as? AppScreen.Playing
                    screen = AppScreen.Playing(
                        chapterTitle    = event.chapterTitle,
                        variantTag      = event.variantTag,
                        prompt          = current?.prompt ?: "",
                        decisionVisible = current?.decisionVisible ?: false,
                        decisionOptions = current?.decisionOptions ?: emptyList(),
                        remainingMs     = current?.remainingMs ?: 0L,
                        decisionId      = current?.decisionId ?: "",
                        optionGestures  = current?.optionGestures ?: emptyMap(),
                        transitionBranch = current?.transitionBranch,
                    )
                }

                is SessionEvent.WindowOpen -> {
                    votes.value = emptyMap()
                    windowEndMs.value = System.currentTimeMillis() + event.duration
                    val current = screen as? AppScreen.Playing
                    screen = AppScreen.Playing(
                        chapterTitle    = event.chapterTitle.ifEmpty { current?.chapterTitle ?: "" },
                        variantTag      = current?.variantTag ?: "",
                        prompt          = event.prompt,
                        decisionVisible = true,
                        decisionOptions = event.options.map { it.label },
                        remainingMs     = event.duration,
                        decisionId      = event.decisionId,
                        optionGestures  = event.options.associate { it.gesture to it.label },
                    )
                }

                is SessionEvent.WindowClosed -> {
                    windowEndMs.value = 0L
                    val current = screen as? AppScreen.Playing ?: return@collect
                    val label = current.optionGestures[event.chosen] ?: event.chosen
                    screen = current.copy(
                        decisionVisible = false, decisionOptions = emptyList(),
                        remainingMs = 0, optionGestures = emptyMap(),
                        transitionBranch = label,
                    )
                    votes.value = emptyMap()
                }

                is SessionEvent.Vote -> {
                    val current = screen as? AppScreen.Playing ?: return@collect
                    if (event.decisionId == current.decisionId) {
                        votes.value = votes.value + (event.viewer to event.action)
                    }
                }

                is SessionEvent.StoryEnd -> {
                    val current = screen as? AppScreen.Playing
                    screen = AppScreen.Ended(current?.chapterTitle ?: "fin")
                }

                is SessionEvent.Error -> Log.e("AppNav", "WS error: ${event.message}")
            }
        }
    }

    // ── Story engine ──────────────────────────────────────────────────────────
    // On episode_start the TV drives the whole interactive loop from the episode
    // graph: it opens decision windows, tallies the votes collected above, applies
    // flag mutations, picks the next variant, and emits watching/window_closed/
    // log_entry/story_end. See StoryEngine.
    LaunchedEffect(pendingStart.value) {
        val start = pendingStart.value ?: return@LaunchedEffect
        val episodeId = activeEpisodeId.value ?: "episode1"

        val graph = try {
            withContext(Dispatchers.IO) { EpisodeGraphSource(Config.RELAY_HOST).fetch(episodeId) }
        } catch (e: Exception) {
            Log.e("AppNav", "Episode graph fetch failed: ${e.message}")
            null
        }

        if (graph == null || graph.chapters.isEmpty()) {
            // No graph available — show a minimal playing state so the room isn't stuck.
            screen = AppScreen.Playing("Chapter ${start.chapterId}", "", "", false, emptyList(), 0L, "")
            return@LaunchedEffect
        }

        // ── Fallback state (updated every onEnter call, read by the error handler) ──
        // When a clip fails, we try the next candidate URL from the same chapter so the
        // screen never stays black for more than ~1 s. The engine's delay-based timeline
        // keeps advancing regardless — we never block it.
        var chapterCallIdx = 0          // tracks which chapter the engine is currently in
        var chapterFallbackUrls = emptyList<String>()  // remaining URLs to try on error
        var chapterSeekMs = 0L          // seekMs passed by onEnter — reused for fallbacks

        // Wire the error handler once, before the engine starts.
        playerRepo.onError = { failedUrl ->
            Log.w("AppNav", "onError: failed url=$failedUrl, fallbacks remaining=${chapterFallbackUrls.size}")
            val next = chapterFallbackUrls.firstOrNull()
            chapterFallbackUrls = chapterFallbackUrls.drop(1)
            if (next != null) {
                Log.i("AppNav", "Fallback → loading $next (seekMs=$chapterSeekMs)")
                playerRepo.load(next)
                playerRepo.seekTo(chapterSeekMs)
                playerRepo.play()
            } else {
                // No more fallbacks for this chapter — clear any partial state so the
                // gradient background shows cleanly while the engine timeline finishes.
                Log.w("AppNav", "No fallbacks left for chapter; waiting for engine to advance.")
            }
        }

        StoryEngine(
            graph      = graph,
            startFlags = start.flags,
            send       = { wsSource.send(it) },
            votes      = { votes.value },
            clearVotes = { votes.value = emptyMap() },
            onEnter    = { videoUrl, seekMs ->
                // Relative "/videos/..." paths are self-hosted by the relay → resolve
                // against RELAY_HOST so they work on the emulator (10.0.2.2) and on a
                // real device (LAN IP) without hardcoding a host into the content.
                val resolved = when {
                    videoUrl.isNullOrBlank()  -> null
                    videoUrl.startsWith("/")  -> Config.RELAY_HOST + videoUrl
                    else                      -> videoUrl
                }

                // Build the fallback queue: all OTHER variant URLs for this chapter,
                // resolved the same way, excluding the URL we're about to load.
                // chapterCallIdx corresponds to graph.chapters index (0-based).
                val chapter = graph.chapters.getOrNull(chapterCallIdx)
                chapterSeekMs = seekMs
                chapterFallbackUrls = chapter
                    ?.variants
                    ?.mapNotNull { v -> v.videoUrl?.takeIf { it.isNotBlank() } }
                    ?.map { u -> if (u.startsWith("/")) Config.RELAY_HOST + u else u }
                    ?.filter { u -> u != resolved }     // exclude the primary we load now
                    ?: emptyList()
                chapterCallIdx++

                if (resolved != null) playerRepo.load(resolved)
                playerRepo.seekTo(seekMs)
                playerRepo.play()
            },
            onPreload  = { urls ->
                // Pre-fetch the next chapter's candidate clips while the current chapter
                // plays so branch transitions are instant. Uses SimpleCache/CacheWriter
                // (already in the dependency graph, works offline). DefaultPreloadManager
                // is available in Media3 1.4.1 but integrating it cleanly would require
                // restructuring the MediaSourceFactory sharing — the CacheWriter approach
                // is already effective and introduces no new dependencies or complexity.
                urls.forEach { u ->
                    playerRepo.preload(if (u.startsWith("/")) Config.RELAY_HOST + u else u)
                }
            },
            // Decisions happen on the phone while the TV keeps playing — never pause the video.
            onSetPaused = { _ -> },
            onProgress  = { fraction -> playProgress.value = fraction },
            onPlaying  = { title, tag ->
                screen = AppScreen.Playing(
                    chapterTitle = title, variantTag = tag, prompt = "",
                    decisionVisible = false, decisionOptions = emptyList(),
                    remainingMs = 0L, decisionId = "",
                )
            },
            onWindow   = { decisionId, _, _, _, _, _ ->
                // The decision UI lives on the phone. The TV shows NO overlay — it keeps
                // playing. We only tag the active decisionId so incoming votes are matched.
                (screen as? AppScreen.Playing)?.let { cur ->
                    if (cur.decisionId != decisionId) {
                        screen = cur.copy(decisionId = decisionId, decisionVisible = false)
                    }
                }
            },
            onTransition = { title, tag, _ ->
                // No on-TV decision banner — cut straight to the resolved branch (seamless
                // thanks to preloading). All decision feedback stays on the phone.
                screen = AppScreen.Playing(
                    chapterTitle = title, variantTag = tag, prompt = "",
                    decisionVisible = false, decisionOptions = emptyList(),
                    remainingMs = 0L, decisionId = "",
                )
            },
            onEnded    = { finalTitle -> screen = AppScreen.Ended(finalTitle) },
        ).run()

        // Clear the error handler when the engine finishes so stale callbacks don't fire.
        playerRepo.onError = null
    }

    // ── Publish Fire TV home-screen recommendations when a story ends ──────────
    // After an ending the room is a natural "continue where you left off" candidate,
    // so we refresh the recommendation row. No-op on non-Fire-TV / when unsupported.
    LaunchedEffect(screen is AppScreen.Ended) {
        if (screen is AppScreen.Ended) {
            withContext(Dispatchers.IO) {
                runCatching {
                    RecommendationsPublisher(context).publish(catalog.value)
                }.onFailure { Log.w("AppNav", "Recommendation publish failed: ${it.message}") }
            }
        }
    }

    fun backToCatalog() {
        screen = AppScreen.Catalog(catalog.value)
        activeRoom.value = null
        activeEpisodeId.value = null
        pendingStart.value = null
        connectedViewers.value = emptyMap()
        votes.value = emptyMap()
    }

    // ── Screens ───────────────────────────────────────────────────────────────

    when (val s = screen) {

        // 1. Splash / Loading
        AppScreen.Loading -> SplashScreen()

        // 2. Series catalog
        is AppScreen.Catalog -> {
            SeriesCatalogScreen(
                series = s.series,
                onEpisodeSelected = { series, episode -> enterRoom(series, episode) },
            )
        }

        // 3. QR + connection
        is AppScreen.Connection -> {
            BackHandler { backToCatalog() }
            ConnectionScreen(
                series    = s.series,
                episode   = s.episode,
                roomCode  = s.roomCode,
                relayHost = Config.PHONE_HOST,
                connectedCount = connectedViewers.value.size,
            )
        }

        // 4. Lobby / questionnaire
        is AppScreen.Lobby -> {
            BackHandler { backToCatalog() }
            LobbyScreen(
                seriesTitle  = s.series.title,
                episodeTitle = s.episode.title,
                roomCode     = s.roomCode,
                viewers      = connectedViewers.value.entries
                    .sortedBy { it.key }
                    .map { (viewer, color) ->
                        LobbyViewer(
                            initial = viewer.toString(),
                            name    = "Viewer $viewer",
                            color   = parseHexColor(color),
                            // TODO: drive from real quiz-progress events once the relay sends them
                            answered = 0,
                            total    = 5,
                        )
                    },
            )
        }

        // 5. Playing (+ decision overlay + chapter transition)
        is AppScreen.Playing -> {
            val labelVoteCounts = votes.value.entries
                .groupBy  { s.optionGestures[it.value] ?: it.value }
                .mapValues { it.value.size }
            PlayingContent(
                player          = playerRepo.getPlayer(),
                progress        = playProgress.value,
                chapterTitle    = s.chapterTitle,
                variantTag      = s.variantTag,
                prompt          = s.prompt,
                decisionVisible = s.decisionVisible,
                decisionOptions = s.decisionOptions,
                voteCounts      = labelVoteCounts,
                remainingMs     = s.remainingMs,
                transitionBranch = s.transitionBranch,
                onDecisionMade  = {
                    screen = s.copy(decisionVisible = false, decisionOptions = emptyList())
                },
            )
        }

        // 6. Ending
        is AppScreen.Ended -> {
            EndingScreen(
                finalChapterId  = s.chapterId,
                onRestart       = { backToCatalog() },
                onBackToCatalog = { backToCatalog() },
            )
        }
    }
}

// ── Private screens ───────────────────────────────────────────────────────────

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ConnectionScreen(
    series:         Series,
    episode:        EpisodeSummary,
    roomCode:       String,
    relayHost:      String,
    connectedCount: Int,
) {
    val qrUrl = "$relayHost/phone/index.html?room=$roomCode&episode=${episode.id}"

    Column(Modifier.fillMaxSize().background(Firexp.bg)) {
        Text(
            text = "Catalog › ${series.title} › ${episode.title}",
            fontSize = 14.sp,
            color = Firexp.faint,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier.padding(start = 56.dp, top = 32.dp),
        )
        Row(
            modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 100.dp),
            horizontalArrangement = Arrangement.spacedBy(120.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(22.dp),
            ) {
                Text("CONNECT YOUR PHONE", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Firexp.accent2)
                Text("Scan the code or open\nfirexp.tv/phone", fontSize = 38.sp, fontWeight = FontWeight.ExtraBold, color = Color.White, lineHeight = 44.sp)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text(roomCode, fontSize = 44.sp, fontWeight = FontWeight.ExtraBold, color = Firexp.text, fontFamily = FontFamily.Monospace)
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Firexp.surface)
                            .padding(horizontal = 10.dp, vertical = 6.dp)
                    ) { Text("ROOM CODE", fontSize = 13.sp, color = Firexp.faint) }
                }
                Text(
                    text = if (connectedCount == 0) "Waiting for viewers to join…" else "Viewers connecting…",
                    fontSize = 16.sp, color = Firexp.dim,
                    modifier = Modifier.padding(top = 24.dp),
                )
                Text("$connectedCount connected", fontSize = 14.sp, color = Firexp.faint)
            }

            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Box(
                    Modifier
                        .size(280.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(Color.White)
                        .padding(20.dp),
                ) {
                    QrCodeView(url = qrUrl, size = 240.dp)
                }
                Text(qrUrl, fontSize = 13.sp, color = Firexp.faint)
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun PlayingContent(
    player:           ExoPlayer,
    progress:         Float,
    chapterTitle:     String,
    variantTag:       String,
    prompt:           String,
    decisionVisible:  Boolean,
    decisionOptions:  List<String>,
    voteCounts:       Map<String, Int>,
    remainingMs:      Long,
    transitionBranch: String?,
    onDecisionMade:   () -> Unit,
) {
    Box(
        Modifier
            .fillMaxSize()
            .background(
                androidx.compose.ui.graphics.Brush.linearGradient(
                    listOf(Color(0xFF1C1310), Color(0xFF100B0A), Color(0xFF0C0908))
                )
            )
    ) {
        // Real video surface — ExoPlayer. Falls back to the gradient when the
        // source can't play (e.g. placeholder CDN URLs); the story still runs.
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    this.player = player
                    useController = false
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        // Clean playback surface: only the video. Chapter chip / path / scrubber removed —
        // all narrative state (decisions, progress) lives on the phone.

        if (decisionVisible && decisionOptions.isNotEmpty()) {
            DecisionOverlay(
                remainingMs = remainingMs,
                totalMs     = 8000L,
                prompt      = prompt,
                options     = decisionOptions,
                voteCounts  = voteCounts,
                onOptionSelected = onDecisionMade,
            )
        }

        ChapterTransition(visible = transitionBranch != null, branchLabel = transitionBranch)
    }
}

/** Timeline reflecting the engine's playback progress within the current chapter. */
@Composable
private fun Scrubber(progress: Float) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(5.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(Color(0x2EFFFFFF))
    ) {
        Box(
            Modifier
                .fillMaxWidth(progress.coerceIn(0f, 1f))
                .fillMaxHeight()
                .clip(RoundedCornerShape(3.dp))
                .background(Firexp.accent)
        )
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

private fun generateRoomCode(): String {
    val chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return (1..4).map { chars.random() }.joinToString("")
}

private fun parseHexColor(hex: String): Color =
    runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(Firexp.accent)

// Returns the gesture key of the winning vote, or "default" on a tie or no votes.
private fun resolveWinner(voteMap: Map<Int, String>, gestureToLabel: Map<String, String>): String {
    if (voteMap.isEmpty()) return gestureToLabel.keys.firstOrNull() ?: "default"
    val counts = voteMap.values.groupingBy { it }.eachCount()
    val max    = counts.values.maxOrNull() ?: 0
    val top    = counts.filter { it.value == max }.keys
    return if (top.size == 1) top.first() else gestureToLabel.keys.firstOrNull() ?: "default"
}
