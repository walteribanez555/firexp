package com.example.fire_hack.data.model

import kotlinx.serialization.Serializable

@Serializable
data class Chapter(
    val id: String,
    val videoIn: Long,
    val videoOut: Long,
    val decisionAt: Long? = null,
    val decisionWindow: Long = 5000L,
    val options: List<Decision> = emptyList(),
    val defaultNextId: String? = null
)
