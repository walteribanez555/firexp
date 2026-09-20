package com.example.fire_hack.data.model

sealed class AppState {
    data object Connecting : AppState()
    data object WaitingQuestionnaire : AppState()
    data class LoadingRoute(val route: Route) : AppState()
    data class Playing(val route: Route) : AppState()
    data class DecisionWindow(val event: StoryEvent, val remainingMs: Long) : AppState()
    data class Ended(val finalRouteId: String) : AppState()
}
