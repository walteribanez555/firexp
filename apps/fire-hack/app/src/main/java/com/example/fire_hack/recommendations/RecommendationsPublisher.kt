package com.example.fire_hack.recommendations

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.getSystemService
import com.example.fire_hack.R
import com.example.fire_hack.data.model.Series
import com.example.fire_hack.deeplink.DeepLink
import com.example.fire_hack.deeplink.DeepLinkPendingIntent
import com.example.fire_hack.data.model.EpisodeSummary
import java.net.URL

/**
 * Publishes Fire TV home-screen recommendation cards.
 *
 * Fire OS surfaces the classic Android-TV recommendation mechanism: a notification
 * posted into the [NotificationManager] with [Notification.CATEGORY_RECOMMENDATION]
 * and a full-screen `bigContentView`/large-icon art. Fire TV's launcher reads these
 * and renders them as cards in the "Recommendations"/home row. Clicking a card fires
 * the card's content [android.app.PendingIntent], which here re-enters the app via a
 * `firexp://episode/<id>` deep link — dropping the viewer straight back into the room
 * lobby for that episode.
 *
 * This uses only `androidx.core` (NotificationCompat) — no extra dependency and no
 * `tvprovider`/preview-channel requirement — so it compiles cleanly on this project's
 * compileSdk 37 target.
 *
 * NOTE: the row only *renders* on a real Fire TV (the launcher consuming these
 * notifications). On the emulator / a phone the notification is posted but not shown
 * as a card — that is expected. All failures are caught and logged; publishing never
 * crashes the app. The deep link the card points at works on any device.
 */
class RecommendationsPublisher(private val context: Context) {

    /**
     * Post one recommendation card per episode in [catalog] (capped at [MAX_CARDS]).
     * Should be called off the main thread (art is fetched over the network).
     */
    fun publish(catalog: List<Series>) {
        if (catalog.isEmpty()) {
            Log.i(TAG, "No catalog — nothing to recommend.")
            return
        }
        ensureChannel()

        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) {
            Log.w(TAG, "Notifications disabled — recommendation row will not appear.")
        }

        var priority = MAX_CARDS
        var posted = 0
        outer@ for (series in catalog) {
            for (episode in series.episodes) {
                if (posted >= MAX_CARDS) break@outer
                runCatching { postCard(series, episode, priority--) }
                    .onFailure { Log.w(TAG, "Failed to post card for ${episode.id}: ${it.message}") }
                posted++
            }
        }
        Log.i(TAG, "Published $posted recommendation card(s).")
    }

    /** Remove all previously published recommendation cards. */
    fun clear() {
        val nm = context.getSystemService<NotificationManager>() ?: return
        nm.cancelAll()
    }

    private fun postCard(series: Series, episode: EpisodeSummary, priority: Int) {
        val deepLink = DeepLink(episodeId = episode.id, seriesId = series.id)
        val contentIntent = DeepLinkPendingIntent.forDeepLink(context, deepLink, requestCode = episode.id.hashCode())

        val art: Bitmap? = loadArt(episode.thumbnailUrl.ifBlank { series.thumbnailUrl })

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle("Continue your room's story — ${episode.title}")
            .setContentText(series.title)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(contentIntent)
            .setAutoCancel(false)
            .setOngoing(false)
            .setLocalOnly(false)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setColor(BRAND_COLOR)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        if (art != null) {
            builder.setLargeIcon(art)
            builder.setStyle(NotificationCompat.BigPictureStyle().bigPicture(art))
        }

        // Stable id per episode so re-publishing replaces (not stacks) the card.
        val notificationId = NOTIFICATION_ID_BASE + (episode.id.hashCode() and 0xFFFF)
        NotificationManagerCompat.from(context).notify(notificationId, builder.build())
        Log.i(TAG, "Posted card id=$notificationId episode=${episode.id} → ${deepLink.toUri()}")
    }

    private fun loadArt(url: String?): Bitmap? {
        if (url.isNullOrBlank()) return null
        return runCatching {
            URL(url).openStream().use { BitmapFactory.decodeStream(it) }
        }.onFailure { Log.w(TAG, "Art load failed for $url: ${it.message}") }.getOrNull()
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService<NotificationManager>() ?: return
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Continue watching",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Fire TV home-screen recommendations for your interactive rooms."
            setShowBadge(false)
        }
        nm.createNotificationChannel(channel)
    }

    private companion object {
        const val TAG = "Recommendations"
        const val CHANNEL_ID = "firexp_recommendations"
        const val NOTIFICATION_ID_BASE = 0x51E00
        const val MAX_CARDS = 6
        const val BRAND_COLOR = 0xFFE94F1D.toInt()
    }
}
