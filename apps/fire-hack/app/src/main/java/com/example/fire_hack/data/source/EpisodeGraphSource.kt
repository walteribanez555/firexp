package com.example.fire_hack.data.source

import android.util.Log
import com.example.fire_hack.data.model.EpisodeGraph
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Fetches the full episode graph (chapters + variants + decisions) the TV needs
 * to run the story autonomously. Unwraps the relay's `{ "data": ... }` envelope.
 */
class EpisodeGraphSource(
    baseUrl: String,
    private val client: OkHttpClient = OkHttpClient(),
) {
    private val apiBase = "${baseUrl.trimEnd('/')}/api/v1"
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun fetch(episodeId: String): EpisodeGraph = withContext(Dispatchers.IO) {
        val url = "$apiBase/episodes/$episodeId"
        Log.i(TAG, "GET $url")
        val body = client.newCall(Request.Builder().url(url).build()).execute().use { res ->
            res.body?.string() ?: error("Empty episode response")
        }
        val data = json.parseToJsonElement(body).jsonObject.getValue("data")
        json.decodeFromJsonElement(EpisodeGraph.serializer(), data)
    }

    companion object { private const val TAG = "EpisodeGraphSrc" }
}
