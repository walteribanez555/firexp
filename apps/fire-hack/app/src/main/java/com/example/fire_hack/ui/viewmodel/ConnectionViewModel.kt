package com.example.fire_hack.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.fire_hack.data.model.SessionEvent
import com.example.fire_hack.domain.usecase.CreateSessionUseCase
import com.example.fire_hack.domain.usecase.WatchEventsUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed class ConnectionUiState {
    data object GeneratingSession : ConnectionUiState()
    data class ShowQr(val sessionId: String, val qrUrl: String) : ConnectionUiState()
    data class PhoneConnected(val sessionId: String) : ConnectionUiState()
}

class ConnectionViewModel(
    private val createSessionUseCase: CreateSessionUseCase,
    private val watchEventsUseCase: WatchEventsUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow<ConnectionUiState>(ConnectionUiState.GeneratingSession)
    val uiState: StateFlow<ConnectionUiState> = _uiState

    private val relayBaseUrl = com.example.fire_hack.Config.RELAY_HOST

    init { createSession() }

    private fun createSession() {
        val result = createSessionUseCase(relayBaseUrl)
        _uiState.value = ConnectionUiState.ShowQr(result.sessionId, result.qrUrl)
        listenForPhone(result.sessionId)
    }

    private fun listenForPhone(sessionId: String) {
        viewModelScope.launch {
            watchEventsUseCase(sessionId).collect { event ->
                if (event is SessionEvent.Assigned) {
                    _uiState.value = ConnectionUiState.PhoneConnected(sessionId)
                }
            }
        }
    }
}
