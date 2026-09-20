package com.example.fire_hack.data.model

import kotlinx.serialization.Serializable

@Serializable
data class StoryEvent(
    val id: String,
    val options: List<EventOption>,
    val defaultRouteId: String,
    val decisionWindowMs: Long = 5000L
)

@Serializable
data class EventOption(
    val id: String,
    val label: String,
    val nextRouteId: String
)
