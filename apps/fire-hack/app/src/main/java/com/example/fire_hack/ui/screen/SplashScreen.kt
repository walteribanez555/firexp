package com.example.fire_hack.ui.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.example.fire_hack.ui.theme.Firexp

/**
 * Screen 1 — Splash / Loading.
 * Shows branding while the catalog loads from the relay.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SplashScreen(statusLine: String = "relay: connecting… · offline catalog ready as fallback") {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0xFF160F0C), Firexp.bg),
                    radius = 1100f,
                )
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(104.dp)
                    .clip(RoundedCornerShape(26.dp))
                    .background(
                        Brush.linearGradient(listOf(Firexp.accent2, Firexp.accent, Color(0xFFA31F0C)))
                    )
            )
            Text("Firexp", fontSize = 56.sp, fontWeight = FontWeight.ExtraBold, color = Firexp.text)
            Text(
                "Choose the story.",
                fontSize = 20.sp,
                fontWeight = FontWeight.Medium,
                color = Firexp.dim,
                modifier = Modifier.offset(y = (-14).dp),
            )
            LinearProgressIndicator(
                modifier = Modifier
                    .padding(top = 18.dp)
                    .width(340.dp)
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp)),
                color = Firexp.accent,
                trackColor = Firexp.surface2,
            )
            Text(
                "Loading catalog from relay…",
                fontSize = 15.sp,
                color = Firexp.faint,
                modifier = Modifier.offset(y = (-14).dp),
            )
        }

        Text(
            text = "v1.4 · $statusLine",
            fontSize = 13.sp,
            color = Firexp.faint,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 36.dp),
        )
    }
}
