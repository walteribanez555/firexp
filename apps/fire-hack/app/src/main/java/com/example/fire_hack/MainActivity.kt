package com.example.fire_hack

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Surface
import com.example.fire_hack.deeplink.DeepLink
import com.example.fire_hack.ui.AppNavigation
import com.example.fire_hack.ui.theme.FirehackTheme

class MainActivity : ComponentActivity() {

    // The mockups are authored on a 1920×1080 canvas, so every size is expressed
    // in "mockup pixels" used directly as dp. Anchor the layout to that reference
    // width: on a 1080p panel 1dp == 1px (pixel-perfect), and it scales up cleanly
    // on 4K panels instead of everything rendering at 2× on high-density TVs.
    private companion object {
        const val DESIGN_WIDTH_PX = 1920f
        const val TAG = "MainActivity"
    }

    // Holds a deep-link target (episodeId[, seriesId]) parsed from the launch/new
    // intent. AppNavigation observes this and, once the catalog is loaded, jumps
    // straight into that episode's room lobby — bypassing the catalog screen.
    private var deepLinkState = mutableStateOf<DeepLink?>(null)

    @OptIn(ExperimentalTvMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Cold-start deep link (app launched by the intent, e.g. from a Fire TV
        // home-screen recommendation card or `adb shell am start ... -d firexp://…`).
        deepLinkState.value = parseDeepLink(intent)

        setContent {
            val widthPx = LocalContext.current.resources.displayMetrics.widthPixels.toFloat()
            // guard against a 0 width during early layout
            val scale = (if (widthPx > 0f) widthPx else DESIGN_WIDTH_PX) / DESIGN_WIDTH_PX
            val fontScale = LocalDensity.current.fontScale
            LocalConfiguration.current // recompose on configuration/orientation change

            val deepLink by remember { deepLinkState }

            CompositionLocalProvider(
                LocalDensity provides Density(density = scale, fontScale = fontScale),
            ) {
                FirehackTheme {
                    Surface(shape = RectangleShape) {
                        AppNavigation(
                            deepLink = deepLink,
                            onDeepLinkConsumed = { deepLinkState.value = null },
                        )
                    }
                }
            }
        }
    }

    // Warm-start deep link (app already running when the VIEW intent arrives).
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        parseDeepLink(intent)?.let {
            Log.i(TAG, "onNewIntent deep link → $it")
            deepLinkState.value = it
        }
    }

    /** Parse `firexp://episode/<id>[?series=<id>]` from a VIEW intent, or null. */
    private fun parseDeepLink(intent: Intent?): DeepLink? {
        if (intent?.action != Intent.ACTION_VIEW) return null
        val data: Uri = intent.data ?: return null
        val link = DeepLink.fromUri(data)
        if (link == null) {
            Log.w(TAG, "Unrecognised VIEW uri: $data")
        } else {
            Log.i(TAG, "Deep link resolved: $link")
        }
        return link
    }
}
