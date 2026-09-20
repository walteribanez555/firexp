package com.example.fire_hack.data.model

import kotlinx.serialization.Serializable

@Serializable
data class Question(
    val id: String,
    val text: String,
    val options: List<QuestionOption>
)

@Serializable
data class QuestionOption(
    val id: String,
    val label: String
)
