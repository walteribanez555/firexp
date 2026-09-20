package com.example.fire_hack.deeplink

import android.app.PendingIntent
import android.content.Context

/** Builds PendingIntents that re-enter the app through a [DeepLink] VIEW intent. */
object DeepLinkPendingIntent {

    /**
     * A PendingIntent that, when fired (e.g. by a Fire TV recommendation card),
     * launches MainActivity with `firexp://episode/<id>` → the episode's room lobby.
     */
    fun forDeepLink(context: Context, deepLink: DeepLink, requestCode: Int): PendingIntent {
        val intent = deepLink.intent(context)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getActivity(context, requestCode, intent, flags)
    }
}
