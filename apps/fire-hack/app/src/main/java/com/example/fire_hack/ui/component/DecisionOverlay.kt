package com.example.fire_hack.ui.component

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.example.fire_hack.ui.theme.Firexp
import kotlin.math.ceil

/**
 * Screen 6 — Decision overlay (over Playing).
 * Full-screen dimmed vote UI: circular countdown, prompt, option cards with
 * live vote bars. Votes arrive over WS; the D-pad OK is the fallback selector.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun DecisionOverlay(
    remainingMs:      Long,
    totalMs:          Long,
    modifier:         Modifier = Modifier,
    prompt:           String = "",
    options:          List<String> = emptyList(),
    voteCounts:       Map<String, Int> = emptyMap(),
    onOptionSelected: () -> Unit = {},
) {
    val totalVotes = voteCounts.values.sum()
    val leader = voteCounts.maxByOrNull { it.value }?.key
    val secondsLeft = ceil(remainingMs.coerceAtLeast(0L) / 1000.0).toInt()
    val fraction = (remainingMs.toFloat() / totalMs.coerceAtLeast(1L)).coerceIn(0f, 1f)

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xB8050404)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(36.dp),
        ) {
            // Circular countdown
            Box(contentAlignment = Alignment.Center) {
                Canvas(Modifier.size(96.dp)) {
                    val stroke = 10.dp.toPx()
                    val inset = stroke / 2
                    val arcSize = Size(size.width - stroke, size.height - stroke)
                    drawArc(
                        color = Color(0x24FFFFFF),
                        startAngle = -90f, sweepAngle = 360f, useCenter = false,
                        topLeft = Offset(inset, inset), size = arcSize,
                        style = Stroke(width = stroke, cap = StrokeCap.Round),
                    )
                    drawArc(
                        color = Firexp.accent,
                        startAngle = -90f, sweepAngle = 360f * fraction, useCenter = false,
                        topLeft = Offset(inset, inset), size = arcSize,
                        style = Stroke(width = stroke, cap = StrokeCap.Round),
                    )
                }
                Text("$secondsLeft", fontSize = 34.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
            }

            if (prompt.isNotEmpty()) {
                Text(
                    prompt,
                    fontSize = 36.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White,
                    modifier = Modifier.widthIn(max = 900.dp),
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                options.forEach { label ->
                    val count = voteCounts[label] ?: 0
                    val pct = if (totalVotes > 0) count * 100 / totalVotes else 0
                    OptionCard(
                        label = label,
                        pct = pct,
                        count = count,
                        fraction = if (totalVotes > 0) count.toFloat() / totalVotes else 0f,
                        leading = label == leader && count > 0,
                        onSelect = onOptionSelected,
                    )
                }
            }

            Text(
                "$totalVotes votes live · resolves in ${secondsLeft}s",
                fontSize = 14.sp,
                color = Firexp.faint,
            )
        }
    }
}

@Composable
private fun OptionCard(
    label: String,
    pct: Int,
    count: Int,
    fraction: Float,
    leading: Boolean,
    onSelect: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val highlight = leading || focused

    Column(
        modifier = Modifier
            .width(340.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Firexp.surface)
            .border(
                width = if (highlight) 4.dp else 1.dp,
                color = if (highlight) Firexp.accent else Firexp.line,
                shape = RoundedCornerShape(14.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .clickable(onClick = onSelect)
            .padding(22.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(label, fontSize = 19.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Box(
            Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(Firexp.surface3)
        ) {
            Box(
                Modifier
                    .fillMaxWidth(fraction.coerceIn(0f, 1f))
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(4.dp))
                    .background(
                        if (highlight) Brush.horizontalGradient(listOf(Firexp.accent, Firexp.accent2))
                        else Brush.horizontalGradient(listOf(Firexp.dim, Firexp.dim))
                    )
            )
        }
        Text("$pct% · $count votes", fontSize = 14.sp, color = Firexp.dim)
    }
}
