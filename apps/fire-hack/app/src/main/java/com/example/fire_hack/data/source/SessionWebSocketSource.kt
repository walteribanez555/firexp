package com.example.fire_hack.data.source

import android.util.Log
import com.example.fire_hack.data.model.SessionEvent
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

class SessionWebSocketSource(private val relayBaseUrl: String) {

    private val client = OkHttpClient()
    @Volatile private var activeWs: WebSocket? = null

    fun connect(roomCode: String): Flow<SessionEvent> = callbackFlow {
        val wsUrl = relayBaseUrl
            .replace("http://", "ws://")
            .replace("https://", "wss://")
        // role=tv → the relay does not treat the TV as a voting viewer, and instead
        // broadcasts each phone's `assigned` to us so the lobby shows real viewers.
        val fullUrl = "$wsUrl?room=$roomCode&role=tv"
        Log.i(TAG, "Connecting to $fullUrl")

        val request = Request.Builder().url(fullUrl).build()

        val ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                activeWs = webSocket
                Log.i(TAG, "WS open — room=$roomCode")
                webSocket.send("""{"type":"join","room":"$roomCode"}""")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val type = runCatching { JSONObject(text).getString("type") }.getOrElse { "?" }
                Log.i(TAG, "← $type  raw=${text.take(120)}")
                parseEvent(text)?.let { trySend(it) }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WS failure: ${t.message}")
                activeWs = null
                trySend(SessionEvent.Error(t.message ?: "WebSocket failure"))
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.i(TAG, "WS closed code=$code reason=$reason")
                activeWs = null
                close()
            }
        })

        awaitClose { activeWs = null; ws.close(1000, "flow cancelled") }
    }

    fun send(json: String): Boolean {
        val ok = activeWs?.send(json) == true
        Log.i(TAG, "→ send ok=$ok  ${json.take(100)}")
        return ok
    }

    companion object { private const val TAG = "RelayWS" }

    private fun parseEvent(raw: String): SessionEvent? = try {
        val json = JSONObject(raw)
        when (json.getString("type")) {
            "assigned" -> SessionEvent.Assigned(
                viewer = json.getInt("viewer"),
                color  = json.getString("color"),
            )
            "viewer_left" -> SessionEvent.ViewerLeft(
                viewer = json.getInt("viewer"),
            )
            "episode_start" -> {
                val flagsJson = json.optJSONObject("flags")
                val flags = mutableMapOf<String, Int>()
                flagsJson?.keys()?.forEach { key ->
                    flags[key] = flagsJson.optInt(key, 0)
                }
                SessionEvent.EpisodeStart(
                    chapterId = json.getString("chapterId"),
                    flags     = flags,
                )
            }
            "window_open" -> {
                val optsArray = json.getJSONArray("options")
                val options = (0 until optsArray.length()).map { i ->
                    val opt = optsArray.getJSONObject(i)
                    SessionEvent.WindowOpen.DecisionOption(
                        gesture = opt.getString("gesture"),
                        label   = opt.getString("label"),
                    )
                }
                SessionEvent.WindowOpen(
                    decisionId     = json.getString("decisionId"),
                    phase          = json.optString("phase", "pre"),
                    chapterTitle   = json.optString("chapterTitle", ""),
                    prompt         = json.optString("prompt", ""),
                    options        = options,
                    duration       = json.optLong("duration", 6000L),
                    questionIndex  = json.optInt("questionIndex", 1),
                    totalQuestions = json.optInt("totalQuestions", 1),
                )
            }
            "window_closed" -> SessionEvent.WindowClosed(
                chosen = json.optString("chosen", "default"),
            )
            "watching" -> SessionEvent.Watching(
                chapterId    = json.optString("chapterId", ""),
                chapterTitle = json.optString("chapterTitle", ""),
                variantTag   = json.optString("variantTag", ""),
            )
            "vote" -> SessionEvent.Vote(
                viewer     = json.optInt("viewer", 0),
                decisionId = json.optString("decisionId", ""),
                action     = json.optString("action", ""),
            )
            "story_end" -> SessionEvent.StoryEnd
            else -> null
        }
    } catch (e: Exception) {
        null
    }
}
