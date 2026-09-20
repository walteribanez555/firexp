package com.example.fire_hack.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.fire_hack.data.model.Chapter
import com.example.fire_hack.data.model.SessionEvent
import com.example.fire_hack.data.repository.PlayerRepository
import com.example.fire_hack.domain.usecase.ResolveNextChapterUseCase
import com.example.fire_hack.domain.usecase.WatchEventsUseCase
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed class PlayerUiState {
    data object Loading : PlayerUiState()
    data class Playing(val chapter: Chapter) : PlayerUiState()
    data class DecisionWindow(val chapter: Chapter, val remainingMs: Long) : PlayerUiState()
    data class Ended(val finalChapterId: String) : PlayerUiState()
}

class PlayerViewModel(
    private val sessionId: String,
    private val initialChapterId: String,
    private val playerRepository: PlayerRepository,
    private val resolveNextChapter: ResolveNextChapterUseCase,
    private val watchEventsUseCase: WatchEventsUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow<PlayerUiState>(PlayerUiState.Loading)
    val uiState: StateFlow<PlayerUiState> = _uiState

    private var currentChapter: Chapter? = null
    private var decisionJob: Job? = null
    private var pendingDecisionId: String? = null

    val player get() = playerRepository.getPlayer()

    init {
        listenForDecisions()
        watchPlaybackPosition()
    }

    fun onVideoReady(chapter: Chapter) {
        currentChapter = chapter
        playerRepository.seekTo(chapter.videoIn)
        playerRepository.play()
        _uiState.value = PlayerUiState.Playing(chapter)
    }

    private fun watchPlaybackPosition() {
        viewModelScope.launch {
            playerRepository.currentPosition.collect { positionMs ->
                val chapter = currentChapter ?: return@collect

                val decisionAt = chapter.decisionAt
                if (decisionAt != null) {
                    val absoluteDecisionAt = chapter.videoIn + decisionAt
                    if (positionMs >= absoluteDecisionAt && _uiState.value is PlayerUiState.Playing) {
                        startDecisionWindow(chapter)
                    }
                }

                if (positionMs >= chapter.videoOut) {
                    resolveAndAdvance(chapter, pendingDecisionId)
                }
            }
        }
    }

    private fun startDecisionWindow(chapter: Chapter) {
        _uiState.value = PlayerUiState.DecisionWindow(chapter, chapter.decisionWindow)
        decisionJob = viewModelScope.launch {
            var remaining = chapter.decisionWindow
            while (remaining > 0) {
                delay(500)
                remaining -= 500
                if (_uiState.value is PlayerUiState.DecisionWindow) {
                    _uiState.value = PlayerUiState.DecisionWindow(chapter, remaining)
                }
            }
        }
    }

    private fun listenForDecisions() {
        viewModelScope.launch {
            watchEventsUseCase(sessionId).collect { event ->
                if (event is SessionEvent.WindowClosed) {
                    pendingDecisionId = event.chosen
                    decisionJob?.cancel()
                }
            }
        }
    }

    private fun resolveAndAdvance(current: Chapter, decisionId: String?) {
        val next = resolveNextChapter(current, decisionId)
        pendingDecisionId = null
        if (next == null) {
            playerRepository.pause()
            _uiState.value = PlayerUiState.Ended(current.id)
        } else {
            currentChapter = next
            playerRepository.seekTo(next.videoIn)
            _uiState.value = PlayerUiState.Playing(next)
        }
    }

    override fun onCleared() {
        super.onCleared()
        playerRepository.release()
    }
}
