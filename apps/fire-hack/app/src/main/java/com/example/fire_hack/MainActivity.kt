package com.example.fire_hack

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Surface
import com.example.fire_hack.ui.AppNavigation
import com.example.fire_hack.ui.theme.FirehackTheme

class MainActivity : ComponentActivity() {

    // The mockups are authored on a 1920×1080 canvas, so every size is expressed
    // in "mockup pixels" used directly as dp. Anchor the layout to that reference
    // width: on a 1080p panel 1dp == 1px (pixel-perfect), and it scales up cleanly
    // on 4K panels instead of everything rendering at 2× on high-density TVs.
    private companion object { const val DESIGN_WIDTH_PX = 1920f }

    @OptIn(ExperimentalTvMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val widthPx = LocalContext.current.resources.displayMetrics.widthPixels.toFloat()
            // guard against a 0 width during early layout
            val scale = (if (widthPx > 0f) widthPx else DESIGN_WIDTH_PX) / DESIGN_WIDTH_PX
            val fontScale = LocalDensity.current.fontScale
            LocalConfiguration.current // recompose on configuration/orientation change

            CompositionLocalProvider(
                LocalDensity provides Density(density = scale, fontScale = fontScale),
            ) {
                FirehackTheme {
                    Surface(shape = RectangleShape) {
                        AppNavigation()
                    }
                }
            }
        }
    }
}
