package com.example.fire_hack.data.model

import kotlinx.serialization.Serializable

@Serializable
data class Episode(
    val id: String,
    val seriesId: String,
    val number: Int,
    val title: String,
    val questionnaire: List<Question>,
    val routes: Map<String, Route>,
    val events: Map<String, StoryEvent>,
    val defaultInitialRouteId: String
)
