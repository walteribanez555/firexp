package com.example.fire_hack.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.fire_hack.ui.theme.Firexp

/**
 * The Firexp brand mark: an ember gradient square + the "Firexp" wordmark.
 * Shared across the TV app (catalog, splash, lobby) and mirrored by the web
 * dashboard sidebar, so the logo is identical everywhere.
 */
@Composable
fun FirexpLogo(
    modifier: Modifier = Modifier,
    fontSize: Int = 18,
) {
    val mark = (fontSize * 1.2f).dp
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy((fontSize * 0.5f).dp),
    ) {
        Box(
            Modifier
                .size(mark)
                .clip(RoundedCornerShape((fontSize * 0.33f).dp))
                .background(Brush.linearGradient(listOf(Firexp.accent2, Firexp.accent)))
        )
        Text(
            "Firexp",
            fontSize = fontSize.sp,
            fontWeight = FontWeight.ExtraBold,
            color = Firexp.text,
        )
    }
}
