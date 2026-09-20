package com.example.fire_hack.data.source

import android.content.Context
import com.example.fire_hack.data.model.StoryGraph
import kotlinx.serialization.json.Json

class StoryAssetSource(private val context: Context) {

    private val json = Json { ignoreUnknownKeys = true }

    fun load(): StoryGraph {
        val raw = context.assets.open("story_graph.json").bufferedReader().readText()
        return json.decodeFromString(raw)
    }
}
