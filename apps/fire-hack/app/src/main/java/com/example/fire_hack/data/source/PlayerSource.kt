package com.example.fire_hack.data.source

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File

/**
 * ExoPlayer wrapper backed by a disk media cache so upcoming branch clips can be
 * pre-fetched. [preload] warms the cache for a URL on a background thread; when the
 * main player later plays that URL it reads from cache — the branch transition has
 * no visible buffering. This keeps the interactive story continuous.
 *
 * [onError] is invoked (on the main thread, from the ExoPlayer listener) with the URL
 * that failed so callers can immediately try a fallback clip. The player is cleared
 * before the callback fires so the screen is ready for the substitute load.
 */
@UnstableApi
class PlayerSource(context: Context) {

    private val httpFactory = DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(true)
    private val cacheFactory = CacheDataSource.Factory()
        .setCache(getCache(context))
        .setUpstreamDataSourceFactory(httpFactory)
        .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

    // Accept a wide range of formats/containers (MP4, WebM/Matroska, MOV, TS, ADTS…) and
    // enable decoder fallback so an unsupported hardware codec/resolution (e.g. 1080p@60 on
    // an emulator's software decoder) falls back instead of failing. DefaultMediaSourceFactory
    // infers the container from the URI/content-type.
    private val renderersFactory = DefaultRenderersFactory(context)
        .setEnableDecoderFallback(true)
        .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)

    val player: ExoPlayer = ExoPlayer.Builder(context, renderersFactory)
        .setMediaSourceFactory(DefaultMediaSourceFactory(cacheFactory))
        .build()

    private val _currentPosition = MutableStateFlow(0L)
    val currentPosition: StateFlow<Long> = _currentPosition

    /**
     * Called on the main thread when ExoPlayer reports a fatal playback error.
     * The parameter is the URL that was playing when the error occurred (may be null
     * if no media was loaded). Set this before calling [load] so the callback is in
     * place when the player is started.
     */
    var onError: ((failedUrl: String?) -> Unit)? = null

    /** The URL most recently passed to [load], tracked so [onError] can report it. */
    private var lastLoadedUrl: String? = null

    private val preloadScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    init {
        player.addListener(object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) {
                _currentPosition.value = player.currentPosition
            }

            // A bad/unsupported clip must not crash the app. Clear the failed media so
            // the surface is clean, then notify the caller so it can load a fallback clip.
            // The delay-based story timeline keeps advancing regardless.
            override fun onPlayerError(error: PlaybackException) {
                val failedUrl = lastLoadedUrl
                Log.e(TAG, "Playback error (${error.errorCodeName}) url=$failedUrl — trying fallback", error)
                player.clearMediaItems()
                onError?.invoke(failedUrl)
            }
        })
    }

    fun load(videoUri: String) {
        lastLoadedUrl = videoUri
        player.setMediaItem(MediaItem.fromUri(videoUri))
        player.prepare()
    }

    fun play() = player.play()

    fun pause() = player.pause()

    fun seekTo(positionMs: Long) = player.seekTo(positionMs)

    /** Pre-fetch a clip into the media cache so its later playback is instant. No-op on failure. */
    fun preload(url: String) {
        preloadScope.launch {
            runCatching {
                val dataSource = cacheFactory.createDataSource()
                CacheWriter(dataSource, DataSpec(Uri.parse(url)), null, null).cache()
            }
        }
    }

    fun release() {
        preloadScope.cancel()
        player.release()
    }

    companion object {
        private const val TAG = "PlayerSource"

        @Volatile private var cache: SimpleCache? = null

        @UnstableApi
        private fun getCache(context: Context): SimpleCache =
            cache ?: synchronized(this) {
                cache ?: SimpleCache(
                    File(context.cacheDir, "media"),
                    LeastRecentlyUsedCacheEvictor(512L * 1024 * 1024), // 512 MB LRU
                ).also { cache = it }
            }
    }
}
