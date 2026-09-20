package com.example.fire_hack.domain

import android.util.Log
import com.example.fire_hack.data.model.EpisodeGraph
import com.example.fire_hack.data.model.GraphChapter
import com.example.fire_hack.data.model.GraphDecision
import com.example.fire_hack.data.model.GraphOption
import com.example.fire_hack.data.model.GraphVariant
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import org.json.JSONArray
import org.json.JSONObject

/**
 * The autonomous "brain" of the TV app.
 *
 * On `episode_start` the TV becomes the director of the experience: it walks the
 * episode graph on a timeline, and for every chapter it
 *
 *  1. resolves the video variant from the accumulated flags,
 *  2. broadcasts `watching` so phones show the current path,
 *  3. opens each decision as a `window_open`, tallies the votes that arrive over
 *     WebSocket, and on timeout resolves the winner, applies its flag mutations,
 *     broadcasts `window_closed`, and logs the decision (`log_entry`),
 *  4. advances to the next chapter (whose variant now reflects the new flags),
 *
 * finishing with `story_end`. The relay is a dumb forwarder, so the TV is the
 * only place this orchestration can live.
 *
 * Playback timing is derived from the variant's `in`/`out` seconds. Real video
 * (ExoPlayer via [com.example.fire_hack.data.repository.PlayerRepository]) plugs
 * into [onPlaying]/[onEnter] without changing this control flow.
 */
class StoryEngine(
    private val graph: EpisodeGraph,
    startFlags: Map<String, Int>,
    private val send: (String) -> Unit,
    private val votes: () -> Map<Int, String>,
    private val clearVotes: () -> Unit,
    /** Load/seek/play the variant's video (no-op if the player has no real source). */
    private val onEnter: (videoUrl: String?, seekMs: Long) -> Unit,
    /** Pre-fetch upcoming clips (next chapter's candidate variants) for seamless transitions. */
    private val onPreload: (videoUrls: List<String>) -> Unit,
    /** Pause the video while a decision is open, resume after. */
    private val onSetPaused: (Boolean) -> Unit,
    /** Playback progress within the current chapter (0..1) for the scrubber. */
    private val onProgress: (fraction: Float) -> Unit,
    /** Chapter is now playing a variant. */
    private val onPlaying: (chapterTitle: String, variantTag: String) -> Unit,
    /** A decision window is open; called on every tick with the remaining time. */
    private val onWindow: (
        decisionId: String,
        chapterTitle: String,
        prompt: String,
        options: List<Pair<String, String>>,
        remainingMs: Long,
        totalMs: Long,
    ) -> Unit,
    /** A window resolved; briefly surfaces the chosen branch. */
    private val onTransition: (chapterTitle: String, variantTag: String, chosenLabel: String) -> Unit,
    /** The story finished. */
    private val onEnded: (finalChapterTitle: String) -> Unit,
) {
    private val flags: MutableMap<String, Int> =
        HashMap<String, Int>().apply {
            graph.flags.forEach { (k, v) -> put(k, v) }
            startFlags.forEach { (k, v) -> put(k, v) }   // questionnaire flags win
        }

    suspend fun run() {
        Log.i(TAG, "Engine start — ${graph.chapters.size} chapters, flags=$flags")
        for ((i, chapter) in graph.chapters.withIndex()) {
            playChapter(chapter, graph.chapters.getOrNull(i + 1))
        }
        send(json("story_end"))
        onEnded(graph.chapters.lastOrNull()?.title ?: "The End")
        Log.i(TAG, "Engine done")
    }

    private suspend fun playChapter(chapter: GraphChapter, next: GraphChapter?) {
        val pre    = chapter.decisions.filter { it.phase == "pre" }
        val during = chapter.decisions.filter { it.phase == "during" }
            .sortedBy { it.at ?: 0.0 }
            .toMutableList()

        // Give pre-decisions a chapter context, then let them gate this chapter's variant.
        onPlaying(chapter.title, "")
        pre.forEachIndexed { i, dec -> runDecision(chapter, "", dec, i + 1, pre.size) }

        val variant   = pickVariant(chapter)
        val tag       = variant?.tag ?: variant?.condition.orEmpty()
        val durationMs = variant
            ?.let { ((it.out - it.inSec) * 1000).toLong().coerceAtLeast(0L) }
            ?: DEFAULT_CHAPTER_MS
        // Per-variant file → play from 0; single concatenated file → seek to `in`.
        val hasUrl = !variant?.videoUrl.isNullOrBlank()
        val seekMs = if (hasUrl) 0L else ((variant?.inSec ?: 0.0) * 1000).toLong()
        // `at` in ChapterDecision is seconds from start of file. When the chapter has a
        // non-zero `in` offset (single-file mode), subtract it to get a chapter-relative
        // timestamp.  For per-variant files the offset is always 0, so the subtraction
        // is a no-op in that case too.
        val chapterOffsetMs = if (hasUrl) 0L else ((variant?.inSec ?: 0.0) * 1000).toLong()

        onEnter(variant?.videoUrl ?: graph.video.ifBlank { null }, seekMs)
        onPlaying(chapter.title, tag)
        // Pre-fetch the next chapter's candidate clips while this one plays → seamless branch cuts.
        next?.let { n -> onPreload(n.variants.mapNotNull { it.videoUrl }) }
        send(watchingJson(chapter.id, chapter.title, tag))
        Log.i(TAG, "Chapter ${chapter.id} → variant='$tag' duration=${durationMs}ms url=$hasUrl offset=${chapterOffsetMs}ms")

        // Walk the chapter timeline, firing during-decisions at their timestamps and
        // reporting progress every tick so the scrubber advances with or without video.
        var elapsed = 0L
        onProgress(0f)
        while (elapsed < durationMs) {
            while (during.isNotEmpty() &&
                   ((during.first().at ?: 0.0) * 1000).toLong() - chapterOffsetMs <= elapsed) {
                val dec = during.removeAt(0)
                onSetPaused(true)
                runDecision(chapter, tag, dec, 1, 1)
                onSetPaused(false)
            }
            delay(TICK_MS)
            elapsed += TICK_MS
            onProgress((elapsed.toFloat() / durationMs).coerceIn(0f, 1f))
        }
        // Any decisions scheduled at or beyond the end of the chapter.
        while (during.isNotEmpty()) {
            val dec = during.removeAt(0)
            onSetPaused(true)
            runDecision(chapter, tag, dec, 1, 1)
            onSetPaused(false)
        }
        onProgress(1f)
    }

    private suspend fun runDecision(
        chapter: GraphChapter,
        variantTag: String,
        dec: GraphDecision,
        index: Int,
        total: Int,
    ) {
        if (dec.options.isEmpty()) return
        clearVotes()

        val optionPairs = dec.options.map { it.gesture to it.label }
        val windowMs    = dec.window.coerceAtLeast(1000L)
        val endAt       = System.currentTimeMillis() + windowMs

        send(windowOpenJson(chapter, dec, index, total))
        Log.i(TAG, "window_open ${dec.id} (${dec.phase}) — ${windowMs}ms")

        while (true) {
            val remaining = endAt - System.currentTimeMillis()
            if (remaining <= 0) break
            onWindow(dec.id, chapter.title, dec.prompt.orEmpty(), optionPairs, remaining, windowMs)
            delay(TICK_MS)
        }

        val tally  = votes()
        val winner = resolveWinner(tally, dec.options)
        val chosen = dec.options.firstOrNull { it.gesture == winner }
        applyFlags(chosen?.set ?: dec.default.set)

        send(windowClosedJson(winner))
        send(logEntryJson(chapter, variantTag, dec, tally, winner))
        Log.i(TAG, "window_closed ${dec.id} → $winner  flags=$flags")

        onTransition(chapter.title, variantTag, chosen?.label ?: "…")
        clearVotes()
        delay(TRANSITION_MS)
    }

    // ── Flag + variant logic (mirror of relay/rooms.service.ts) ─────────────────

    private fun applyFlags(set: Map<String, JsonElement>) {
        for ((key, elem) in set) {
            val p = elem as? JsonPrimitive ?: continue
            runCatching {
                if (p.isString) flags[key] = (flags[key] ?: 0) + p.content.trim().toInt()  // relative
                else            flags[key] = p.content.toInt()                              // absolute
            }
        }
    }

    private fun pickVariant(chapter: GraphChapter): GraphVariant? =
        chapter.variants.firstOrNull { evaluate(it.condition) }

    private fun evaluate(expr: String): Boolean {
        if (expr.trim() == "default") return true
        return expr.split("&&").all { clause ->
            val m = CONDITION.matchEntire(clause.trim()) ?: return@all false
            val (flag, op, raw) = m.destructured
            val a = flags[flag] ?: 0
            val b = raw.toInt()
            when (op) {
                ">=" -> a >= b
                "<=" -> a <= b
                ">"  -> a > b
                "<"  -> a < b
                else -> a == b
            }
        }
    }

    private fun resolveWinner(tally: Map<Int, String>, options: List<GraphOption>): String {
        if (tally.isEmpty()) return "default"
        val counts = tally.values.groupingBy { it }.eachCount()
        val max    = counts.values.maxOrNull() ?: 0
        val top    = counts.filterValues { it == max }.keys
        val winner = top.singleOrNull() ?: return "default"
        return if (options.any { it.gesture == winner }) winner else "default"
    }

    private fun margin(tally: Map<Int, String>): Int {
        val counts = tally.values.groupingBy { it }.eachCount().values.sortedDescending()
        return when (counts.size) {
            0    -> 0
            1    -> counts[0]
            else -> counts[0] - counts[1]
        }
    }

    // ── Outgoing message builders (org.json → safe escaping) ─────────────────────

    private fun json(type: String) = JSONObject().put("type", type).toString()

    private fun watchingJson(chapterId: String, title: String, tag: String) =
        JSONObject()
            .put("type", "watching")
            .put("chapterId", chapterId)
            .put("chapterTitle", title)
            .put("variantTag", tag)
            .toString()

    private fun windowOpenJson(chapter: GraphChapter, dec: GraphDecision, index: Int, total: Int): String {
        val options = JSONArray()
        dec.options.forEach {
            options.put(JSONObject().put("gesture", it.gesture).put("label", it.label))
        }
        return JSONObject()
            .put("type", "window_open")
            .put("decisionId", dec.id)
            .put("phase", dec.phase)
            .put("chapterTitle", chapter.title)
            .put("prompt", dec.prompt ?: "")
            .put("options", options)
            .put("duration", dec.window.coerceAtLeast(1000L))
            .put("questionIndex", index)
            .put("totalQuestions", total)
            .toString()
    }

    private fun windowClosedJson(chosen: String) =
        JSONObject().put("type", "window_closed").put("chosen", chosen).toString()

    private fun logEntryJson(
        chapter: GraphChapter,
        variantTag: String,
        dec: GraphDecision,
        tally: Map<Int, String>,
        winner: String,
    ): String {
        val voteArr = JSONArray()
        tally.forEach { (viewer, action) ->
            voteArr.put(JSONObject().put("viewer", viewer).put("action", action))
        }
        val flagsAfter = JSONObject().apply { flags.forEach { (k, v) -> put(k, v) } }
        val decision = JSONObject()
            .put("decisionId", dec.id)
            .put("phase", dec.phase)
            .put("votes", voteArr)
            .put("chosen", winner)
            .put("margin", margin(tally))
            .put("flagsAfter", flagsAfter)
            .put("ts", System.currentTimeMillis())
        return JSONObject()
            .put("type", "log_entry")
            .put("chapter", chapter.id)
            .put("variantPlayed", variantTag)
            .put("decisions", JSONArray().put(decision))
            .toString()
    }

    companion object {
        private const val TAG = "StoryEngine"
        private const val TICK_MS = 200L
        private const val TRANSITION_MS = 1500L
        private const val DEFAULT_CHAPTER_MS = 20_000L
        private val CONDITION = Regex("""^(\w+)\s*(>=|<=|==|>|<)\s*(-?\d+)$""")
    }
}
