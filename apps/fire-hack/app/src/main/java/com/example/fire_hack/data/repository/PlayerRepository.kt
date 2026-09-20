package com.example.fire_hack.data.repository

import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import com.example.fire_hack.data.source.PlayerSource
import kotlinx.coroutines.flow.StateFlow

@UnstableApi
class PlayerRepository(private val source: PlayerSource) {

    val currentPosition: StateFlow<Long> = source.currentPosition

    /**
     * Set this to receive playback-error notifications. The callback is invoked on the
     * main thread with the URL that failed (null if unknown). Wire it before playback
     * starts so fallback logic fires immediately on error.
     */
    var onError: ((failedUrl: String?) -> Unit)?
        get() = source.onError
        set(value) { source.onError = value }

    fun load(videoUri: String) = source.load(videoUri)

    fun play() = source.play()

    fun pause() = source.pause()

    fun seekTo(positionMs: Long) = source.seekTo(positionMs)

    /** Pre-fetch an upcoming clip so its branch transition plays without buffering. */
    fun preload(url: String) = source.preload(url)

    fun getPlayer(): ExoPlayer = source.player

    fun release() = source.release()
}
