package com.example.fire_hack.data.model

import kotlinx.serialization.Serializable

@Serializable
data class Decision(
    val id: String,
    val label: String,
    val nextChapterId: String
)
