package com.example.fire_hack.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.example.fire_hack.ui.component.QrCodeView
import com.example.fire_hack.ui.viewmodel.ConnectionUiState
import com.example.fire_hack.ui.viewmodel.ConnectionViewModel

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ConnectionScreen(
    viewModel: ConnectionViewModel,
    onPhoneConnected: (sessionId: String) -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    when (val s = state) {
        is ConnectionUiState.GeneratingSession -> {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Iniciando sesión...")
            }
        }
        is ConnectionUiState.ShowQr -> {
            Column(
                Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text("Escanea con tu teléfono para unirte")
                Spacer(Modifier.height(32.dp))
                QrCodeView(url = s.qrUrl, size = 200.dp)
                Spacer(Modifier.height(16.dp))
                Text("Código: ${s.sessionId}")
            }
        }
        is ConnectionUiState.PhoneConnected -> {
            LaunchedEffect(s.sessionId) { onPhoneConnected(s.sessionId) }
        }
    }
}
