package com.example.fire_hack.ui.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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

/** One viewer's questionnaire progress in the lobby. */
data class LobbyViewer(
    val initial: String,
    val name: String,
    val color: Color,
    val answered: Int,
    val total: Int,
) {
    val done: Boolean get() = total > 0 && answered >= total
    val fraction: Float get() = if (total > 0) answered.toFloat() / total else 0f
}

/**
 * Screen 4 — Lobby / Cuestionario.
 * Connected viewers answer a quiz on their phones; the cloud uses the answers
 * to pick the opening branch. Shows readiness before the episode starts.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun LobbyScreen(
    seriesTitle: String,
    episodeTitle: String,
    roomCode: String,
    viewers: List<LobbyViewer>,
) {
    val readyCount = viewers.count { it.done }
    val totalCount = viewers.size.coerceAtLeast(1)
    val readyFraction = readyCount.toFloat() / totalCount
    val pending = viewers.firstOrNull { !it.done }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Firexp.bg)
            .padding(horizontal = 56.dp, vertical = 48.dp),
    ) {
        // ── Header ───────────────────────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("WAITING ROOM", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Firexp.accent2)
                Text("$seriesTitle — $episodeTitle", fontSize = 34.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
            }
            Box(
                Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .border(1.dp, Firexp.line, RoundedCornerShape(8.dp))
                    .padding(horizontal = 14.dp, vertical = 8.dp)
            ) {
                Text("ROOM $roomCode", fontSize = 14.sp, color = Firexp.dim, fontFamily = FontFamily.Monospace)
            }
        }

        // ── Overall quiz progress ────────────────────────────────────────────
        Column(
            modifier = Modifier
                .padding(top = 36.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(Firexp.surface2)
                .padding(horizontal = 26.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("$readyCount of ${viewers.size} viewers ready", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Firexp.text)
                Text("Quiz determines the opening path", fontSize = 15.sp, color = Firexp.dim)
            }
            ProgressBar(fraction = readyFraction, height = 8.dp, filled = true)
        }

        // ── Viewer rows ──────────────────────────────────────────────────────
        Column(
            modifier = Modifier.padding(top = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            viewers.forEach { ViewerRow(it) }
        }

        Spacer(Modifier.weight(1f))

        // ── Start status pill ────────────────────────────────────────────────
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Box(
                Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(Firexp.surface3)
                    .padding(horizontal = 30.dp, vertical = 16.dp)
            ) {
                val label = if (pending == null) "Starting episode…" else "Start Episode — waiting on ${pending.name}"
                Text(label, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Firexp.dim)
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ViewerRow(v: LobbyViewer) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Firexp.surface)
            .padding(horizontal = 22.dp, vertical = 16.dp)
            .then(if (v.done) Modifier else Modifier),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Box(
            Modifier
                .size(42.dp)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(v.color, v.color.copy(alpha = 0.7f)))),
            contentAlignment = Alignment.Center,
        ) {
            Text(v.initial, fontWeight = FontWeight.Bold, color = Firexp.darkink)
        }
        Text(v.name, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = Firexp.text, modifier = Modifier.weight(1f))
        Box(Modifier.width(220.dp)) {
            ProgressBar(
                fraction = if (v.done) 1f else v.fraction,
                height = 6.dp,
                filled = v.done,
            )
        }
        Text(
            text = if (v.done) "${v.total} / ${v.total} · done" else "${v.answered} / ${v.total} · answering…",
            fontSize = 14.sp,
            color = Firexp.dim,
            modifier = Modifier.width(120.dp),
        )
    }
}

@Composable
private fun ProgressBar(fraction: Float, height: androidx.compose.ui.unit.Dp, filled: Boolean) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(height / 2))
            .background(Firexp.surface3)
    ) {
        Box(
            Modifier
                .fillMaxWidth(fraction.coerceIn(0f, 1f))
                .fillMaxHeight()
                .clip(RoundedCornerShape(height / 2))
                .background(
                    if (filled) Brush.horizontalGradient(listOf(Firexp.accent, Firexp.accent2))
                    else Brush.horizontalGradient(listOf(Firexp.dim, Firexp.dim))
                )
        )
    }
}
