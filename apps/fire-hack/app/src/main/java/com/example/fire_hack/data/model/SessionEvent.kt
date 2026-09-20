package com.example.fire_hack.data.model

sealed class SessionEvent {
    // relay → TV: un teléfono se unió (difundido a la sala)
    data class Assigned(val viewer: Int, val color: String) : SessionEvent()

    // relay → TV: un teléfono se desconectó
    data class ViewerLeft(val viewer: Int) : SessionEvent()

    // relay → TV: cuestionario completo, historia puede iniciar
    data class EpisodeStart(val chapterId: String, val flags: Map<String, Int>) : SessionEvent()

    // relay → TV: ventana de decisión abierta por alguien en la sala
    data class WindowOpen(
        val decisionId:     String,
        val phase:          String,
        val chapterTitle:   String,
        val prompt:         String,
        val options:        List<DecisionOption>,
        val duration:       Long,
        val questionIndex:  Int,
        val totalQuestions: Int,
    ) : SessionEvent() {
        data class DecisionOption(val gesture: String, val label: String)
    }

    // relay → TV: ventana cerrada, ganador anunciado
    data class WindowClosed(val chosen: String) : SessionEvent()

    // relay → TV: capítulo reproduciéndose
    data class Watching(
        val chapterId:    String,
        val chapterTitle: String,
        val variantTag:   String,
    ) : SessionEvent()

    // relay → TV: historia terminó
    data object StoryEnd : SessionEvent()

    data class Vote(val viewer: Int, val decisionId: String, val action: String) : SessionEvent()

    data class Error(val message: String) : SessionEvent()
}
