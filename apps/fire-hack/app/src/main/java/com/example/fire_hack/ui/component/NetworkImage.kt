package com.example.fire_hack.ui.component

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

private val imageClient = OkHttpClient()

/**
 * Lightweight network image — decodes a remote bitmap with OkHttp + BitmapFactory
 * (no extra image-loading dependency). Renders nothing until the bitmap is ready;
 * pass a fallback behind it. Safe for catalog thumbnails.
 */
@Composable
fun NetworkImage(
    url: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
) {
    val bitmap by produceState<ImageBitmap?>(initialValue = null, url) {
        value = if (url.isNullOrBlank()) null else withContext(Dispatchers.IO) {
            runCatching {
                imageClient.newCall(Request.Builder().url(url).build()).execute().use { resp ->
                    resp.body?.byteStream()?.let { BitmapFactory.decodeStream(it)?.asImageBitmap() }
                }
            }.getOrNull()
        }
    }

    bitmap?.let {
        Image(bitmap = it, contentDescription = null, modifier = modifier, contentScale = contentScale)
    }
}
