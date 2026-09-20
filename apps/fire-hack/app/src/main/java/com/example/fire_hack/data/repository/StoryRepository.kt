package com.example.fire_hack.data.repository

import com.example.fire_hack.data.model.Chapter
import com.example.fire_hack.data.model.StoryGraph
import com.example.fire_hack.data.source.StoryAssetSource

class StoryRepository(private val source: StoryAssetSource) {

    private var graph: StoryGraph? = null

    fun getGraph(): StoryGraph {
        if (graph == null) graph = source.load()
        return graph!!
    }

    fun getChapter(id: String): Chapter? = getGraph().chapters[id]

    fun getStartChapter(): Chapter? = getChapter(getGraph().startChapterId)
}
