package com.example.fire_hack.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.ui.PlayerView
import com.example.fire_hack.ui.component.ChapterTransition
import com.example.fire_hack.ui.component.DecisionOverlay
import com.example.fire_hack.ui.viewmodel.PlayerUiState
import com.example.fire_hack.ui.viewmodel.PlayerViewModel

@Composable
fun PlayerScreen(
    viewModel: PlayerViewModel,
    onEnded: (finalChapterId: String) -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    Box(Modifier.fillMaxSize()) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = viewModel.player
                    useController = false
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        when (val s = state) {
            is PlayerUiState.DecisionWindow -> {
                DecisionOverlay(
                    remainingMs = s.remainingMs,
                    totalMs = s.chapter.decisionWindow,
                    modifier = Modifier.align(Alignment.BottomCenter)
                )
            }
            is PlayerUiState.Ended -> {
                LaunchedEffect(s.finalChapterId) { onEnded(s.finalChapterId) }
            }
            else -> Unit
        }

        ChapterTransition(visible = state is PlayerUiState.Loading)
    }
}
