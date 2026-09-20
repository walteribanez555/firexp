package com.example.fire_hack.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.fire_hack.data.model.SessionEvent
import com.example.fire_hack.domain.usecase.WatchEventsUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed class WaitingUiState {
    data object AwaitingQuestionnaire : WaitingUiState()
    data class Ready(val initialChapterId: String) : WaitingUiState()
}

class WaitingViewModel(
    private val sessionId: String,
    private val watchEventsUseCase: WatchEventsUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow<WaitingUiState>(WaitingUiState.AwaitingQuestionnaire)
    val uiState: StateFlow<WaitingUiState> = _uiState

    init { waitForQuestionnaire() }

    private fun waitForQuestionnaire() {
        viewModelScope.launch {
            watchEventsUseCase(sessionId).collect { event ->
                if (event is SessionEvent.EpisodeStart) {
                    _uiState.value = WaitingUiState.Ready(event.chapterId)
                }
            }
        }
    }
}
