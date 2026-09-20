package com.example.fire_hack.ui.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.example.fire_hack.ui.theme.Firexp

/**
 * Screen 8 — Final (Ended).
 * Shows the ending reached, the endings gallery (unlocked + locked) and the
 * replay / back-to-catalog actions.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun EndingScreen(
    finalChapterId: String,
    onRestart: () -> Unit,
    onBackToCatalog: () -> Unit = onRestart,
    endingName: String = finalChapterId.uppercase(),
    totalEndings: Int = 4,
) {
    val watchAgainFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { watchAgainFocus.requestFocus() } }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.radialGradient(colors = listOf(Color(0xFF160F0C), Firexp.bg), radius = 1100f)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(32.dp),
        ) {
            Box(
                Modifier
                    .size(88.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(Brush.linearGradient(listOf(Firexp.accent2, Firexp.accent, Color(0xFFA31F0C))))
            )
            Text("ENDING REACHED", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Firexp.accent2)
            Text(endingName, fontSize = 52.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
            Text("You experienced 1 of $totalEndings possible endings", fontSize = 17.sp, color = Firexp.dim)

            // Endings gallery — reached ending unlocked, the rest locked
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                EndingTile(label = endingName, unlocked = true)
                repeat(totalEndings - 1) { EndingTile(label = "LOCKED", unlocked = false) }
            }

            // Actions
            Row(
                modifier = Modifier.padding(top = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                ActionButton(text = "Watch Again", primary = true, focusRequester = watchAgainFocus, onClick = onRestart)
                ActionButton(text = "Back to Catalog", primary = false, onClick = onBackToCatalog)
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun EndingTile(label: String, unlocked: Boolean) {
    Box(
        Modifier
            .width(150.dp)
            .height(84.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(
                if (unlocked) Brush.linearGradient(listOf(Firexp.accent2, Firexp.accent))
                else Brush.linearGradient(listOf(Firexp.surface2, Firexp.surface2))
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = if (unlocked) label else "LOCKED",
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = if (unlocked) Firexp.darkink else Firexp.faint,
        )
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ActionButton(
    text: String,
    primary: Boolean,
    focusRequester: FocusRequester? = null,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    Box(
        Modifier
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .clip(RoundedCornerShape(10.dp))
            .background(
                if (primary) Brush.linearGradient(listOf(Firexp.accent2, Firexp.accent))
                else Brush.linearGradient(listOf(Firexp.surface2, Firexp.surface2))
            )
            .border(
                width = if (focused) 3.dp else 0.dp,
                color = if (focused) Color.White else Color.Transparent,
                shape = RoundedCornerShape(10.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .clickable(onClick = onClick)
            .padding(horizontal = 34.dp, vertical = 16.dp),
    ) {
        Text(
            text,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = if (primary) Firexp.darkink else Firexp.text,
        )
    }
}
