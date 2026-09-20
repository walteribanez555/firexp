package com.example.fire_hack.ui.component

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.example.fire_hack.ui.theme.Firexp

/**
 * Screen 7 — Chapter transition (over Playing).
 * Brief pulsing-ember overlay that masks the seek to the chosen branch.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ChapterTransition(visible: Boolean, branchLabel: String? = null) {
    AnimatedVisibility(visible = visible, enter = fadeIn(), exit = fadeOut()) {
        val transition = rememberInfiniteTransition(label = "ember")
        val scale by transition.animateFloat(
            initialValue = 1f, targetValue = 1.08f,
            animationSpec = infiniteRepeatable(tween(700, easing = FastOutSlowInEasing), RepeatMode.Reverse),
            label = "emberScale",
        )

        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0xD1050404)),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(26.dp),
            ) {
                Box(
                    Modifier
                        .size(64.dp)
                        .scale(scale)
                        .clip(CircleShape)
                        .background(Brush.radialGradient(listOf(Firexp.accent2, Firexp.accent)))
                )
                Text("Choosing your path…", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color.White)
                if (!branchLabel.isNullOrEmpty()) {
                    Text("Branch: $branchLabel", fontSize = 15.sp, color = Firexp.dim)
                }
            }
        }
    }
}
