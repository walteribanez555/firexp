package com.example.fire_hack.data.model

import kotlinx.serialization.Serializable

@Serializable
data class StoryGraph(
    val startChapterId: String,
    val chapters: Map<String, Chapter>
)
