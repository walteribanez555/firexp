package com.example.fire_hack.data.source

import com.example.fire_hack.data.model.Episode
import com.example.fire_hack.data.model.Series
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Reads the series catalog and (legacy) episode graph from the relay HTTP API.
 *
 * The relay wraps every payload as `{ "data": ... }` under `/api/v1`, so both
 * calls unwrap the `data` envelope before decoding.
 */
class SeriesRemoteSource(
    baseUrl: String,
    private val client: OkHttpClient = OkHttpClient()
) {

    private val apiBase = "${baseUrl.trimEnd('/')}/api/v1"
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun fetchSeriesList(): List<Series> = withContext(Dispatchers.IO) {
        val body = get("$apiBase/series")
        val data = json.parseToJsonElement(body).jsonObject["data"]
            ?: return@withContext emptyList()
        json.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(Series.serializer()), data)
    }

    suspend fun fetchEpisode(episodeId: String): Episode = withContext(Dispatchers.IO) {
        val body = get("$apiBase/episodes/$episodeId")
        val data = json.parseToJsonElement(body).jsonObject.getValue("data")
        json.decodeFromJsonElement(Episode.serializer(), data)
    }

    private fun get(url: String): String =
        client.newCall(Request.Builder().url(url).build()).execute().use { res ->
            res.body?.string() ?: error("Empty response from $url")
        }
}
