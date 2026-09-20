package com.example.fire_hack.data.model

import kotlinx.serialization.Serializable

@Serializable
data class Route(
    val id: String,
    val videoUrl: String,
    val nextEventId: String? = null,
    val isEnding: Boolean = false
)
