package com.example.fire_hack.data.model

import kotlinx.serialization.Serializable

@Serializable
data class Series(
    val id: String,
    val title: String,
    val description: String,
    val thumbnailUrl: String,
    val episodes: List<EpisodeSummary>
)

@Serializable
data class EpisodeSummary(
    val id: String,
    val number: Int,
    val title: String,
    val thumbnailUrl: String
)
