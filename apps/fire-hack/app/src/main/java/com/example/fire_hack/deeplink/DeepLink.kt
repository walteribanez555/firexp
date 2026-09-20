package com.example.fire_hack.deeplink

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.example.fire_hack.MainActivity

/**
 * A parsed `firexp://` deep link into the app.
 *
 * Canonical form: `firexp://episode/<episodeId>[?series=<seriesId>]`
 *
 * Used in two directions:
 *  - Inbound: MainActivity parses a VIEW intent's data URI into a [DeepLink] and
 *    hands it to AppNavigation, which jumps straight to that episode's room lobby.
 *  - Outbound: the Fire TV home-screen recommendation cards build a VIEW intent
 *    ([intent]) wrapped in a PendingIntent so a click re-enters the same lobby.
 */
data class DeepLink(
    val episodeId: String,
    val seriesId: String? = null,
) {
    /** `firexp://episode/<episodeId>[?series=<seriesId>]` */
    fun toUri(): Uri {
        val b = Uri.Builder()
            .scheme(SCHEME)
            .authority(HOST_EPISODE)
            .appendPath(episodeId)
        if (!seriesId.isNullOrBlank()) b.appendQueryParameter(QUERY_SERIES, seriesId)
        return b.build()
    }

    /** An explicit VIEW intent targeting MainActivity for this deep link. */
    fun intent(context: Context): Intent =
        Intent(Intent.ACTION_VIEW, toUri(), context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }

    companion object {
        const val SCHEME = "firexp"
        const val HOST_EPISODE = "episode"
        const val QUERY_SERIES = "series"

        /**
         * Parse `firexp://episode/<episodeId>[?series=<seriesId>]`.
         * Returns null for any URI that isn't a well-formed episode deep link.
         */
        fun fromUri(uri: Uri?): DeepLink? {
            if (uri == null) return null
            if (!uri.scheme.equals(SCHEME, ignoreCase = true)) return null
            if (!uri.host.equals(HOST_EPISODE, ignoreCase = true)) return null
            val episodeId = uri.pathSegments.firstOrNull()?.takeIf { it.isNotBlank() } ?: return null
            val seriesId = uri.getQueryParameter(QUERY_SERIES)?.takeIf { it.isNotBlank() }
            return DeepLink(episodeId = episodeId, seriesId = seriesId)
        }
    }
}
