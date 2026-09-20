package com.example.fire_hack.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.example.fire_hack.ui.viewmodel.WaitingUiState
import com.example.fire_hack.ui.viewmodel.WaitingViewModel

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun WaitingScreen(
    viewModel: WaitingViewModel?,       // null in mock mode
    onReady: (chapterId: String) -> Unit,
) {
    // Mock mode: just show the waiting UI — caller handles navigation via debug bar
    if (viewModel == null) {
        WaitingContent()
        return
    }

    val state by viewModel.uiState.collectAsState()
    when (val s = state) {
        is WaitingUiState.AwaitingQuestionnaire -> WaitingContent()
        is WaitingUiState.Ready -> LaunchedEffect(s.initialChapterId) { onReady(s.initialChapterId) }  // initialChapterId is the chapterId from EpisodeStart
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun WaitingContent() {
    Column(
        Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator()
        Spacer(Modifier.height(24.dp))
        Text("Waiting for questionnaire to complete…")
    }
}
