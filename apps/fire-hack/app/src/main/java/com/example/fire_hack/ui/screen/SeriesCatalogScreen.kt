package com.example.fire_hack.ui.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.*
import com.example.fire_hack.Config
import com.example.fire_hack.data.model.EpisodeSummary
import com.example.fire_hack.data.model.Series
import com.example.fire_hack.ui.component.NetworkImage
import com.example.fire_hack.ui.theme.Firexp

/** Resolve a relative "/images/..." media path against the relay host. */
private fun resolveMedia(url: String?): String? =
    when {
        url.isNullOrBlank() -> null
        url.startsWith("/") -> Config.RELAY_HOST + url
        else                -> url
    }

/**
 * Screen 2 — Catálogo.
 * Top nav + featured hero + "All Series" card row. D-pad navigation.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SeriesCatalogScreen(
    series: List<Series>,
    onEpisodeSelected: (Series, EpisodeSummary) -> Unit,
) {
    val hero = series.firstOrNull()
    val heroEpisode = hero?.episodes?.firstOrNull()
    val heroFocus = remember { FocusRequester() }

    LaunchedEffect(Unit) { runCatching { heroFocus.requestFocus() } }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Firexp.bg)
            .verticalScroll(rememberScrollState())
            .padding(bottom = 40.dp),
    ) {
        // ── Top nav ──────────────────────────────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 56.dp, end = 56.dp, top = 32.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(32.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(
                        Modifier
                            .size(22.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(Brush.linearGradient(listOf(Firexp.accent2, Firexp.accent)))
                    )
                    Text("Firexp", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Firexp.text)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                    Text("Continue Watching", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Firexp.text)
                    Text("All Series", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Firexp.dim)
                    Text("New", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Firexp.dim)
                }
            }
            Text(
                "◀▲▼▶ navigate · OK select",
                fontSize = 13.sp,
                color = Firexp.faint,
                fontFamily = FontFamily.Monospace,
            )
        }

        // ── Featured hero ────────────────────────────────────────────────────
        if (hero != null && heroEpisode != null) {
            FeaturedHero(
                series = hero,
                episode = heroEpisode,
                focusRequester = heroFocus,
                onClick = { onEpisodeSelected(hero, heroEpisode) },
            )
        }

        // ── All Series row ───────────────────────────────────────────────────
        Text(
            "All Series",
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            color = Firexp.dim,
            modifier = Modifier.padding(start = 56.dp, top = 32.dp),
        )
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(20.dp),
            contentPadding = PaddingValues(start = 56.dp, end = 56.dp, top = 16.dp),
        ) {
            items(series) { s ->
                val ep = s.episodes.firstOrNull()
                SeriesCard(series = s, onClick = { ep?.let { onEpisodeSelected(s, it) } })
            }
        }
    }
}

@Composable
private fun FeaturedHero(
    series: Series,
    episode: EpisodeSummary,
    focusRequester: FocusRequester,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .padding(start = 56.dp, end = 56.dp, top = 28.dp)
            .fillMaxWidth()
            .height(400.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF241A16), Color(0xFF2C1A12), Color(0xFF1A1210))))
            .border(
                width = if (focused) 4.dp else 1.dp,
                color = if (focused) Firexp.accent else Firexp.line,
                shape = RoundedCornerShape(18.dp),
            )
            .focusRequester(focusRequester)
            .onFocusChanged { focused = it.isFocused }
            .clickable(onClick = onClick),
    ) {
        // Thumbnail as the hero background (falls back to the gradient while loading)
        NetworkImage(url = resolveMedia(series.thumbnailUrl), modifier = Modifier.matchParentSize())
        // left-side darkening scrim (over the image, for text legibility)
        Box(
            Modifier
                .fillMaxSize()
                .background(Brush.horizontalGradient(listOf(Color(0xD9000000), Color(0x40000000))))
        )
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 48.dp, bottom = 44.dp)
                .widthIn(max = 640.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("SERIES · INTERACTIVE FICTION", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Firexp.accent2)
            Text(series.title.uppercase(), fontSize = 44.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
            Text("Ep. ${episode.number} · ${episode.title}", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Firexp.text)
            Text(series.description, fontSize = 15.sp, color = Firexp.dim)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.padding(top = 10.dp),
            ) {
                Box(
                    Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(Firexp.darkink),
                    contentAlignment = Alignment.Center,
                ) { Text("▶", fontSize = 20.sp, color = Color.White) }
                Text("Press OK to start", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Firexp.text)
            }
        }
    }
}

@Composable
private fun SeriesCard(
    series: Series,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    Box(
        modifier = Modifier
            .width(220.dp)
            .height(130.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF241416), Color(0xFF150C0E))))
            .border(
                width = if (focused) 3.dp else 1.dp,
                color = if (focused) Firexp.accent else Firexp.line,
                shape = RoundedCornerShape(12.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .clickable(onClick = onClick),
        contentAlignment = Alignment.BottomStart,
    ) {
        // Thumbnail as the card background (falls back to the gradient above while loading)
        NetworkImage(url = resolveMedia(series.thumbnailUrl), modifier = Modifier.matchParentSize())
        // Scrim for text legibility
        Box(
            Modifier
                .matchParentSize()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xE6000000))))
        )
        Text(
            series.title.uppercase(),
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier.padding(14.dp),
        )
    }
}
