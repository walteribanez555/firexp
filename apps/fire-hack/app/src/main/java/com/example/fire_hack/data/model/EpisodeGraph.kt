package com.example.fire_hack.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Full episode as served by the relay (`GET /api/v1/episodes/:id`).
 *
 * Mirrors the relay's `EpisodeDetail` / `StoryGraph`: a list of chapters, each
 * with flag-gated video variants and interactive decisions. This is the graph
 * the TV [com.example.fire_hack.domain.StoryEngine] plays autonomously.
 *
 * `ignoreUnknownKeys` on the decoder means the `questionnaire` field (handled by
 * the phone, not the TV) can be omitted here without breaking deserialization.
 */
@Serializable
data class EpisodeGraph(
    val id: String,
    val seriesId: String = "",
    val number: Int = 0,
    val video: String = "",
    val title: String = "",
    val flags: Map<String, Int> = emptyMap(),
    val chapters: List<GraphChapter> = emptyList(),
)

@Serializable
data class GraphChapter(
    val id: String,
    val title: String = "",
    val decisions: List<GraphDecision> = emptyList(),
    val variants: List<GraphVariant> = emptyList(),
)

@Serializable
data class GraphDecision(
    val id: String,
    val phase: String = "pre",
    /** For `phase == "during"`: seconds from the start of the chapter's variant. */
    val at: Double? = null,
    /** Decision window duration in milliseconds. */
    val window: Long = 6000L,
    val prompt: String? = null,
    val options: List<GraphOption> = emptyList(),
    val default: GraphDefault = GraphDefault(),
)

@Serializable
data class GraphOption(
    val gesture: String,
    val label: String,
    /** Flag mutations applied if this option wins (values are "+1"/"-1" or numbers). */
    val set: Map<String, JsonElement> = emptyMap(),
)

@Serializable
data class GraphDefault(
    val set: Map<String, JsonElement> = emptyMap(),
)

@Serializable
data class GraphVariant(
    /** Start time in the concatenated video file (seconds). */
    @SerialName("in") val inSec: Double = 0.0,
    /** End time in the concatenated video file (seconds). */
    val out: Double = 0.0,
    /** Condition evaluated against current flags. Last variant must be "default". */
    @SerialName("when") val condition: String = "default",
    val tag: String? = null,
    val videoUrl: String? = null,
)
